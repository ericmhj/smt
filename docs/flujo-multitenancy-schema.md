# Flujo Multi-Tenancy con Schema por Tenant

## ¿Se agregan pantallas nuevas?

**Sí, pero son un sistema separado (Portal de Plataforma).** El SGR actual no cambia.

Quedarían **dos aplicaciones frontend** independientes:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SISTEMA COMPLETO                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────┐  ┌──────────────────────────┐ │
│  │   APP 1: PORTAL DE PLATAFORMA   │  │   APP 2: SGR (actual)    │ │
│  │   (NUEVO — admin de tenants)     │  │   (NO CAMBIA)            │ │
│  │                                  │  │                          │ │
│  │   URL: admin.sgr-platform.com    │  │   URL: {tenant}.sgr.com  │ │
│  │                                  │  │                          │ │
│  │   Pantallas:                     │  │   Pantallas actuales:    │ │
│  │   • Login platform admin         │  │   • Kanban Manager       │ │
│  │   • Lista de tenants             │  │   • Kanban Técnico       │ │
│  │   • Crear tenant                 │  │   • Formularios          │ │
│  │   • Configurar tenant            │  │   • Asignaciones         │ │
│  │   • Ver métricas                 │  │   • Clientes             │ │
│  │   • Suspender/activar tenant     │  │   • Tickets              │ │
│  │   • Planes y billing             │  │   • Configuración SLA    │ │
│  │                                  │  │   • Usuarios (del tenant)│ │
│  │   Roles:                         │  │                          │ │
│  │   • PLATFORM_ADMIN               │  │   Roles (dentro del      │ │
│  │                                  │  │   tenant):               │ │
│  │   BD: schema 'public'            │  │   • admin, manager,      │ │
│  │   (solo tabla tenants +          │  │     tecnico, asistente   │ │
│  │    planes + billing)             │  │                          │ │
│  │                                  │  │   BD: schema 'sgr_{slug}'│ │
│  └─────────────────────────────────┘  └──────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Pantallas Nuevas (Solo en el Portal de Plataforma)

| Pantalla | Función | Quién la usa |
|---|---|---|
| `/admin/login` | Login del platform admin | Solo platform admins |
| `/admin/tenants` | Lista de todos los tenants con estado, plan, usuarios | Platform admin |
| `/admin/tenants/nuevo` | Crear nuevo tenant (genera schema + usuario admin) | Platform admin |
| `/admin/tenants/:id` | Detalle del tenant (métricas, configuración, acciones) | Platform admin |
| `/admin/planes` | Configurar planes y features | Platform admin |
| `/admin/billing` | Ver pagos, facturas, suscripciones | Platform admin |

**El SGR actual NO tiene pantallas nuevas.** Solo recibe el `search_path` correcto según el tenant logueado.

---

## ¿Son sistemas independientes?

**Sí y no:**
- **Frontend:** Son 2 apps separadas (o 2 rutas en la misma app Next.js)
- **Backend:** Comparten el MISMO backend Fastify, pero con rutas separadas
- **Base de datos:** Comparten el MISMO PostgreSQL, pero usan schemas diferentes

```
┌────────────────────────────────────────────────────────────────┐
│                    MISMA BASE DE DATOS PostgreSQL               │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Schema: public                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  tenants          (catálogo de organizaciones)            │ │
│  │  plans            (catálogo de planes)                    │ │
│  │  billing_events   (historial de pagos)                    │ │
│  │  platform_admins  (usuarios de plataforma)                │ │
│  │  catalogo_estados (compartido por todos los tenants)      │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  Schema: sgr_acme                                              │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  users, forms, form_versions, form_assignments,           │ │
│  │  reactivos, state_transitions, tickets, clientes,         │ │
│  │  cliente_contactos, cliente_documentos, sla_config,       │ │
│  │  reglas_asignacion, observations, notifications,          │ │
│  │  audit_logs, signatures                                   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  Schema: sgr_labfarma                                          │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  (mismas 15 tablas, datos independientes de ACME)         │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Flujo de Información Completo

### Flujo 1: Platform Admin crea un nuevo tenant

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Portal     │         │   Backend    │         │  PostgreSQL  │
│  Plataforma  │         │   (Fastify)  │         │              │
└──────┬───────┘         └──────┬───────┘         └──────┬───────┘
       │                        │                        │
       │ POST /api/platform/    │                        │
       │      tenants           │                        │
       │ {nombre, slug, plan,   │                        │
       │  adminEmail, password} │                        │
       │───────────────────────►│                        │
       │                        │                        │
       │                        │ 1. INSERT INTO public. │
       │                        │    tenants (...)       │
       │                        │───────────────────────►│
       │                        │                        │
       │                        │ 2. CREATE SCHEMA       │
       │                        │    sgr_{slug}          │
       │                        │───────────────────────►│
       │                        │                        │
       │                        │ 3. Ejecutar init.sql   │
       │                        │    dentro del schema   │
       │                        │    (crea 15 tablas)    │
       │                        │───────────────────────►│
       │                        │                        │
       │                        │ 4. INSERT INTO         │
       │                        │    sgr_{slug}.users    │
       │                        │    (admin del tenant)  │
       │                        │───────────────────────►│
       │                        │                        │
       │                        │ 5. Seed: catálogos,    │
       │                        │    SLA defaults        │
       │                        │───────────────────────►│
       │                        │                        │
       │  ◄── 201 Created ─────│                        │
       │  {tenant, credentials} │                        │
       │                        │                        │
```

**Resultado:** El tenant "ACME" tiene su propio schema con todas las tablas listas. Su admin puede loguearse en `acme.sgr.com`.

---

