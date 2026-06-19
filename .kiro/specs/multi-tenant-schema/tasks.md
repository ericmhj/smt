# Implementation Tasks — Multi-Tenant Schema per Tenant

## Phase 1: Platform Schema & Foundation

- [ ] 1. Create platform tables (tenants, plans) in public schema
  - [x] 1.1 Create `packages/backend/src/db/schema/platform.ts` with Drizzle definitions for `tenants` table (id, slug, nombre, plan, status, config, scheduled_deletion_at, created_at, updated_at) and `plans` table (id, nombre, max_users, max_forms, max_storage_mb, features, activo, created_at, updated_at)
  - [ ] 1.2 Add a CHECK constraint (or application-level validation) to restrict `tenants.status` to `active`, `suspended`, `pending_deletion`
  - [ ] 1.3 Create SQL migration file `packages/backend/src/db/migrations/0005_platform_tables.sql` that creates the `tenants` and `plans` tables in the public schema with UNIQUE on slug and appropriate indexes
  - [ ] 1.4 Export new schema from `packages/backend/src/db/schema/index.ts`

- [ ] 2. Create schema template SQL
  - [ ] 2.1 Create `packages/backend/src/db/schema-template.sql` derived from `init.sql` — includes all 17 tenant-scoped tables (users, forms, form_versions, form_assignments, reactivos, state_transitions, signatures, observations, observation_files, notifications, audit_logs, clientes, cliente_contactos, cliente_documentos, tickets, sla_config, reglas_asignacion), all indexes, the `prevent_audit_modification` trigger, and SLA seed data
  - [ ] 2.2 Ensure template excludes `catalogo_estados`, `tenants`, `plans` tables and uses `SET search_path` parameter for schema-scoped execution
  - [ ] 2.3 Write a helper function `packages/backend/src/db/apply-schema-template.ts` that reads the template SQL and executes it with a given schema name parameter

## Phase 2: Tenant Middleware & Connection Isolation

- [ ] 3. Implement tenant resolution middleware
  - [ ] 3.1 Create `packages/backend/src/modules/tenant/tenant.middleware.ts` as a Fastify plugin (using `fastify-plugin`) with a `preHandler` hook that resolves tenant from JWT `tenantSlug` claim (for authenticated requests) or Host header subdomain (for login flow)
  - [ ] 3.2 Implement Redis caching of tenant status (key: `tenant:{slug}`, TTL: 60s) with fallback to DB query on cache miss
  - [ ] 3.3 Validate tenant status: return 404 for non-existent slugs, 403 for `suspended` or `pending_deletion` status
  - [ ] 3.4 Skip tenant resolution for Platform routes (`/api/platform/*`) — set `search_path` to `public` only
  - [ ] 3.5 Handle default tenant fallback: when Host has no subdomain (localhost, IP, bare domain), resolve to `default` tenant

- [ ] 4. Implement per-request search_path isolation
  - [ ] 4.1 Modify `packages/backend/src/db/index.ts` to export a function `getConnectionForTenant(slug: string)` that acquires a connection and executes `SET search_path TO sgr_{slug}, public`
  - [ ] 4.2 Add an `onResponse` hook in tenant middleware that resets `search_path` to `public` after request completes (or use `postgres.js` reserve/release pattern)
  - [ ] 4.3 Ensure the Fastify request decorator exposes `request.tenantContext` with `{ tenantId, tenantSlug, schemaName }` for use by route handlers
  - [ ] 4.4 Verify that existing Drizzle ORM queries (using the shared `db` instance) correctly resolve to the tenant schema via search_path

## Phase 3: JWT Enhancement & Auth Changes

- [ ] 5. Extend JWT with tenant claims
  - [ ] 5.1 Update `packages/backend/src/modules/auth/auth.types.ts` to add `tenantId: string` and `tenantSlug: string` to `JWTPayload` interface
  - [ ] 5.2 Modify `AuthService.generateTokenPair()` to include `tenantId` and `tenantSlug` claims in both access and refresh tokens
  - [ ] 5.3 Modify `AuthService.login()` to resolve tenant from request context (subdomain) before querying users table; return 404 with `TENANT_NOT_FOUND` if subdomain doesn't match an active tenant
  - [ ] 5.4 Modify `AuthService.verifyToken()` to extract and return `tenantId` and `tenantSlug` from decoded payload
  - [ ] 5.5 Update `AuthService.refresh()` to carry forward `tenantId` and `tenantSlug` from the old refresh token into the new token pair

