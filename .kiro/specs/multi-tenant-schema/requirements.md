# Requirements Document — Multi-Tenant Schema per Tenant

## Introduction

Este documento define los requisitos para implementar multi-tenancy en el SGR (Sistema de Gestión de Ensayos) usando la estrategia de **schema por tenant** en PostgreSQL. Cada tenant obtiene un schema PostgreSQL dedicado (`sgr_{slug}`) con réplica completa de las 15+ tablas del sistema. Un schema `public` contiene las tablas de nivel plataforma (tenants, planes). Un middleware resuelve el tenant desde el JWT o subdominio y establece `search_path` antes de cada petición, logrando aislamiento total sin modificar el código de negocio existente del SGR.

## Glossary

- **Tenant**: Organización cliente que utiliza la plataforma SGR con datos completamente aislados en su propio schema PostgreSQL
- **Platform_Admin**: Rol de nivel plataforma que gestiona tenants, planes y configuración global; opera sobre el schema `public`
- **Tenant_Schema**: Schema PostgreSQL nombrado `sgr_{slug}` que contiene la réplica completa de tablas del SGR para un tenant específico
- **Schema_Template**: Script SQL derivado del `init.sql` actual que se ejecuta dentro de un schema nuevo para crear las tablas del tenant
- **Tenant_Resolution_Middleware**: Componente Fastify que determina el tenant activo a partir del subdominio HTTP o del claim `tenantSlug` en el JWT, y establece `SET search_path` en la conexión de base de datos
- **Platform_Routes**: Rutas de la API bajo el prefijo `/api/platform/` que operan sobre el schema `public` y requieren rol `platform_admin`
- **SGR_Routes**: Rutas actuales de la API (módulos de ensayos, clientes, tickets, etc.) que operan dentro del schema del tenant resuelto
- **Tenant_Slug**: Identificador alfanumérico en minúsculas (a-z, 0-9, guiones) usado como nombre del schema (`sgr_{slug}`) y como subdominio
- **Search_Path**: Variable de sesión PostgreSQL que define la prioridad de búsqueda de schemas; se establece como `sgr_{slug}, public` para peticiones de tenant
- **Grace_Period**: Período de 30 días entre la solicitud de eliminación de un tenant y la ejecución de `DROP SCHEMA CASCADE`
- **Tenant_Lifecycle_Service**: Servicio backend que gestiona la creación, suspensión, reactivación y eliminación programada de tenants
- **SGR**: Sistema de Gestión de Reactivos/Ensayos — la aplicación de negocio existente

## Requirements

### Requirement 1: Tablas de plataforma en schema public

**User Story:** As a Platform_Admin, I want platform-level tables (tenants, plans) stored in the public schema, so that tenant management data is centralized and independent of tenant schemas.

#### Acceptance Criteria

1. THE Database SHALL contain a `tenants` table in the public schema with columns: id (UUID PK), slug (VARCHAR UNIQUE), nombre (VARCHAR), plan (VARCHAR), status (VARCHAR), config (JSONB), created_at (TIMESTAMPTZ), updated_at (TIMESTAMPTZ)
2. THE Database SHALL contain a `plans` table in the public schema with columns: id (UUID PK), nombre (VARCHAR UNIQUE), max_users (INTEGER), max_forms (INTEGER), max_storage_mb (INTEGER), features (JSONB), activo (BOOLEAN), created_at (TIMESTAMPTZ), updated_at (TIMESTAMPTZ)
3. THE Database SHALL enforce a UNIQUE constraint on the `tenants.slug` column
4. THE Database SHALL restrict `tenants.status` to one of the values: active, suspended, pending_deletion
5. WHEN the platform is initialized for the first time, THE Database SHALL contain a tenant record with slug `default` and status `active` representing the existing pre-migration data

### Requirement 2: Schema template para creación de tenants

**User Story:** As a Platform_Admin, I want a reusable SQL template that creates all SGR tables within a new schema, so that each tenant gets an identical and complete database structure.

#### Acceptance Criteria

1. THE Schema_Template SHALL create all 15 tenant-scoped tables (users, forms, form_versions, form_assignments, reactivos, state_transitions, signatures, observations, observation_files, notifications, audit_logs, clientes, cliente_contactos, cliente_documentos, tickets, sla_config, reglas_asignacion) within the target schema
2. THE Schema_Template SHALL create all indexes defined in the current `init.sql` within the target schema
3. THE Schema_Template SHALL create the `prevent_audit_modification` trigger on the `audit_logs` table within the target schema
4. THE Schema_Template SHALL NOT create tables that belong to the public schema (tenants, plans, catalogo_estados)
5. THE Schema_Template SHALL seed default SLA configuration values (alta: 24h, media: 48h, baja: 72h) in the `sla_config` table of the new schema
6. THE Schema_Template SHALL accept a schema name as a parameter and execute all DDL statements within that schema context

