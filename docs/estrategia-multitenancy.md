# Estrategia de Integración Multi-Tenant — SGR como Módulo Central

## Visión

El sistema actual (SGR) se convierte en el **módulo de Gestión de Ensayos** dentro de una plataforma más grande que atiende a N clientes (organizaciones/empresas). Cada cliente tiene su propio espacio aislado con sus usuarios, formularios, ensayos y datos.

```
┌─────────────────────────────────────────────────────────────────┐
│                    PLATAFORMA PRINCIPAL                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              CAPA DE TENANT (Multi-tenancy)               │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │  │
│  │  │Cliente A │  │Cliente B │  │Cliente C │  ... N        │  │
│  │  └─────┬────┘  └─────┬────┘  └─────┬────┘              │  │
│  └────────┼──────────────┼──────────────┼───────────────────┘  │
│           │              │              │                        │
│  ┌────────┼──────────────┼──────────────┼───────────────────┐  │
│  │        ▼              ▼              ▼                    │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │           MÓDULO: GESTIÓN DE ENSAYOS (SGR)          │ │  │
│  │  │  Kanban · Formularios · Tickets · Reactivos · PDF   │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │                                                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │ MÓDULO:      │  │ MÓDULO:      │  │ MÓDULO:      │  │  │
│  │  │ Facturación  │  │ Inventario   │  │ Reportes     │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  │                                                          │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │        SERVICIOS COMPARTIDOS                      │   │  │
│  │  │  Auth · Usuarios · Notificaciones · Auditoría    │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Estrategia Multi-Tenancy

### Opción A: Tenant por Columna (Recomendada para tu caso)

Cada tabla tiene una columna `tenant_id` que identifica a qué cliente pertenece el registro. Una sola base de datos, un solo deploy.

**Ventajas:** Simple, bajo costo, fácil de mantener.
**Desventajas:** Riesgo de data leak si falta un filtro; todas las queries deben incluir `WHERE tenant_id = X`.

```sql
-- Ejemplo: tabla reactivos con tenant
ALTER TABLE reactivos ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
CREATE INDEX idx_reactivos_tenant ON reactivos(tenant_id);
```

### Opción B: Schema por Tenant

Cada cliente tiene su propio schema PostgreSQL (`cliente_a.reactivos`, `cliente_b.reactivos`). Mismo server de BD.

**Ventajas:** Aislamiento completo de datos, fácil backup por cliente.
**Desventajas:** Más complejo de migrar, más difícil de hacer queries cross-tenant.

### Opción C: Base de Datos por Tenant

Cada cliente tiene su propia base de datos. Máximo aislamiento.

**Ventajas:** Aislamiento total, compliance.
**Desventajas:** Más costoso, más complejo de gestionar.

### Recomendación

**Para iniciar: Opción A** (tenant por columna). Cuando crezcas a +50 clientes o tengas requerimientos de compliance, migras a Opción B.

---

## Cambios Estructurales Necesarios

### 1. Nueva entidad: Tenant (Organización/Cliente)

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,       -- para subdominios: slug.tuapp.com
  plan VARCHAR(50) NOT NULL DEFAULT 'basic', -- basic, pro, enterprise
  is_active BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}',       -- configuración por tenant
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2. Agregar `tenant_id` a todas las tablas principales

```
users           + tenant_id  (un usuario pertenece a un tenant)
forms           + tenant_id
form_versions   (hereda del form)
reactivos       + tenant_id
tickets         + tenant_id
clientes        + tenant_id  (los "clientes" del módulo son sub-clientes del tenant)
sla_config      + tenant_id
reglas_asignacion + tenant_id
notifications   + tenant_id
audit_logs      + tenant_id
```

### 3. Nuevo rol: Super Admin de Plataforma

```
Roles actuales (dentro de un tenant):
  superusuario, admin, manager, tecnico, asistente

Nuevo rol (nivel plataforma):
  platform_admin — gestiona tenants, planes, billing