## Phase 4: Redis & S3 Namespacing

- [ ] 6. Implement Redis key namespacing
  - [ ] 6.1 Create helper function `tenantKey(slug: string, ...parts: string[]): string` in `packages/backend/src/lib/redis.ts` that constructs `{slug}:{part1}:{part2}:...`
  - [ ] 6.2 Update `AuthService` to use `tenantKey(slug, 'refresh', userId, jti)` for refresh token storage and `tenantKey(slug, 'blacklist', jti)` for token blacklisting
  - [ ] 6.3 Update `AuthService.logout()` to use the tenant-namespaced key pattern when scanning/deleting refresh tokens

- [ ] 7. Implement S3 key namespacing
  - [ ] 7.1 Create helper `tenantStorageKey(slug: string, path: string): string` in `packages/backend/src/lib/minio.ts` that returns `{slug}/{path}`
  - [ ] 7.2 Update `uploadFile()` to accept tenant slug and prefix the key accordingly
  - [ ] 7.3 Update `getFileUrl()` and `deleteFile()` to accept tenant slug and prefix the key
  - [ ] 7.4 Add backward compatibility: if storage_key in DB lacks a slug prefix, treat it as belonging to `default` tenant during reads

## Phase 5: Tenant Lifecycle Service

- [ ] 8. Implement tenant lifecycle operations
  - [ ] 8.1 Create `packages/backend/src/modules/platform/tenant-lifecycle.service.ts` with slug validation (regex: `/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/`), returning 422 for invalid slugs
  - [ ] 8.2 Implement `createTenant()`: within a transaction — insert tenant record, CREATE SCHEMA, execute schema template, insert admin user; on any failure DROP SCHEMA IF EXISTS and rollback
  - [ ] 8.3 Implement `suspendTenant()`: validate current status is `active`, update to `suspended`, invalidate Redis cache for that slug
  - [ ] 8.4 Implement `activateTenant()`: validate current status is `suspended` or `pending_deletion`, update to `active`, clear `scheduled_deletion_at`, invalidate Redis cache
  - [ ] 8.5 Implement `scheduleDeletion()`: validate current status is `active`, update to `pending_deletion`, set `scheduled_deletion_at` to NOW() + 30 days, invalidate Redis cache
  - [ ] 8.6 Implement `executePendingDeletions()`: find tenants where status=`pending_deletion` AND `scheduled_deletion_at <= NOW()`, execute DROP SCHEMA CASCADE, delete Redis keys matching `{slug}:*`, delete S3 objects with prefix `{slug}/`, delete tenant record

## Phase 6: Platform Admin API

- [ ] 9. Create platform admin routes
  - [ ] 9.1 Create `packages/backend/src/modules/platform/platform.routes.ts` with prefix `/api/platform` and a guard that verifies JWT role is `platform_admin` (return 403 `PLATFORM_ACCESS_DENIED` otherwise)
  - [ ] 9.2 Implement `POST /api/platform/tenants` — validate body (slug, nombre, plan, adminEmail, adminPassword), call `createTenant()`, return 201 with tenant record
  - [ ] 9.3 Implement `GET /api/platform/tenants` — paginated list (query params: page, limit, status filter) returning tenants with status, plan, and created_at
  - [ ] 9.4 Implement `GET /api/platform/tenants/:id` — return full tenant detail including user count (query sgr_{slug}.users) and storage metrics
  - [ ] 9.5 Implement `PUT /api/platform/tenants/:id/suspend` — call `suspendTenant()`, return updated tenant
  - [ ] 9.6 Implement `PUT /api/platform/tenants/:id/activate` — call `activateTenant()`, return updated tenant
  - [ ] 9.7 Implement `DELETE /api/platform/tenants/:id` — call `scheduleDeletion()`, return updated tenant with scheduled_deletion_at
  - [ ] 9.8 Register platform routes in `packages/backend/src/app.ts`

## Phase 7: Migration Infrastructure

