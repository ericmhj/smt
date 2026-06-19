# Preparación Mínima Multi-Tenancy — Sin Keycloak

## Objetivo

Preparar el código del SGR para soportar múltiples tenants (organizaciones) con cambios mínimos que NO rompan la operación actual. El sistema sigue funcionando exactamente igual para el usuario, pero internamente ya está listo para cuando lleguen más clientes.

---

## ¿Qué cambia para el usuario final?

**NADA.** El sistema se ve y opera exactamente igual. Los cambios son internos.

---

## ¿Qué cambia en la operación?

| Aspecto | Antes | Después |
|---|---|---|
| Login | Igual | Igual |
| Funcionalidad | Igual | Igual |
| Base de datos | 15 tablas | 16 tablas (+tenants) + columna tenant_id |
| Performance | Igual | Igual (índice compuesto lo cubre) |
| Deploy | Igual | Igual (solo rebuild backend) |
| Comandos docker | Igual | Igual |

---

## Cambios Técnicos

### 1. Nueva tabla: `tenants`

```sql
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  plan VARCHAR(50) NOT NULL DEFAULT 'starter',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant por defecto (el actual)
INSERT INTO tenants (id, nombre, slug, plan) VALUES
  ('00000000-0000-0000-0000-000000000001', 'SGR Principal', 'default', 'starter');
```

### 2. Columna `tenant_id` en todas las tablas principales

```sql
-- Se agrega a cada tabla con DEFAULT al tenant 'default'
ALTER TABLE users ADD COLUMN tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id);
ALTER TABLE forms ADD COLUMN tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id);
ALTER TABLE reactivos ADD COLUMN tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id);
ALTER TABLE tickets ADD COLUMN tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id);
ALTER TABLE clientes ADD COLUMN tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id);
ALTER TABLE form_assignments ADD COLUMN tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id);
ALTER TABLE sla_config ADD COLUMN tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id);
ALTER TABLE reglas_asignacion ADD COLUMN tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id);
ALTER TABLE notifications ADD COLUMN tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id);
ALTER TABLE audit_logs ADD COLUMN tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id);
ALTER TABLE observations ADD COLUMN tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id);
ALTER TABLE signatures ADD COLUMN tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id);

-- Índices para performance
CREATE INDEX CONCURRENTLY idx_users_tenant ON users(tenant_id);
CREATE INDEX CONCURRENTLY idx_forms_tenant ON forms(tenant_id);
CREATE INDEX CONCURRENTLY idx_reactivos_tenant ON reactivos(tenant_id);
CREATE INDEX CONCURRENTLY idx_tickets_tenant ON tickets(tenant_id);
CREATE INDEX CONCURRENTLY idx_clientes_tenant ON clientes(tenant_id);
```

**Impacto:** Cero en queries existentes. El DEFAULT asegura que todos los registros actuales pertenecen al tenant "default". Las queries sin filtro de tenant siguen funcionando.

### 3. Nuevo Middleware: `TenantContext`

```typescript
// packages/backend/src/lib/tenant-context.ts
import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantInfo {
  id: string;
  slug: string;
  plan: string;
}

const tenantStorage = new AsyncLocalStorage<TenantInfo>();

// Valor por defecto (single-tenant mode)
const DEFAULT_TENANT: TenantInfo = {
  id: '00000000-0000-0000-0000-000000000001',
  slug: 'default',
  plan: 'starter',
};

export function getTenantContext(): TenantInfo {
  return tenantStorage.getStore() || DEFAULT_TENANT;
}

export function runWithTenant<T>(tenant: TenantInfo, fn: () => T): T {
  return tenantStorage.run(tenant, fn);
}
```

```typescript
// Hook en Fastify (se ejecuta después de auth middleware)
// packages/backend/src/lib/tenant-middleware.ts
import type { FastifyRequest, FastifyReply } from 'fastify';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export async function tenantMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Por ahora: siempre usa el tenant default
  // En el futuro: lee del JWT claim 'tid' o del header X-Tenant-Id
  request.tenantId = DEFAULT_TENANT_ID;
}
```

**Impacto en operación:** Cero. Siempre retorna el tenant "default".

### 4. Preparar los Services (gradual, no obligatorio)

Los services pueden empezar a usar `request.tenantId` en sus queries. Pero como el default cubre todo, no es urgente.