### Flujo 2: Usuario del tenant usa el SGR

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│  SGR App     │         │   Backend    │         │  PostgreSQL  │
│ acme.sgr.com │         │   (Fastify)  │         │              │
└──────┬───────┘         └──────┬───────┘         └──────┬───────┘
       │                        │                        │
       │ POST /api/auth/login   │                        │
       │ {email, password}      │                        │
       │ Header: Host=acme.sgr  │                        │
       │───────────────────────►│                        │
       │                        │                        │
       │                        │ 1. Resuelve tenant     │
       │                        │    del subdominio      │
       │                        │    "acme" → schema     │
       │                        │    "sgr_acme"          │
       │                        │                        │
       │                        │ 2. SET search_path     │
       │                        │    TO sgr_acme, public │
       │                        │───────────────────────►│
       │                        │                        │
       │                        │ 3. SELECT * FROM users │
       │                        │    WHERE email = ?     │
       │                        │    (busca en sgr_acme) │
       │                        │───────────────────────►│
       │                        │                        │
       │  ◄── JWT con tenant ───│                        │
       │  {tid: 'acme-uuid',   │                        │
       │   role: 'manager'}    │                        │
       │                        │                        │
       │ GET /api/clientes      │                        │
       │ Authorization: Bearer  │                        │
       │───────────────────────►│                        │
       │                        │                        │
       │                        │ 4. Del JWT extrae      │
       │                        │    tenantId → slug     │
       │                        │    → search_path       │
       │                        │                        │
       │                        │ 5. SET search_path     │
       │                        │    TO sgr_acme, public │
       │                        │───────────────────────►│
       │                        │                        │
       │                        │ 6. SELECT * FROM       │
       │                        │    clientes            │
       │                        │    (de sgr_acme)       │
       │                        │───────────────────────►│
       │                        │                        │
       │  ◄── datos del tenant ─│                        │
       │  (solo clientes ACME)  │                        │
```

**Punto clave:** La query `SELECT * FROM clientes` es IDÉNTICA a la actual. El aislamiento viene del `search_path`, no del código.

---

### Flujo 3: Cómo interactúan Portal y SGR

```
┌──────────────────────────────────────────────────────────────────┐
│                      MISMO BACKEND FASTIFY                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────┐  ┌──────────────────────────┐│
│  │ RUTAS DE PLATAFORMA          │  │ RUTAS DEL SGR (actuales) ││
│  │ (nuevas, schema: public)      │  │ (schema: sgr_{slug})     ││
│  │                               │  │                          ││
│  │ POST /api/platform/tenants    │  │ GET  /api/clientes       ││
│  │ GET  /api/platform/tenants    │  │ POST /api/tickets        ││
│  │ PUT  /api/platform/tenants/:id│  │ GET  /api/kanban         ││
│  │ POST /api/platform/tenants/   │  │ POST /api/reactivos/submit││
│  │      :id/suspend              │  │ GET  /api/forms          ││
│  │ GET  /api/platform/metrics    │  │ ... todas las actuales   ││
│  │ GET  /api/platform/plans      │  │                          ││
│  │                               │  │                          ││
│  │ Guard: platform_admin role    │  │ Guard: roles del tenant  ││
│  └──────────────────────────────┘  └──────────────────────────┘│
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │               TENANT RESOLUTION MIDDLEWARE                    ││
│  │                                                              ││
│  │  IF ruta = /api/platform/*  → search_path = public           ││
│  │  IF ruta = /api/*           → search_path = sgr_{tenant}     ││
│  └──────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

---

## Resumen de Interacción

| Pregunta | Respuesta |
|---|---|
| ¿Son sistemas independientes? | **No.** Comparten el mismo backend y la misma BD. Son rutas/módulos diferentes. |
| ¿Se agregan pantallas al SGR? | **No.** El SGR actual no cambia. Las pantallas nuevas son del Portal de Plataforma. |
| ¿Cómo sabe el SGR qué tenant es? | Del subdominio (acme.sgr.com) o del claim `tid` en el JWT. |
| ¿Cómo se comunican? | A través de la misma BD. Portal escribe en `public.tenants`, SGR lee de `sgr_{slug}.*` |
| ¿Se despliegan juntos? | Sí. Un solo `docker compose up` levanta todo. |
| ¿Pueden escalar por separado? | Sí. El Portal es ligero (pocos requests). El SGR es pesado (muchos requests por tenant). |

---

## Opción A vs B de Deploy

### Opción A: Misma app Next.js (más simple)

```
packages/frontend/src/app/
├── (dashboard)/           ← SGR actual (rutas del tenant)
│   ├── kanban/
│   ├── clientes/
│   ├── tickets/
│   └── ...
├── (platform)/            ← Portal nuevo (rutas de plataforma)
│   ├── tenants/
│   ├── planes/
│   └── billing/
└── login/
```

**Ventaja:** Un solo deploy, un solo frontend.
**Desventaja:** El bundle incluye código que no todos necesitan.

### Opción B: Dos apps separadas (más escalable)

```
packages/
├── frontend-sgr/          ← SGR actual (para tenants)
├── frontend-admin/        ← Portal nuevo (para platform admins)
└── backend/               ← Compartido
```

**Ventaja:** Deployments independientes, bundles más pequeños.
**Desventaja:** Dos contenedores frontend, más configuración.

**Recomendación:** Opción A para empezar (más simple). Si crece mucho, separar después.

---

## Lo que NO cambia en el SGR actual

- Ningún componente frontend
- Ningún service de backend
- Ninguna ruta de la API
- Ningún schema Drizzle
- La lógica de Kanban, tickets, ensayos, clientes
- Los roles dentro del tenant (admin, manager, tecnico, asistente)
- El seed de datos de prueba
- Docker compose (solo se agrega un paso de creación de schema)