### Requirement 3: Tenant Resolution Middleware

**User Story:** As a developer, I want a middleware that automatically resolves the tenant and sets the database search_path, so that existing SGR queries work without modification in a multi-tenant context.

#### Acceptance Criteria

1. WHEN an HTTP request arrives at an SGR_Route, THE Tenant_Resolution_Middleware SHALL extract the tenant slug from the `Host` header subdomain (e.g., `acme` from `acme.sgr.com`)
2. WHEN a valid JWT is present in the request, THE Tenant_Resolution_Middleware SHALL extract the `tenantSlug` claim and use it to resolve the tenant
3. WHEN the tenant is resolved, THE Tenant_Resolution_Middleware SHALL execute `SET search_path TO sgr_{slug}, public` on the database connection before passing control to route handlers
4. IF the tenant slug does not match any active tenant record, THEN THE Tenant_Resolution_Middleware SHALL respond with HTTP 404 and error code `TENANT_NOT_FOUND`
5. IF the resolved tenant has status `suspended`, THEN THE Tenant_Resolution_Middleware SHALL respond with HTTP 403 and error code `TENANT_SUSPENDED`
6. WHEN an HTTP request arrives at a Platform_Route (`/api/platform/*`), THE Tenant_Resolution_Middleware SHALL set search_path to `public` without tenant resolution
7. THE Tenant_Resolution_Middleware SHALL cache tenant slug-to-status mappings in Redis with a TTL of 60 seconds to avoid repeated database lookups

### Requirement 4: Tenant Lifecycle — Creation

**User Story:** As a Platform_Admin, I want to create a new tenant that provisions a fully isolated schema with an admin user, so that a new customer organization can immediately start using the SGR.

#### Acceptance Criteria

1. WHEN a valid tenant creation request is received, THE Tenant_Lifecycle_Service SHALL insert a record in `public.tenants` with the provided slug, nombre, plan, and status `active`
2. WHEN a tenant record is created, THE Tenant_Lifecycle_Service SHALL execute `CREATE SCHEMA sgr_{slug}` in PostgreSQL
3. WHEN a schema is created, THE Tenant_Lifecycle_Service SHALL execute the Schema_Template within that schema to create all tables, indexes, and triggers
4. WHEN tables are created, THE Tenant_Lifecycle_Service SHALL insert an admin user in `sgr_{slug}.users` with the provided email, hashed password, role `admin`, and is_active `true`
5. WHEN the tenant creation process fails at any step, THE Tenant_Lifecycle_Service SHALL rollback all changes (drop schema if created, delete tenant record) and return an error
6. THE Tenant_Lifecycle_Service SHALL validate that the slug contains only lowercase letters (a-z), digits (0-9), and hyphens, with a length between 3 and 50 characters
7. IF a tenant with the same slug already exists, THEN THE Tenant_Lifecycle_Service SHALL respond with HTTP 409 and error code `TENANT_SLUG_EXISTS`

### Requirement 5: Tenant Lifecycle — Suspension and Reactivation

**User Story:** As a Platform_Admin, I want to suspend and reactivate tenants, so that I can manage customer access without destroying their data.

#### Acceptance Criteria

1. WHEN a suspend request is received for an active tenant, THE Tenant_Lifecycle_Service SHALL update the tenant status to `suspended` in `public.tenants`
2. WHILE a tenant has status `suspended`, THE Tenant_Resolution_Middleware SHALL reject all SGR_Route requests for that tenant with HTTP 403
3. WHEN a reactivation request is received for a suspended tenant, THE Tenant_Lifecycle_Service SHALL update the tenant status to `active` in `public.tenants`
4. WHEN a tenant status changes, THE Tenant_Lifecycle_Service SHALL invalidate the Redis cache entry for that tenant slug
5. IF a suspend request targets a tenant that is not in `active` status, THEN THE Tenant_Lifecycle_Service SHALL respond with HTTP 409 and error code `INVALID_TENANT_STATE`
6. IF a reactivation request targets a tenant that is not in `suspended` status, THEN THE Tenant_Lifecycle_Service SHALL respond with HTTP 409 and error code `INVALID_TENANT_STATE`

### Requirement 6: Tenant Lifecycle — Scheduled Deletion

**User Story:** As a Platform_Admin, I want to schedule tenant deletion with a grace period, so that accidental deletions can be reversed and data is properly cleaned up.

#### Acceptance Criteria

