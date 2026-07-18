/**
 * Migration Script: Sync existing users to Keycloak
 *
 * This standalone script reads all tenants and their users from the database,
 * then creates each user in Keycloak with a temporary password.
 *
 * Usage:
 *   npx tsx packages/backend/src/db/sync-existing-users-to-keycloak.ts
 *
 * Required environment variables:
 *   DATABASE_URL           - PostgreSQL connection string
 *   KEYCLOAK_ADMIN_URL     - Keycloak base URL (e.g., http://keycloak:8080)
 *   KEYCLOAK_ADMIN_REALM   - Admin realm (default: master)
 *   KEYCLOAK_ADMIN_USER    - Admin username
 *   KEYCLOAK_ADMIN_PASSWORD - Admin password
 *   KEYCLOAK_TARGET_REALM  - Target realm for users (default: mikel-crm)
 */

import postgres from 'postgres';
import { KeycloakAdminClient } from '../modules/tenant/keycloak-admin-client.js';

interface TenantRow {
  slug: string;
  status: string;
}

interface UserRow {
  email: string;
  role: string;
  name: string;
}

async function main(): Promise<void> {
  console.log('[SyncKeycloak] Iniciando sincronización de usuarios existentes a Keycloak...');

  // Validate environment
  const databaseUrl = process.env.DATABASE_URL;
  const adminUrl = process.env.KEYCLOAK_ADMIN_URL;
  const adminUser = process.env.KEYCLOAK_ADMIN_USER;
  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;
  const adminRealm = process.env.KEYCLOAK_ADMIN_REALM || 'master';
  const targetRealm = process.env.KEYCLOAK_TARGET_REALM || 'mikel-crm';

  if (!databaseUrl) {
    console.error('[SyncKeycloak] ERROR: DATABASE_URL no está configurada');
    process.exit(1);
  }

  if (!adminUrl || !adminUser || !adminPassword) {
    console.error('[SyncKeycloak] ERROR: Variables KEYCLOAK_ADMIN_URL, KEYCLOAK_ADMIN_USER y KEYCLOAK_ADMIN_PASSWORD son requeridas');
    process.exit(1);
  }

  const sql = postgres(databaseUrl);
  const keycloakAdmin = new KeycloakAdminClient({
    baseUrl: adminUrl,
    realm: targetRealm,
    adminRealm,
    adminUser,
    adminPassword,
  });

  try {
    // 1. Read all active tenants
    const tenants = await sql<TenantRow[]>`
      SELECT slug, status FROM public.tenants WHERE status = 'active'
    `;

    console.log(`[SyncKeycloak] Encontrados ${tenants.length} tenants activos`);

    let totalUsers = 0;
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    // 2. For each tenant, read users and sync to Keycloak
    for (const tenant of tenants) {
      const sanitizedSlug = tenant.slug.replace(/-/g, '_');
      const schemaName = `sgr_${sanitizedSlug}`;

      console.log(`\n[SyncKeycloak] Procesando tenant: ${tenant.slug} (schema: ${schemaName})`);

      try {
        const users = await sql<UserRow[]>`
          SELECT email, role, name
          FROM ${sql(schemaName)}.users
          WHERE is_active = true
        `;

        console.log(`[SyncKeycloak]   ${users.length} usuarios activos encontrados`);
        totalUsers += users.length;

        for (const user of users) {
          console.log(`[SyncKeycloak]   Sincronizando: ${user.email} (rol: ${user.role})`);

          try {
            await keycloakAdmin.createUser({
              email: user.email,
              password: 'admin123',
              temporary: true,
              tenantSlug: tenant.slug,
              role: user.role,
              firstName: user.name.split(' ')[0] || 'User',
              lastName: user.name.split(' ').slice(1).join(' ') || tenant.slug,
            });
            successCount++;
          } catch (userError) {
            const errorMsg = userError instanceof Error ? userError.message : 'Error desconocido';
            // Check if it's a "user already exists" scenario (handled internally by createUser)
            if (errorMsg.includes('ya existe')) {
              skipCount++;
            } else {
              errorCount++;
              console.error(`[SyncKeycloak]   Error sincronizando ${user.email}: ${errorMsg}`);
            }
          }
        }
      } catch (schemaError) {
        const errorMsg = schemaError instanceof Error ? schemaError.message : 'Error desconocido';
        console.error(`[SyncKeycloak]   Error leyendo usuarios del schema ${schemaName}: ${errorMsg}`);
        errorCount++;
      }
    }

    // 3. Summary
    console.log('\n[SyncKeycloak] ========== RESUMEN ==========');
    console.log(`[SyncKeycloak] Total tenants procesados: ${tenants.length}`);
    console.log(`[SyncKeycloak] Total usuarios encontrados: ${totalUsers}`);
    console.log(`[SyncKeycloak] Creados exitosamente: ${successCount}`);
    console.log(`[SyncKeycloak] Omitidos (ya existían): ${skipCount}`);
    console.log(`[SyncKeycloak] Errores: ${errorCount}`);
    console.log('[SyncKeycloak] ============================');
  } finally {
    await sql.end();
  }

  console.log('[SyncKeycloak] Sincronización completada');
}

main().catch((error) => {
  console.error('[SyncKeycloak] Error fatal:', error);
  process.exit(1);
});