```

---

## Arquitectura Target

```
┌───────────────────────────────────────────────────────────────────────┐
│                         GATEWAY / ROUTER                               │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Nginx / Traefik / API Gateway                                  │ │
│  │  - Resuelve tenant por: subdomain, header, o path prefix        │ │
│  │  - Rutea a los servicios correctos                              │ │
│  │  - SSL termination                                               │ │
│  └──────────────────────────┬──────────────────────────────────────┘ │
└─────────────────────────────┼─────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            ▼                 ▼                 ▼
┌───────────────────┐ ┌──────────────┐ ┌──────────────────┐
│  Portal Admin     │ │  App Tenant  │ │  Landing/Billing │
│  (Platform)       │ │  (SGR actual)│ │                  │
│  Gestión tenants  │ │  + tenant_id │ │  Signup, planes  │
│  Billing          │ │  context     │ │  Portal público  │
│  Métricas         │ │              │ │                  │
└───────────────────┘ └──────────────┘ └──────────────────┘
```

---

## Estrategia de Migración (Fases)

### Fase 1: Preparación (sin romper nada)

**Objetivo:** Agregar la capa de tenant al código actual sin cambiar el comportamiento.

1. Crear tabla `tenants`
2. Crear un tenant "default" para todos los datos existentes
3. Agregar columna `tenant_id` a todas las tablas (con default al tenant "default")
4. Agregar middleware de tenant que inyecta `request.tenantId` desde el JWT o header
5. Agregar filtro `WHERE tenant_id = ?` a todas las queries del servicio

**Impacto:** Cero para usuarios actuales. Todo sigue funcionando como single-tenant.

### Fase 2: Autenticación Multi-Tenant

**Objetivo:** Un usuario puede pertenecer a un tenant; el login resuelve el tenant.

1. Agregar `tenant_id` al JWT payload
2. Modificar login para incluir tenant context
3. Implementar resolución de tenant:
   - Por subdomain: `cliente-a.tuapp.com`
   - O por selección post-login (si un user pertenece a múltiples tenants)
4. Crear endpoint `POST /api/tenants` para crear nuevas organizaciones

### Fase 3: Panel de Administración de Plataforma

**Objetivo:** Un super-admin puede gestionar todos los tenants.

1. Nuevo frontend: `/admin` (solo platform_admin)
2. CRUD de tenants (crear, suspender, configurar)
3. Dashboard con métricas por tenant (usuarios, ensayos, storage)
4. Configuración de planes y límites

### Fase 4: Aislamiento y Features por Plan

**Objetivo:** Cada tenant tiene límites según su plan.

1. Configuración por tenant en `tenants.config`:
   ```json
   {
     "maxUsers": 20,
     "maxForms": 10,
     "maxStorageMB": 500,
     "features": ["pdf", "sla", "auto-assignment"]
   }
   ```
2. Middleware que verifica límites antes de crear recursos
3. Feature flags por tenant

### Fase 5: Billing y Self-Service

**Objetivo:** Clientes pueden registrarse, elegir plan, pagar.

1. Integración con Stripe/Conekta para pagos
2. Portal de onboarding self-service
3. Upgrade/downgrade de planes
4. Facturación automática

---

## Estructura de Código Propuesta (Monorepo escalado)

```
packages/
├── platform/                    # NUEVO: Admin de plataforma
│   ├── src/
│   │   ├── tenants/            # CRUD tenants
│   │   ├── billing/            # Planes, pagos
│   │   └── metrics/            # Dashboard métricas
│   └── package.json
│
├── core/                        # NUEVO: Servicios compartidos
│   ├── src/
│   │   ├── auth/               # Extraído del backend actual
│   │   ├── users/              # Extraído del backend actual
│   │   ├── notifications/
│   │   ├── audit/
│   │   └── tenant-context/     # Middleware de resolución de tenant
│   └── package.json
│
├── ensayos/                     # RENOMBRADO: El SGR actual
│   ├── src/
│   │   ├── forms/
│   │   ├── reactivos/
│   │   ├── kanban/
│   │   ├── tickets/
│   │   ├── clientes/          # Sub-clientes del tenant
│   │   └── pdf/
│   └── package.json
│
├── frontend-app/                # RENOMBRADO: Frontend del tenant
│   └── src/
│       ├── app/(dashboard)/    # Todas las vistas actuales
│       └── ...
│
├── frontend-admin/              # NUEVO: Frontend admin plataforma
│   └── src/
│       ├── app/tenants/
│       ├── app/billing/
│       └── app/metrics/
│
└── shared/                      # Tipos, utilidades compartidas
    └── src/
        ├── types/
        └── utils/
```

---

## Resolución de Tenant en Práctica

```typescript
// Middleware que se ejecuta en cada request
export function tenantMiddleware(request, reply) {
  // Opción 1: desde subdomain
  const host = request.headers.host; // "cliente-a.tuapp.com"
  const slug = host.split('.')[0];
  
  // Opción 2: desde JWT (después de login)
  const tenantId = request.user?.tenantId;
  
  // Opción 3: desde header custom
  const tenantId = request.headers['x-tenant-id'];
  
  // Inyectar en el request para que todos los servicios lo usen
  request.tenantId = tenantId;
}

// Todos los servicios filtran por tenant:
class ReactivoService {
  async list(tenantId: string, filters: Filters) {
    return db.select()
      .from(reactivos)
      .where(and(
        eq(reactivos.tenantId, tenantId),  // ← siempre filtra
        ...otherFilters
      ));
  }
}
```

---

## Resumen de Esfuerzo

| Fase | Duración estimada | Complejidad |
|---|---|---|
| Fase 1: Preparación tenant_id | 1-2 semanas | Baja (mecánico) |
| Fase 2: Auth multi-tenant | 1 semana | Media |
| Fase 3: Panel admin plataforma | 2-3 semanas | Media |
| Fase 4: Planes y límites | 1-2 semanas | Media |
| Fase 5: Billing self-service | 3-4 semanas | Alta |

**Total para MVP multi-tenant funcional (Fases 1-3):** ~4-6 semanas.

---

## Decisiones Clave a Tomar

1. **¿Subdominio por cliente o path?**
   - `cliente.tuapp.com` (más profesional, requiere wildcard DNS)
   - `tuapp.com/t/cliente` (más simple, un solo dominio)

2. **¿Un usuario puede pertenecer a múltiples tenants?**
   - Si sí → tabla intermedia `user_tenants` con roles por tenant
   - Si no → `users.tenant_id` directo

3. **¿Los formularios (normas) son compartidos entre tenants o cada uno tiene los suyos?**
   - Compartidos → tabla `global_forms` + `tenant_forms` (override)
   - Independientes → cada tenant sube sus propios

4. **¿El técnico trabaja para un solo tenant o para varios?**
   - Un solo tenant → relación directa
   - Varios → modelo de "freelancer" con invitaciones