1. WHEN a deletion request is received, THE Tenant_Lifecycle_Service SHALL update the tenant status to `pending_deletion` and record `scheduled_deletion_at` as current timestamp plus 30 days
2. WHILE a tenant has status `pending_deletion`, THE Tenant_Resolution_Middleware SHALL reject all SGR_Route requests for that tenant with HTTP 403
3. WHEN the grace period expires (current time >= `scheduled_deletion_at`), THE Tenant_Lifecycle_Service SHALL execute `DROP SCHEMA sgr_{slug} CASCADE` and delete the tenant record from `public.tenants`
4. WHEN a reactivation request is received for a tenant with status `pending_deletion` before the grace period expires, THE Tenant_Lifecycle_Service SHALL update status to `active` and clear `scheduled_deletion_at`
5. THE Tenant_Lifecycle_Service SHALL remove all Redis cache keys prefixed with the tenant slug upon schema deletion
6. THE Tenant_Lifecycle_Service SHALL remove all S3 (Garage) objects with keys prefixed by the tenant slug upon schema deletion

### Requirement 7: JWT con claims de tenant

**User Story:** As a developer, I want the JWT to include tenant identification claims, so that authenticated requests can be routed to the correct tenant schema without additional lookups.

#### Acceptance Criteria

1. WHEN a user authenticates successfully, THE Auth_Service SHALL include `tenantId` (UUID) and `tenantSlug` (string) claims in the generated access token
2. WHEN a user authenticates successfully, THE Auth_Service SHALL include `tenantId` and `tenantSlug` claims in the generated refresh token
3. THE Auth_Service SHALL resolve the tenant from the request subdomain before querying the users table for credential validation
4. WHEN the login request subdomain does not match any active tenant, THE Auth_Service SHALL respond with HTTP 404 and error code `TENANT_NOT_FOUND`
5. THE JWT payload SHALL maintain the existing claims (sub, role, iat, exp, jti) in addition to the new tenant claims

### Requirement 8: Platform Admin API routes

**User Story:** As a Platform_Admin, I want API endpoints to manage tenants, so that I can create, list, inspect, suspend, and delete tenants through the Platform Admin panel.

#### Acceptance Criteria

1. THE Backend SHALL expose `POST /api/platform/tenants` that creates a new tenant and returns the tenant record with HTTP 201
2. THE Backend SHALL expose `GET /api/platform/tenants` that returns a paginated list of all tenants with their status, plan, and creation date
3. THE Backend SHALL expose `GET /api/platform/tenants/:id` that returns the full tenant detail including user count and storage usage metrics
4. THE Backend SHALL expose `PUT /api/platform/tenants/:id/suspend` that suspends the specified tenant
5. THE Backend SHALL expose `PUT /api/platform/tenants/:id/activate` that reactivates the specified tenant
6. THE Backend SHALL expose `DELETE /api/platform/tenants/:id` that schedules the tenant for deletion
7. WHEN a request to any Platform_Route lacks a valid JWT with role `platform_admin`, THE Backend SHALL respond with HTTP 403 and error code `PLATFORM_ACCESS_DENIED`

### Requirement 9: Redis cache key namespacing

**User Story:** As a developer, I want Redis cache keys to be namespaced by tenant, so that cached data is isolated between tenants and can be selectively invalidated.

#### Acceptance Criteria

1. WHEN an SGR_Route handler writes a cache entry to Redis, THE Backend SHALL prefix the key with `{tenantSlug}:` (e.g., `acme:refresh:userId:jti`)
2. WHEN an SGR_Route handler reads a cache entry from Redis, THE Backend SHALL prefix the key with the current tenant slug
3. THE Auth_Service SHALL prefix refresh token keys with the tenant slug (format: `{tenantSlug}:refresh:{userId}:{jti}`)
4. THE Auth_Service SHALL prefix blacklist keys with the tenant slug (format: `{tenantSlug}:blacklist:{jti}`)
5. WHEN a tenant is deleted, THE Tenant_Lifecycle_Service SHALL delete all Redis keys matching the pattern `{tenantSlug}:*`

### Requirement 10: S3 storage key namespacing

**User Story:** As a developer, I want S3 object keys to be namespaced by tenant, so that file storage is logically isolated and can be cleaned up per tenant.

#### Acceptance Criteria

1. WHEN a file is uploaded for a tenant, THE Backend SHALL store it with an S3 key prefixed by the tenant slug (format: `{tenantSlug}/documents/{uuid}/{filename}`)
2. WHEN a file is retrieved for a tenant, THE Backend SHALL construct the S3 key using the current tenant slug prefix
3. WHEN a tenant is deleted, THE Tenant_Lifecycle_Service SHALL delete all S3 objects with key prefix `{tenantSlug}/`
4. THE Backend SHALL maintain backward compatibility by mapping existing (non-prefixed) storage keys to the `default` tenant slug during migration