- [ ] 10. Create cross-schema migration runner
  - [ ] 10.1 Create `packages/backend/src/db/migration-runner.ts` that discovers all tenant schemas via `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'sgr_%'`
  - [ ] 10.2 Implement migration tracking: create `schema_migrations` table in public schema (id, schema_name, migration_name, applied_at) and check before applying
  - [ ] 10.3 Implement per-schema transaction execution: for each schema, BEGIN, SET search_path, execute SQL, record in schema_migrations, COMMIT; on failure ROLLBACK and log error with tenant slug, continue to next schema
  - [ ] 10.4 Add CLI command or script entry point (`packages/backend/src/db/run-migrations.ts`) that can be invoked as `npx tsx src/db/run-migrations.ts <migration-file>`

- [ ] 11. Create initial migration to move existing data to sgr_default
  - [ ] 11.1 Create migration script `packages/backend/src/db/migrations/0006_move_to_sgr_default.sql` that: inserts default tenant record in `public.tenants`, creates `sgr_default` schema, uses `ALTER TABLE ... SET SCHEMA sgr_default` for all 17 tenant-scoped tables
  - [ ] 11.2 Ensure migration preserves all data, foreign keys, indexes, triggers, and sequences during schema move
  - [ ] 11.3 Verify `catalogo_estados` remains in public schema after migration
  - [ ] 11.4 Update schema template to include any adjustments identified during migration testing

## Phase 8: Frontend Platform Admin Panel

- [ ] 12. Create frontend admin pages
  - [ ] 12.1 Add `platform_admin` role to `packages/frontend/src/lib/guards.ts` route permissions — restrict `/admin/*` to `platform_admin` role, redirect other roles to SGR dashboard
  - [ ] 12.2 Create `packages/frontend/src/app/admin/tenants/page.tsx` — table listing all tenants (nombre, slug, plan, status, created_at) with pagination, fetching from `GET /api/platform/tenants`
  - [ ] 12.3 Create `packages/frontend/src/app/admin/tenants/nuevo/page.tsx` — form with fields: nombre, slug (auto-generated from nombre), plan (dropdown), admin email, admin password; calls `POST /api/platform/tenants`
  - [ ] 12.4 Create `packages/frontend/src/app/admin/tenants/[id]/page.tsx` — tenant detail page showing info + action buttons (suspend, activate, delete); delete shows confirmation dialog explaining 30-day grace period
  - [ ] 12.5 Add navigation link to admin panel in the main layout for users with `platform_admin` role

## Phase 9: Integration & Testing

- [ ] 13. Write property-based tests
  - [ ] 13.1 Install `fast-check` as a dev dependency; create test file `packages/backend/src/modules/platform/__tests__/tenant-slug.property.test.ts` with PBT for slug validation (Property 1)
  - [ ] 13.2 Create `packages/backend/src/modules/platform/__tests__/tenant-lifecycle.property.test.ts` with PBT for state machine transitions (Property 7) — generate random sequences of lifecycle commands, verify valid transitions succeed and invalid ones return 409
  - [ ] 13.3 Create `packages/backend/src/modules/tenant/__tests__/redis-namespacing.property.test.ts` with PBT for Redis key format (Property 9)
  - [ ] 13.4 Create `packages/backend/src/modules/tenant/__tests__/s3-namespacing.property.test.ts` with PBT for S3 key format (Property 10)

- [ ] 14. Write integration tests
  - [ ] 14.1 Create `packages/backend/src/modules/platform/__tests__/tenant-creation.integration.test.ts` — end-to-end tenant creation verifying schema exists with all tables
  - [ ] 14.2 Create `packages/backend/src/modules/tenant/__tests__/tenant-middleware.integration.test.ts` — verify search_path is set correctly, 404 for unknown tenants, 403 for suspended tenants
  - [ ] 14.3 Create `packages/backend/src/modules/tenant/__tests__/connection-isolation.integration.test.ts` — concurrent requests to different tenants verify data isolation (Property 11)
  - [ ] 14.4 Create `packages/backend/src/modules/auth/__tests__/auth-tenant.integration.test.ts` — login flow includes tenant resolution, JWT contains tenant claims

- [ ] 15. End-to-end verification
  - [ ] 15.1 Verify existing SGR routes work unchanged when `search_path` is set (run existing test suite against `sgr_default` schema)
  - [ ] 15.2 Verify tenant creation → login → CRUD operations → file upload flow for a newly created tenant
  - [ ] 15.3 Verify migration runner applies a test migration to all tenant schemas
  - [ ] 15.4 Verify deletion cleanup removes schema, Redis keys, and S3 objects
