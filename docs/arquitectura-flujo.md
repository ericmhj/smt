# Arquitectura y Flujo de Información — SGR

## Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                           │
│                        Puerto: 3000                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  /kanban  │  │  /forms  │  │/clientes │  │ /tickets │          │
│  │  Manager  │  │Admin/Mgr │  │ Mgr/Asis │  │ Mgr/Asis │          │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘          │
│        │              │              │              │                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                         │
│  │/my-kanban│  │/my-forms │  │/configur │                          │
│  │ Técnico  │  │ Técnico  │  │  Manager │                          │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘                         │
│        │              │              │                               │
│  ┌─────────────────────────────────────────────────┐               │
│  │              lib/api.ts (fetch + JWT)            │               │
│  └──────────────────────┬──────────────────────────┘               │
└─────────────────────────┼───────────────────────────────────────────┘
                          │ HTTP (REST API)
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       BACKEND (Fastify)                              │
│                       Puerto: 3001                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                 Auth Middleware (JWT RS256)                   │   │
│  │          Valida token → inyecta request.user                 │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────┼──────────────────────────────────┐   │
│  │                    MÓDULOS (Routes + Service)                 │   │
│  │                                                              │   │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────────┐     │   │
│  │  │  Auth   │ │  Users  │ │  Forms   │ │ Assignments │     │   │
│  │  │/api/auth│ │/api/user│ │/api/forms│ │/api/assignm.│     │   │
│  │  └────┬────┘ └────┬────┘ └────┬─────┘ └──────┬──────┘     │   │
│  │       │            │           │               │             │   │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌───────────┐       │   │
│  │  │ Kanban  │ │Reactivos│ │ Clientes │ │  Tickets  │       │   │
│  │  │/api/kanb│ │/api/reac│ │/api/clien│ │/api/ticket│       │   │
│  │  └────┬────┘ └────┬────┘ └────┬─────┘ └──────┬────┘       │   │
│  │       │            │           │               │             │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │   │
│  │  │Signatures│ │Observat. │ │  Notify  │ │  Audit   │      │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                       SERVICIOS INTERNOS                     │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────────────────┐   │   │
│  │  │PDFService │  │SLAService │  │AsignacionService      │   │   │
│  │  │(Puppeteer)│  │(BullMQ)   │  │(BullMQ workers)       │   │   │
│  │  └───────────┘  └───────────┘  └───────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────┬────────────────────┬────────────────────┬──────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
│  PostgreSQL  │   │    Redis     │   │   Garage (S3)    │
│  Puerto:5432 │   │  Puerto:6379 │   │   Puerto:3900    │
│              │   │              │   │                  │
│  - users     │   │  - JWT black │   │  - documentos    │
│  - forms     │   │    list      │   │    de clientes   │
│  - reactivos │   │  - refresh   │   │  - archivos de   │
│  - tickets   │   │    tokens    │   │    observaciones │
│  - clientes  │   │  - cache de  │   │                  │
│  - sla_config│   │    estados   │   │                  │
│  - audit_logs│   │  - BullMQ    │   │                  │
│  - etc.      │   │    queues    │   │                  │
└──────────────┘   └──────────────┘   └──────────────────┘
```

---

## Flujo Principal: Creación de Ensayo

```
Manager/Asistente                   Backend                      Base de Datos
      │                               │                              │
      │  POST /api/tickets            │                              │
      │  {clienteId, formId,          │                              │
      │   tecnicoId, prioridad}       │                              │
      │──────────────────────────────►│                              │
      │                               │  1. Valida SLA config        │
      │                               │─────────────────────────────►│
      │                               │  2. Obtiene datos cliente    │
      │                               │─────────────────────────────►│
      │                               │  3. Obtiene form version     │
      │                               │─────────────────────────────►│
      │                               │  4. Crea reactivo            │
      │                               │     (responses=datos cliente)│
      │                               │─────────────────────────────►│
      │                               │  5. Crea ticket              │
      │                               │     (vinculado al reactivo)  │
      │                               │─────────────────────────────►│
      │                               │                              │
      │  ◄─────── 201 Created ────────│                              │
      │                               │                              │