### Requirement 11: Migration del tenant existente al schema default

**User Story:** As a developer, I want the existing single-tenant data to be migrated into a `sgr_default` schema, so that the current deployment continues working seamlessly after the multi-tenancy upgrade.

#### Acceptance Criteria

1. WHEN the migration runs, THE Migration_Script SHALL create a tenant record in `public.tenants` with slug `default`, nombre `SGR Principal`, plan `starter`, and status `active`
2. WHEN the migration runs, THE Migration_Script SHALL create schema `sgr_default` and move all existing tenant-scoped tables from the public schema into `sgr_default`
3. WHEN the migration runs, THE Migration_Script SHALL preserve all existing data, constraints, indexes, and triggers during the schema move
4. WHEN the migration runs, THE Migration_Script SHALL keep the `catalogo_estados` table in the public schema as it is shared across all tenants
5. WHEN the migration completes, THE Application SHALL resolve the `default` tenant for requests without a subdomain (e.g., direct IP access or `localhost`)

### Requirement 12: Cross-schema migration runner

**User Story:** As a developer, I want a migration runner that applies DDL changes to all tenant schemas, so that schema evolution is consistent across all tenants.

#### Acceptance Criteria

1. WHEN a new migration is created, THE Migration_Runner SHALL apply the migration to every active tenant schema (all schemas matching `sgr_*`)
2. WHEN a migration fails in one tenant schema, THE Migration_Runner SHALL log the error with the tenant slug and continue applying to remaining schemas
3. THE Migration_Runner SHALL record applied migrations per schema to prevent duplicate execution
4. THE Migration_Runner SHALL execute migrations within a transaction per schema (rollback on failure within that schema only)
5. THE Migration_Runner SHALL apply migrations to the Schema_Template so that new tenants created after the migration receive the updated table structure

### Requirement 13: Frontend — Platform Admin panel

**User Story:** As a Platform_Admin, I want a web interface to manage tenants, so that I can perform tenant operations without direct API calls.

#### Acceptance Criteria

1. THE Frontend SHALL provide a page at `/admin/tenants` that displays a table of all tenants with columns: nombre, slug, plan, status, created_at
2. THE Frontend SHALL provide a page at `/admin/tenants/nuevo` with a form to create a new tenant (fields: nombre, slug, plan, admin email, admin password)
3. THE Frontend SHALL provide a page at `/admin/tenants/:id` that shows tenant details and action buttons (suspend, activate, delete)
4. WHEN the Platform_Admin clicks the suspend button, THE Frontend SHALL call `PUT /api/platform/tenants/:id/suspend` and update the displayed status
5. WHEN the Platform_Admin clicks the delete button, THE Frontend SHALL show a confirmation dialog explaining the 30-day grace period before calling `DELETE /api/platform/tenants/:id`
6. THE Frontend SHALL restrict access to `/admin/*` routes to users with role `platform_admin`; other roles SHALL be redirected to the SGR dashboard

### Requirement 14: Zero-change guarantee for SGR business code

**User Story:** As a developer, I want the existing SGR services and frontend to operate without any code modifications, so that the multi-tenancy layer is purely additive and does not introduce regressions.

#### Acceptance Criteria

1. THE Application SHALL execute all existing SGR service queries (clientes, tickets, forms, reactivos, kanban, assignments, observations, notifications, audit) without modification by relying on `search_path` for schema resolution
2. THE Application SHALL serve the existing frontend pages without changes; the frontend SHALL remain unaware of multi-tenancy
3. THE Application SHALL generate PDF reports using the same code path, operating within the resolved tenant schema context
4. WHILE the search_path is set to `sgr_{slug}, public`, THE Database SHALL resolve unqualified table references to the tenant schema first and then fall back to public for shared tables (catalogo_estados)

### Requirement 15: Connection pooling con schema isolation

**User Story:** As a developer, I want the database connection pool to correctly isolate search_path per request, so that concurrent requests to different tenants do not cross-contaminate.

#### Acceptance Criteria

1. WHEN a connection is acquired from the pool for a tenant request, THE Backend SHALL execute `SET search_path TO sgr_{slug}, public` before any query
2. WHEN a connection is returned to the pool after a request completes, THE Backend SHALL reset the search_path to `public` to prevent leakage
3. IF two concurrent requests for different tenants share the same pool, THE Backend SHALL guarantee that each request uses its own search_path setting without interference
4. THE Backend SHALL use a per-request transaction or per-request connection acquisition strategy to ensure search_path isolation

