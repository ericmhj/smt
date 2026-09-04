import { createRemoteJWKSet, jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import type { AuthStrategy } from './auth-strategy.factory.js';
import type { JWTPayload, LoginDTO } from './auth.types.js';
import { AuthError } from './auth.service.js';
import { KeycloakClient, type KeycloakClientConfig } from './keycloak-client.js';
import { LicenseClient, type LicenseClientConfig } from './license-client.js';
import { db, getSqlClient } from '../../db/index.js';
import { tenants } from '../../db/schema/platform.js';
import { toSchemaName } from '../../lib/tenant-schema.js';

export interface IntegratedAuthConfig {
  keycloakTokenUrl: string;
  keycloakClientId: string;
  keycloakClientSecret: string;
  keycloakJwksUrl: string;
  keycloakIssuer: string;
  keycloakJwksCacheTtl: number;
  licenseServiceBaseUrl: string;
  licenseServiceTimeoutMs: number;
  licenseServiceCircuitBreaker: {
    failureThreshold: number;
    resetTimeoutMs: number;
  };
}

export interface CascadeLoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    tenantSlug: string;
  };
  tenant: {
    slug: string;
    nombre: string;
    plan: string;
  };
}

/**
 * Integrated authentication strategy that orchestrates the full cascade:
 * 1. Keycloak Direct Access Grant (validate credentials)
 * 2. License Service check (validate tenant license is active)
 * 3. Local tenant DB lookup (validate tenant exists and is active)
 */
export class IntegratedAuthStrategy implements AuthStrategy {
  private jwks: ReturnType<typeof createRemoteJWKSet>;
  private issuer: string;
  private keycloakClient: KeycloakClient;
  private licenseClient: LicenseClient;

  constructor(config: IntegratedAuthConfig) {
    this.issuer = config.keycloakIssuer;
    this.jwks = createRemoteJWKSet(new URL(config.keycloakJwksUrl), {
      cacheMaxAge: config.keycloakJwksCacheTtl * 1000,
    });

    const keycloakConfig: KeycloakClientConfig = {
      tokenUrl: config.keycloakTokenUrl,
      clientId: config.keycloakClientId,
      clientSecret: config.keycloakClientSecret,
    };
    this.keycloakClient = new KeycloakClient(keycloakConfig);

    const licenseConfig: LicenseClientConfig = {
      baseUrl: config.licenseServiceBaseUrl,
      timeoutMs: config.licenseServiceTimeoutMs,
      circuitBreaker: config.licenseServiceCircuitBreaker,
    };
    this.licenseClient = new LicenseClient(licenseConfig);
  }

