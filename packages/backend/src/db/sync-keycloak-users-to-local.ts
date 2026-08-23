/**
 * Sync Keycloak users to local tenant DB tables.
 * Ensures all users in Keycloak for each tenant have a corresponding
 * row in the tenant's users table (needed for FK references).
 *
 * Usage: pnpm tsx src/db/sync-keycloak-users-to-local.ts
 */
import postgres from 'postgres';
import { KeycloakAdminClient } from '../modules/tenant/keycloak-admin-client.js';
import { toSchemaName } from '../lib/tenant-schema.js';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) { console.error('DATABASE_URL required'); process.exit(1); }

  const sql = postgres(databaseUrl);
  const kc = new KeycloakAdminClient({
    baseUrl: process.env.KEYCLOAK_ADMIN_URL || 'http://keycloak:8080',
    realm: process.env.KEYCLOAK_TARGET_REALM || 'mikel-crm',
    adminRealm: process.env.KEYCLOAK_ADMIN_REALM || 'master',
    adminUser: process.env.KEYCLOAK_ADMIN_USER || 'admin',
    adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
  });

  const tenants = await sql<Array<{ slug: string }>>`
    SELECT slug FROM public.tenants WHERE status = 'active'
  `;

  console.log(`[SyncLocal] ${tenants.length} tenants activos`);

  for (const tenant of tenants) {
    const schema = toSchemaName(tenant.slug);
    console.log(`\n[SyncLocal] Tenant: ${tenant.slug} (${schema})`);

    try {
      const { users } = await kc.findUsers({ tenantSlug: tenant.slug, max: 100 });
      console.log(`[SyncLocal]   ${users.length} usuarios en Keycloak`);

      await sql.unsafe(`SET search_path TO ${schema}, public`);

      for (const u of users) {
        const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || 'User';
        const role = u.attributes?.user_roles?.[0] || 'tecnico';
        const email = u.email || '';

        await sql`
          INSERT INTO users (id, email, name, password_hash, role, is_active)
          VALUES (${u.id}, ${email}, ${name}, 'keycloak-managed', ${role}, ${u.enabled !== false})
          ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            is_active = EXCLUDED.is_active,
            updated_at = NOW()
        `;
        console.log(`[SyncLocal]   ✓ ${email} (${role})`);
      }

      await sql.unsafe(`SET search_path TO public`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.error(`[SyncLocal]   ✗ Error: ${msg}`);
    }
  }

  await sql.end();
  console.log('\n[SyncLocal] Completado');
}

main().catch((e) => { console.error(e); process.exit(1); });
