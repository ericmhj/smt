import { readFileSync, existsSync } from 'node:fs';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  frontendUrl: string;

  database: {
    url: string;
  };

  redis: {
    url: string;
  };

  jwt: {
    privateKey: string;
    publicKey: string;
    accessTokenExpiry: string;
    refreshTokenExpiry: string;
    issuer: string;
  };

  standaloneAuth: boolean;

  keycloak?: {
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
    jwksUrl: string;
    issuer: string;
    jwksCacheTtl: number;
  };

  keycloakAdmin?: {
    baseUrl: string;
    adminRealm: string;
    adminUser: string;
    adminPassword: string;
    targetRealm: string;
  };

  kafka?: {
    brokers: string[];
    groupId: string;
    topic: string;
  };

  licenseService?: {
    baseUrl: string;
    timeoutMs: number;
    circuitBreaker: {
      failureThreshold: number;
      resetTimeoutMs: number;
    };
    /** Secreto compartido con el gateway del license-service (X-Gateway-Secret). */
    gatewaySecret: string;
    /** Rol operacional para llamadas servicio-a-servicio (X-User-Role). */
    gatewayRole: string;
  };
}

function loadKey(pathOrValue: string | undefined, envName: string): string {
  if (!pathOrValue) {
    throw new Error(`${envName} environment variable is not set`);
  }

  // If it looks like a file path, read the file
  if (existsSync(pathOrValue)) {
    return readFileSync(pathOrValue, 'utf-8');
  }

  // Otherwise treat it as the key value directly (useful for testing/CI)
  return pathOrValue;
}

export function loadConfig(): AppConfig {
  const standaloneAuth = process.env.STANDALONE_AUTH !== 'false';

  const config: AppConfig = {
    port: Number(process.env.PORT) || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

    database: {
      url: process.env.DATABASE_URL || '',
    },

    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    },

    jwt: {
      privateKey: loadKey(process.env.JWT_PRIVATE_KEY_PATH, 'JWT_PRIVATE_KEY_PATH'),
      publicKey: loadKey(process.env.JWT_PUBLIC_KEY_PATH, 'JWT_PUBLIC_KEY_PATH'),
      accessTokenExpiry: process.env.JWT_ACCESS_TOKEN_EXPIRY || '15m',
      refreshTokenExpiry: process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d',
      issuer: process.env.JWT_ISSUER || 'sgr-api',
    },

    standaloneAuth,
  };

  if (!standaloneAuth) {
    config.keycloak = {
      tokenUrl: process.env.KEYCLOAK_TOKEN_URL || '',
      clientId: process.env.KEYCLOAK_CLIENT_ID || '',
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
      jwksUrl: process.env.KEYCLOAK_JWKS_URL || '',
      issuer: process.env.KEYCLOAK_ISSUER || '',
      jwksCacheTtl: 300,
    };

    config.kafka = {
      brokers: (process.env.KAFKA_BROKERS || '').split(',').filter(Boolean),
      groupId: 'sgr-tenant-lifecycle',
      topic: process.env.KAFKA_TOPIC || 'license-events',
    };

    config.licenseService = {
      baseUrl: process.env.LICENSE_SERVICE_URL || '',
      timeoutMs: 5000,
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeoutMs: 60000,
      },
      gatewaySecret: process.env.LICENSE_GATEWAY_SECRET || 'mikel-gateway-internal-dev-2026',
      gatewayRole: process.env.LICENSE_GATEWAY_ROLE || 'platform_admin',
    };

    config.keycloakAdmin = {
      baseUrl: process.env.KEYCLOAK_ADMIN_URL || '',
      adminRealm: process.env.KEYCLOAK_ADMIN_REALM || 'master',
      adminUser: process.env.KEYCLOAK_ADMIN_USER || '',
      adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD || '',
      targetRealm: process.env.KEYCLOAK_TARGET_REALM || 'mikel-crm',
    };
  }

  return config;
}

export function validateConfig(config: AppConfig): void {
  if (config.standaloneAuth) {
    return;
  }

  if (!config.keycloak?.tokenUrl) {
    console.error('Variable KEYCLOAK_TOKEN_URL es requerida en modo integrado');
    process.exit(1);
  }

  if (!config.keycloak?.clientId) {
    console.error('Variable KEYCLOAK_CLIENT_ID es requerida en modo integrado');
    process.exit(1);
  }

  if (!config.keycloak?.clientSecret) {
    console.error('Variable KEYCLOAK_CLIENT_SECRET es requerida en modo integrado');
    process.exit(1);
  }

  if (!config.keycloak?.jwksUrl) {
    console.error('Variable KEYCLOAK_JWKS_URL es requerida en modo integrado');
    process.exit(1);
  }

  if (!config.keycloak?.issuer) {
    console.error('Variable KEYCLOAK_ISSUER es requerida en modo integrado');
    process.exit(1);
  }

  if (!config.kafka?.brokers || config.kafka.brokers.filter((b) => b.length > 0).length === 0) {
    console.error('Variable KAFKA_BROKERS es requerida en modo integrado');
    process.exit(1);
  }

  if (!config.licenseService?.baseUrl) {
    console.error('Variable LICENSE_SERVICE_URL es requerida en modo integrado');
    process.exit(1);
  }

  if (!config.keycloakAdmin?.baseUrl) {
    console.warn('[Config] KEYCLOAK_ADMIN_URL no configurada — la creación de usuarios en Keycloak estará deshabilitada');
  }

  if (config.keycloakAdmin?.baseUrl && !config.keycloakAdmin?.adminUser) {
    console.error('Variable KEYCLOAK_ADMIN_USER es requerida cuando KEYCLOAK_ADMIN_URL está configurada');
    process.exit(1);
  }

  if (config.keycloakAdmin?.baseUrl && !config.keycloakAdmin?.adminPassword) {
    console.error('Variable KEYCLOAK_ADMIN_PASSWORD es requerida cuando KEYCLOAK_ADMIN_URL está configurada');
    process.exit(1);
  }
}