  /**
   * Verify a Keycloak-issued JWT token using JWKS.
   */
  async verifyToken(token: string): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
      });

      // Ensure the Keycloak session behind this token is still active. This
      // makes session revocation (e.g. after a password change) take effect
      // immediately, instead of waiting for the short-lived access token to
      // expire. Fail-open on Keycloak outages (see KeycloakClient.isTokenActive).
      const active = await this.keycloakClient.isTokenActive(token);
      if (!active) {
        throw new AuthError(401, 'AUTH_004', 'Sesión finalizada, inicie sesión nuevamente');
      }

      const roles: string[] =
        (payload.roles as string[]) ||
        (payload.realm_access as { roles: string[] })?.roles ||
        [];

      // Filter out Keycloak internal roles, keep only application roles
      const APP_ROLES = ['platform_admin', 'superusuario', 'admin', 'manager', 'tecnico', 'asistente'];
      const appRoles = roles.filter((r) => APP_ROLES.includes(r));
      const role = appRoles[0] || roles[0] || 'tecnico';

      // Read the tenant the user actually belongs to from the trusted token claim.
      // Keycloak maps the user's `tenant_slug` attribute into this claim (mikel-crm realm).
      // This is the authoritative tenant binding — it must NOT be overridden by the
      // request subdomain/header for non-platform_admin users (see tenant.middleware).
      const tenantSlug = (payload.tenant_slug as string) || '';

      return {
        sub: payload.sub as string,
        role,
        tenantId: (payload.tenant_id as string) || '',
        tenantSlug,
        iat: payload.iat as number,
        exp: payload.exp as number,
        jti: payload.jti as string,
      };
    } catch (error: any) {
      // Preserve explicit auth errors (e.g. revoked session) with their message.
      if (error instanceof AuthError) {
        throw error;
      }
      if (error?.code === 'ERR_JWT_EXPIRED') {
        throw new AuthError(401, 'AUTH_002', 'Token expirado');
      }
      if (error?.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
        throw new AuthError(401, 'AUTH_INVALID_TOKEN', 'Firma de token inválida');
      }
      throw new AuthError(401, 'AUTH_INVALID_TOKEN', 'Token inválido');
    }
  }

  /**
   * Login is enabled in integrated mode — this strategy handles it via cascade.
   */
  isLoginEnabled(): boolean {
    return true;
  }

  /**
   * Orchestrates the full cascade login:
   * 1. Authenticate against Keycloak (Direct Access Grant)
   * 2. Check license status via License Service
   * 3. Verify tenant exists and is active in local DB
   *
   * @throws AuthError with appropriate status/code for each cascade failure
   */
  async login(credentials: LoginDTO, tenantSlug: string): Promise<CascadeLoginResult> {
    // Step 1: Keycloak authentication
    const tokenResponse = await this.keycloakClient.authenticateUser(
      credentials.email,
      credentials.password,
    );

    // Extract claims from the access token
    const claims = this.keycloakClient.extractClaims(tokenResponse.access_token);

    // Step 2: License Service check (soft-fail — log and continue if unavailable)
    try {
      await this.licenseClient.checkAccess(tenantSlug);
    } catch (licenseError: any) {
      // Only block login for explicit license denials (suspended/expired)
      if (licenseError?.code === 'LICENSE_SUSPENDED' || licenseError?.code === 'LICENSE_EXPIRED') {
        throw licenseError;
      }
      // For service unavailability or auth issues, log warning and continue
      console.warn(`[IntegratedAuth] License check falló para '${tenantSlug}' (${licenseError?.code || licenseError?.message || 'unknown'}) — continuando login sin verificación de licencia`);
    }

    // Step 3: Local tenant DB lookup
    const tenantResult = await db
      .select({
        slug: tenants.slug,
        nombre: tenants.nombre,
        plan: tenants.plan,
        status: tenants.status,
      })
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    const tenant = tenantResult[0];

    if (!tenant) {
      throw new AuthError(404, 'TENANT_NOT_FOUND', 'Organización no encontrada');
    }

    if (tenant.status !== 'active') {
      throw new AuthError(403, 'TENANT_SUSPENDED', 'Organización suspendida');
    }

    // Verify user exists in this tenant's schema
    // Skip for platform_admin users on the default tenant (they don't belong to any specific tenant)
    const primaryRole = claims.roles?.find((r: string) =>
      ['platform_admin', 'superusuario', 'admin', 'manager', 'tecnico', 'asistente'].includes(r)
    ) || 'tecnico';

    const isPlatformAdmin = claims.roles?.includes('platform_admin');

    if (!isPlatformAdmin) {
      // SECURITY (tenant isolation): the tenant the user belongs to comes from the
      // trusted `tenant_slug` token claim. A regular user may ONLY log into the
      // subdomain of their own tenant. This is the authoritative check that prevents
      // cross-tenant access (e.g. a user of "el-reloj" logging into "padsa").
      if (!claims.tenantSlug || claims.tenantSlug !== tenantSlug) {
        throw new AuthError(403, 'USER_NOT_IN_TENANT', 'Acceso denegado, dominio indefinido');
      }

      // Defense in depth: the user must also exist and be active in the tenant schema,
      // matched strictly by their Keycloak subject id (no cross-schema email fallback).
      const schemaName = toSchemaName(tenantSlug);
      const sql = getSqlClient();
      let userExists = false;
      try {
        await sql.unsafe(`SET search_path TO ${schemaName}, public`);
        const userInTenant = await sql`
          SELECT id FROM users WHERE id = ${claims.sub} AND is_active = true LIMIT 1
        `;
        userExists = userInTenant.length > 0;
      } finally {
        await sql.unsafe(`SET search_path TO public`);
      }

      if (!userExists) {
        throw new AuthError(403, 'USER_NOT_IN_TENANT', 'Acceso denegado, dominio indefinido');
      }
    }

    // Sync role to local DB (Keycloak is source of truth)
    // This keeps users.role updated as a local cache for operational queries.
    try {
      const schemaName = toSchemaName(tenantSlug);
      const sql = getSqlClient();
      await sql.unsafe(`SET search_path TO ${schemaName}, public`);
      await sql`
        UPDATE users SET role = ${primaryRole}, updated_at = NOW()
        WHERE id = ${claims.sub} AND role != ${primaryRole}
      `;
      await sql.unsafe(`SET search_path TO public`);
    } catch (syncError) {
      // Non-blocking: role sync failure should not prevent login
      console.warn(`[IntegratedAuth] Role sync failed for ${claims.sub}: ${syncError instanceof Error ? syncError.message : 'unknown'}`);
    }

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      user: {
        id: claims.sub,
        name: claims.name || '',
        email: claims.email || credentials.email,
        role: primaryRole,
        tenantSlug,
      },
      tenant: {
        slug: tenant.slug,
        nombre: tenant.nombre,
        plan: tenant.plan,
      },
    };
  }

  /**
   * Refreshes a Keycloak token using the refresh_token grant type.
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    return this.keycloakClient.refreshToken(refreshToken);
  }
}
