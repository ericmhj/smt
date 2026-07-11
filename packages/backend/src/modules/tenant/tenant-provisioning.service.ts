import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import type { Database } from '../../db/index.js';
import { getSqlClient } from '../../db/index.js';
import { tenants } from '../../db/schema/platform.js';
import { applySchemaTemplate } from '../../db/apply-schema-template.js';
import { getRedisClient } from '../../lib/redis.js';
import type { TenantCreatedEvent } from '../kafka/kafka.events.js';

export class TenantProvisioningService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async provisionTenant(event: TenantCreatedEvent): Promise<void> {
    const { slug, nombre, admin_email } = event;
    // Sanitize slug for PostgreSQL schema name: replace hyphens with underscores
    const sanitizedSlug = slug.replace(/-/g, '_');
    const schemaName = `sgr_${sanitizedSlug}`;

    // Check idempotency: if tenant already exists, skip
    const existing = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[TenantProvisioning] Tenant '${slug}' ya existe, omitiendo provisión`);
      return;
    }

    const sql = getSqlClient();

    // 1. Create the schema
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);

    // 2. Apply schema template (creates all tables)
    await applySchemaTemplate(sql, schemaName);

    // 3. Create tenant record in platform.tenants
    await this.db.insert(tenants).values({
      id: randomUUID(),
      slug,
      nombre,
      status: 'active',
    });

    // 4. Create admin user in the tenant schema
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await sql.unsafe(`
      INSERT INTO ${schemaName}.users (id, name, email, password_hash, role, is_active)
      VALUES ('${randomUUID()}', 'Admin', '${admin_email}', '${hashedPassword}', 'admin', true)
      ON CONFLICT (email) DO NOTHING
    `);

    console.log(`[TenantProvisioning] Tenant '${slug}' provisionado exitosamente`);
  }

  async suspendTenant(slug: string): Promise<void> {
    await this.db
      .update(tenants)
      .set({ status: 'suspended', updatedAt: new Date() })
      .where(eq(tenants.slug, slug));

    await this.invalidateTenantCache(slug);
    console.log(`[TenantProvisioning] Tenant '${slug}' suspendido`);
  }

  async reactivateTenant(slug: string): Promise<void> {
    await this.db
      .update(tenants)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(tenants.slug, slug));

    await this.invalidateTenantCache(slug);
    console.log(`[TenantProvisioning] Tenant '${slug}' reactivado`);
  }

  private async invalidateTenantCache(slug: string): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.del(`tenant:${slug}`);
    } catch (error) {
      console.error(`[TenantProvisioning] Error invalidando caché para '${slug}':`, error);
    }
  }
}