Técnico                             Backend                      Base de Datos
      │                               │                              │
      │  GET /api/kanban?tecnicoId=X  │                              │
      │──────────────────────────────►│  Consulta reactivos          │
      │                               │─────────────────────────────►│
      │  ◄── Tablero con tarjetas ────│                              │
      │                               │                              │
      │  Click tarjeta (Programado)   │                              │
      │  GET /api/reactivos/:id/form  │                              │
      │──────────────────────────────►│  Obtiene HTML + schema       │
      │                               │─────────────────────────────►│
      │  ◄── {sanitizedHtml, schema} ─│                              │
      │                               │                              │
      │  GET /api/reactivos/:id       │                              │
      │──────────────────────────────►│  Obtiene responses           │
      │                               │  (datos cliente pre-llenados)│
      │  ◄── {responses: {...}} ──────│                              │
      │                               │                              │
      │  [Muestra form con datos      │                              │
      │   del cliente en Sección 6]   │                              │
      │                               │                              │
      │  POST /api/reactivos/:id/submit                              │
      │  {responses: {...completos}}  │                              │
      │──────────────────────────────►│  1. Valida rol + ownership   │
      │                               │  2. Valida state=pendiente   │
      │                               │  3. Valida vs JSON schema    │
      │                               │  4. UPDATE responses + state │
      │                               │─────────────────────────────►│
      │                               │  5. Sync ticket → en_revision│
      │                               │─────────────────────────────►│
      │  ◄── 200 {state:en_revision} ─│                              │
      │                               │                              │
```

---

## Flujo: Transición en Kanban del Manager

```
Manager                             Backend                      Base de Datos
      │                               │                              │
      │  [Drag & Drop tarjeta]        │                              │
      │  POST /api/kanban/:id/transition                             │
      │  {toState, signatureId,       │                              │
      │   reason?}                    │                              │
      │──────────────────────────────►│  1. Valida role=manager      │
      │                               │  2. Valida state machine     │
      │                               │  3. INSERT state_transitions │
      │                               │─────────────────────────────►│
      │                               │  4. UPDATE reactivo.state    │
      │                               │─────────────────────────────►│
      │                               │  5. Sync ticket state        │
      │                               │─────────────────────────────►│
      │  ◄── 200 OK ─────────────────│                              │
      │                               │                              │
```

---

## Estructura de Módulos (Backend)

```
packages/backend/src/
├── app.ts                          # Entry point, registra plugins y rutas
├── index.ts                        # Server bootstrap
├── db/
│   ├── index.ts                    # Conexión Drizzle + PostgreSQL
│   ├── init.sql                    # DDL completo (creación de tablas)
│   ├── seed.ts                     # Datos iniciales
│   ├── seed-data/                  # Archivos estáticos para seed
│   ├── migrations/                 # Migraciones incrementales
│   └── schema/                     # Definiciones Drizzle ORM
│       ├── users.ts
│       ├── forms.ts
│       ├── reactivos.ts
│       ├── clientes.ts
│       ├── tickets.ts
│       ├── notifications.ts
│       ├── observations.ts
│       ├── signatures.ts
│       ├── audit.ts
│       └── index.ts               # Re-exporta todo
├── lib/
│   ├── config.ts                   # Variables de entorno
│   ├── redis.ts                    # Cliente Redis singleton
│   ├── minio.ts                    # Cliente S3 (Garage)
│   ├── security.ts                 # Helmet + Rate limit configs
│   ├── error-handler.ts            # Error handler global
│   └── swagger.ts                  # OpenAPI docs
└── modules/
    ├── auth/                       # Login, refresh, logout, JWT
    ├── users/                      # CRUD usuarios + RBAC middleware
    ├── forms/                      # CRUD formularios + versioning
    ├── assignments/                # Asignación form→técnico
    ├── reactivos/                  # CRUD reactivos + submit + PDF
    ├── kanban/                     # Tablero + transiciones
    ├── clientes/                   # CRUD clientes + docs + búsqueda
    ├── tickets/                    # CRUD tickets + SLA + reglas
    ├── signatures/                 # Firmas electrónicas
    ├── observations/               # Observaciones + archivos
    ├── notifications/              # Notificaciones in-app
    ├── audit/                      # Logs de auditoría
    └── catalogs/                   # Catálogos (estados)
