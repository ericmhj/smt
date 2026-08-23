/**
 * Migration Script: Sync users.id with Keycloak UUIDs
 *
 * Problem: existing tenants have users.id = local randomUUID(), but Keycloak
 * assigned a different UUID to the same email. When users log in via Keycloak,
 * actor.sub (Keycloak UUID) doesn't match users.id → FK violations on forms,
 * form_versions, audit_logs, etc.
 *
 * Solution: for each tenant, find the admin user by email in Keycloak,
 * then update all tables that reference users.id to use the Keycloak UUID.
 *
 * This script is safe to run multiple times (idempotent).
 * It does NOT modify Keycloak — only the tenant DB schemas.
 *
 * Usage:
 *   npx tsx packages/backend/src/db/sync-user-ids-with-keycloak.ts
 *
 * Required environment variables:
 *   DATABASE_URL
 *   KEYCLOAK_ADMIN_URL
 *   KEYCLOAK_ADMIN_USER
 *   KEYCLOAK_ADMIN_PASSWORD
 *   KEYCLOAK_ADMIN_REALM   (default: master)
 *   KEYCLOAK_TARGET_REALM  (default: mikel-crm)
 */

import postgres from 'postgres';
import { KeycloakAdminClient } from '../modules/tenant/keycloak-admin-client.js';
import { toSchemaName } from '../lib/tenant-schema.js';

interface TenantRow {
  slug: string;
  status: string;
}

interface UserRow {
  id: string;
  email: string;
  role: string;
}

// All tables with a direct FK to users(id) — must be updated before updating users.id
const FK_TABLES: Array<{ table: string; column: string }> = [
  { table: 'forms',                column: 'created_by' },
  { table: 'form_versions',        column: 'created_by' },
  { table: 'form_assignments',     column: 'tecnico_id' },
  { table: 'form_assignments',     column: 'assigned_by' },
  { table: 'reactivos',            column: 'tecnico_id' },
  { table: 'state_transitions',    column: 'actor_id' },
  { table: 'signatures',           column: 'user_id' },
  { table: 'observations',         column: 'author_id' },
  { table: 'notifications',        column: 'recipient_id' },
  { table: 'audit_logs',           column: 'actor_id' },
  { table: 'clientes',             column: 'asignado_a' },
  { table: 'cliente_documentos',   column: 'uploaded_by' },
  { table: 'tickets',              column: 'tecnico_asignado_id' },
  { table: 'tickets',              column: 'creado_por' },
  { table: 'reglas_asignacion',    column: 'creado_por' },
];

async function main(): Promise<void> {
  console.log('[SyncUserIds] Iniciando sincronización de users.id con UUIDs de Keycloak...');

  const databaseUrl = process.env.DATABASE_URL;
  const adminUrl = process.env.KEYCLOAK_ADMIN_URL;
  const adminUser = process.env.KEYCLOAK_ADMIN_USER;
  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;
  const adminRealm = process.env.KEYCLOAK_ADMIN_REALM || 'master';
  const targetRealm = process.env.KEYCLOAK_TARGET_REALM || 'mikel-crm';

  if (!databaseUrl || !adminUrl || !adminUser || !adminPassword) {
    console.error('[SyncUserIds] ERROR: Faltan variables de entorno requeridas');
    console.error('  DATABASE_URL, KEYCLOAK_ADMIN_URL, KEYCLOAK_ADMIN_USER, KEYCLOAK_ADMIN_PASSWORD');
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

  let totalTenants = 0;
  let totalUsersUpdated = 0;
  let totalUsersSkipped = 0;
  let totalErrors = 0;

  try {
    const tenants = await sql<TenantRow[]>`
      SELECT slug, status FROM public.tenants WHERE status = 'active'
    `;

    console.log(`[SyncUserIds] ${tenants.length} tenants activos encontrados\n`);

    for (const tenant of tenants) {
      totalTenants++;
      const schemaName = toSchemaName(tenant.slug);

      console.log(`[SyncUserIds] ── Tenant: ${tenant.slug} (schema: ${schemaName})`);

      try {
        // Read all users in this tenant schema
        const users = await sql<UserRow[]>`
          SELECT id, email, role
          FROM ${sql(schemaName)}.users
          WHERE is_active = true
        `;

        console.log(`[SyncUserIds]    ${users.length} usuarios encontrados`);

        for (const user of users) {
          try {
            // Look up the Keycloak UUID for this email
            const keycloakId = await keycloakAdmin.getUserIdByEmail(user.email);

            if (!keycloakId) {
              console.log(`[SyncUserIds]    ⚠ ${user.email}: no encontrado en Keycloak, omitiendo`);
              totalUsersSkipped++;
              continue;
            }

            if (keycloakId === user.id) {
              console.log(`[SyncUserIds]    ✓ ${user.email}: UUID ya sincronizado (${user.id})`);
              totalUsersSkipped++;
              continue;
            }

            console.log(`[SyncUserIds]    → ${user.email}: actualizando ${user.id} → ${keycloakId}`);

            // Update all FK references FIRST, then the primary key
            await sql.begin(async (tx) => {
              await tx.unsafe(`SET search_path TO ${schemaName}, public`);

              // 1. Update all FK columns in all related tables
              for (const { table, column } of FK_TABLES) {
                await tx.unsafe(
                  `UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`,
                  [keycloakId, user.id]
                );
              }

              // 2. Update the primary key last
              await tx.unsafe(
                `UPDATE users SET id = $1 WHERE id = $2`,
                [keycloakId, user.id]
              );

              await tx.unsafe(`SET search_path TO public`);
            });

            console.log(`[SyncUserIds]    ✓ ${user.email}: sincronizado correctamente`);
            totalUsersUpdated++;

          } catch (userError) {
            const msg = userError instanceof Error ? userError.message : 'Error desconocido';
            console.error(`[SyncUserIds]    ✗ ${user.email}: ERROR - ${msg}`);
            totalErrors++;
          }
        }

      } catch (tenantError) {
        const msg = tenantError instanceof Error ? tenantError.message : 'Error desconocido';
        console.error(`[SyncUserIds]    ✗ Error procesando tenant ${tenant.slug}: ${msg}`);
        totalErrors++;
      }

      console.log('');
    }

  } finally {
    await sql.end();
  }

  console.log('═══════════════════════════════════════');
  console.log('[SyncUserIds] RESUMEN');
  console.log(`  Tenants procesados : ${totalTenants}`);
  console.log(`  Usuarios actualizados: ${totalUsersUpdated}`);
  console.log(`  Usuarios sin cambio  : ${totalUsersSkipped}`);
  console.log(`  Errores              : ${totalErrors}`);
  console.log('═══════════════════════════════════════');

  if (totalErrors > 0) {
    console.error('[SyncUserIds] Completado con errores');
    process.exit(1);
  } else {
    console.log('[SyncUserIds] Completado exitosamente');
  }
}

main().catch((error) => {
  console.error('[SyncUserIds] Error fatal:', error);
  process.exit(1);
});