```typescript
// Ejemplo futuro en cliente.service.ts (NO obligatorio ahora):
async list(filters, pagination, tenantId: string) {
  const conditions = [eq(clientes.tenantId, tenantId)]; // ← agrega filtro
  // ... resto igual
}
```

**Esto se puede hacer gradualmente**, un service a la vez, sin deadline.

---

## Archivos Modificados

| Archivo | Tipo de cambio | Urgencia |
|---|---|---|
| `packages/backend/src/db/init.sql` | Agregar tabla tenants + columnas tenant_id | Fase 1 |
| `packages/backend/src/db/schema/tenants.ts` | Nuevo schema Drizzle | Fase 1 |
| `packages/backend/src/db/schema/index.ts` | Export nuevo schema | Fase 1 |
| `packages/backend/src/db/schema/users.ts` | + campo tenantId | Fase 1 |
| `packages/backend/src/db/schema/forms.ts` | + campo tenantId | Fase 1 |
| `packages/backend/src/db/schema/reactivos.ts` | + campo tenantId | Fase 1 |
| `packages/backend/src/db/schema/clientes.ts` | + campo tenantId | Fase 1 |
| `packages/backend/src/db/schema/tickets.ts` | + campo tenantId | Fase 1 |
| `packages/backend/src/lib/tenant-context.ts` | Nuevo archivo | Fase 1 |
| `packages/backend/src/lib/tenant-middleware.ts` | Nuevo archivo | Fase 1 |
| `packages/backend/src/app.ts` | Registrar tenant middleware | Fase 1 |
| `packages/backend/src/db/seed.ts` | Crear tenant default | Fase 1 |

**NO se modifican:** Ningún service, ninguna ruta, ningún componente frontend.

---

## Archivos que NO Cambian

- Frontend completo (ningún cambio)
- Todos los `*.service.ts` (operan igual)
- Todos los `*.routes.ts` (operan igual)
- Docker compose (igual)
- Package.json (igual)

---

## Cómo se activa Multi-Tenant después

Cuando llegue el momento de tener 2+ clientes:

### Paso 1: Crear nuevo tenant en la BD
```sql
INSERT INTO tenants (nombre, slug, plan) VALUES ('ACME Corp', 'acme', 'professional');
```

### Paso 2: Activar el filtro en el middleware
```typescript
// Cambiar de:
request.tenantId = DEFAULT_TENANT_ID;

// A:
request.tenantId = request.user?.tenantId || DEFAULT_TENANT_ID;
// (el tenantId viene del JWT cuando se integre KC)
```

### Paso 3: Agregar filtros a los services (gradual)
```typescript
// En cada service, agregar:
.where(eq(tabla.tenantId, tenantId))
```

### Paso 4 (opcional): Activar RLS
```sql
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clientes
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

---

## Timeline y Esfuerzo

| Tarea | Tiempo | Riesgo |
|---|---|---|
| Crear tabla tenants + seed | 30 min | Ninguno |
| Agregar columna tenant_id a tablas | 1 hora | Bajo (nullable con default) |
| Agregar índices | 30 min | Ninguno |
| Crear schemas Drizzle actualizados | 1 hora | Bajo |
| Crear TenantContext + middleware | 1 hora | Ninguno (no-op por ahora) |
| Registrar en app.ts | 15 min | Ninguno |
| Actualizar seed | 30 min | Ninguno |
| **Total** | **~5 horas** | **Bajo** |

---

## Verificación Post-Cambio

Después de aplicar:
```powershell
docker compose down -v ; docker compose up --build -d
```

Todo debe funcionar exactamente igual:
- Login con todas las cuentas ✓
- CRUD clientes ✓
- Crear tickets ✓
- Kanban D&D ✓
- Llenar ensayos ✓
- Generar PDF ✓

La única diferencia: si consultas la BD, verás `tenant_id` en cada fila apuntando al mismo UUID default.

---

## Resumen

| Pregunta | Respuesta |
|---|---|
| ¿El usuario nota algo? | No |
| ¿Cambia algún endpoint? | No |
| ¿Se rompe algo? | No (los defaults cubren todo) |
| ¿Cuánto toma? | ~5 horas |
| ¿Es reversible? | Sí (DROP COLUMN tenant_id) |
| ¿Necesita KC? | No |
| ¿Facilita KC después? | Sí (la estructura ya existe) |
| ¿Facilita segundo cliente? | Sí (solo INSERT en tenants + asignar tenant_id) |