```

---

## Estructura de Módulos (Frontend)

```
packages/frontend/src/
├── app/
│   ├── (dashboard)/               # Layout con Sidebar + Header
│   │   ├── kanban/                # Kanban del Manager
│   │   ├── my-kanban/             # Kanban del Técnico
│   │   ├── forms/                 # Gestión de formularios
│   │   ├── my-forms/             # Formularios del Técnico
│   │   ├── assignments/           # Asignaciones
│   │   ├── users/                 # Gestión de usuarios
│   │   ├── clientes/             # Módulo de clientes
│   │   │   ├── page.tsx          # Lista
│   │   │   ├── nuevo/            # Crear
│   │   │   └── [id]/            # Detalle + editar
│   │   ├── tickets/              # Módulo de tickets
│   │   │   ├── page.tsx          # Lista
│   │   │   ├── nuevo/            # Crear
│   │   │   └── [id]/            # Detalle
│   │   └── configuracion/        # Config SLA + Reglas
│   └── login/                     # Página de login
├── components/
│   ├── layout/                    # Sidebar, Header
│   ├── kanban/                    # KanbanBoard, KanbanCard, KanbanColumn
│   │   ├── EnsayoFormModal.tsx   # Modal para llenar ensayo
│   │   ├── RejectionInfoModal.tsx # Modal rechazo
│   │   └── TransitionDialog.tsx   # Diálogo de transición (firma)
│   ├── forms/                     # FormList, FormPreviewModal
│   ├── assignments/               # AssignmentForm, AssignmentList
│   ├── clientes/                  # DocumentUpload
│   ├── notifications/             # Badge, Panel
│   └── ui/                        # Toast, etc.
├── contexts/
│   └── AuthContext.tsx            # Provider de autenticación
├── hooks/
│   └── useNotifications.ts       # Hook de notificaciones
└── lib/
    ├── api.ts                     # Fetch wrapper + refresh token
    ├── auth.ts                    # User storage + helpers
    ├── guards.ts                  # Route permissions
    └── states.ts                  # Catálogo de estados (cache)
```

---

## Dependencias entre Módulos

```
auth ──────────► (todos los módulos dependen de auth)

users ─────────► auth (middleware RBAC)

forms ─────────► users (createdBy)

assignments ───► forms + users

reactivos ─────► forms + users + (tickets para sync)

kanban ────────► reactivos + tickets (sync estado)

clientes ──────► users (asignadoA)

tickets ───────► clientes + forms + users + reactivos (auto-create)

notifications ─► users (recipient)

audit ─────────► users (actor)

catalogs ──────► (independiente, solo DB + Redis cache)
```

---

## Puntos de Modularización

Para separar en microservicios o módulos independientes:

| Módulo candidato | Dependencias | Dificultad de separación |
|---|---|---|
| **Auth** | Redis, Users DB | Baja (ya está aislado) |
| **Catálogos** | Redis, DB read-only | Muy baja |
| **Notificaciones** | Redis, Users DB | Baja (event-driven) |
| **Clientes + Tickets** | Users, Forms | Media |
| **Reactivos + Kanban** | Forms, Users, Tickets | Alta (muchas dependencias) |
| **PDF Generation** | Reactivos, Forms | Baja (puede ser serverless) |
| **Audit** | Todas las entidades | Baja (append-only, event-driven) |

**Recomendación para modularizar:**
1. Primero extraer: PDF generation → función serverless
2. Segundo: Notificaciones → servicio event-driven con Redis Pub/Sub
3. Tercero: Auth → servicio dedicado con su propia DB de sesiones
4. Cuarto: Clientes/Tickets como bounded context separado
