# Diagrama de Flujo de Información — SGR

## 1. Flujo General del Sistema

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USUARIOS                                        │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  Manager    │  │  Técnico    │  │  Asistente  │  │ Admin/Super │      │
│  │             │  │             │  │             │  │             │      │
│  │ • Crea      │  │ • Llena     │  │ • Crea      │  │ • Gestiona  │      │
│  │   tickets   │  │   ensayos   │  │   clientes  │  │   usuarios  │      │
│  │ • Mueve     │  │ • Envía     │  │ • Crea      │  │ • Crea      │      │
│  │   kanban    │  │   formulario│  │   tickets   │  │   forms     │      │
│  │ • Configura │  │ • Ve PDF    │  │             │  │ • Asigna    │      │
│  │   SLA       │  │             │  │             │  │   forms     │      │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │
└─────────┼────────────────┼────────────────┼────────────────┼───────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js :3000)                             │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ AuthContext (JWT en localStorage) → lib/api.ts (fetch + auto-refresh) │    │
│  └────────────────────────────────────┬───────────────────────────────┘    │
└───────────────────────────────────────┼─────────────────────────────────────┘
                                        │ REST API (JSON)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Fastify :3001)                              │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │               AUTH MIDDLEWARE (JWT RS256 verify)                     │    │
│  │          request.user = { sub, role, iat, exp, jti }                │    │
│  └────────────────────────────────┬───────────────────────────────────┘    │
│                                   │                                         │
│  ┌────────────────────────────────┼───────────────────────────────────┐    │
│  │                         MÓDULOS                                     │    │
│  │                                                                     │    │
│  │  AUTH ─► USERS ─► FORMS ─► ASSIGNMENTS                            │    │
│  │                      │                                              │    │
│  │                      ▼                                              │    │
│  │  CLIENTES ─► TICKETS ─────► REACTIVOS ─► KANBAN                   │    │
│  │                  │              │            │                       │    │
│  │                  │              ▼            ▼                       │    │
│  │                  │         PDF SERVICE   STATE SYNC                  │    │
│  │                  │              │            │                       │    │
│  │                  ▼              │            │                       │    │
│  │  SLA SERVICE ◄──┘              │            │                       │    │
│  │  (BullMQ)                      │            │                       │    │
│  │                                ▼            ▼                       │    │
│  │  OBSERVATIONS    SIGNATURES    NOTIFICATIONS    AUDIT              │    │
│  └────────────────────────────────────────────────────────────────────┘    │
└──────────┬──────────────────────────┬──────────────────────┬────────────────┘
           │                          │                      │
           ▼                          ▼                      ▼
    ┌──────────────┐          ┌──────────────┐       ┌──────────────┐
    │  PostgreSQL  │          │    Redis     │       │  Garage S3   │
    │              │          │              │       │              │
    │ 15 tablas    │          │ • JWT blackl │       │ • Documentos │
    │ principales  │          │ • Refresh tk │       │ • Archivos   │
    │              │          │ • Cache      │       │   observ.    │
    │              │          │ • BullMQ     │       │              │
    └──────────────┘          └──────────────┘       └──────────────┘
```

---

## 2. Flujo Principal: Ciclo de Vida de un Ensayo

```
                    ┌─────────────────────────────────────────┐
                    │          FLUJO COMPLETO                  │
                    └─────────────────────────────────────────┘

  ADMIN                MANAGER/ASISTENTE              TÉCNICO               MANAGER
    │                        │                          │                      │
    │ 1. Crear formulario    │                          │                      │
    │    (HTML + campos)     │                          │                      │
    │────────────────────►   │                          │                      │
    │                        │                          │                      │
    │ 2. Asignar form        │                          │                      │
    │    a técnico           │                          │                      │
    │────────────────────►   │                          │                      │
    │                        │                          │                      │
    │                        │ 3. Dar de alta cliente   │                      │
    │                        │    (datos centro trabajo)│                      │
    │                        │─────────────────────────►│                      │
    │                        │                          │                      │
    │                        │ 4. Crear ticket          │                      │
    │                        │    (cliente+form+técnico)│                      │
    │                        │                          │                      │
    │                        │    ┌─────────────────┐   │                      │
    │                        │    │ AUTO:            │   │                      │
    │                        │    │ • Crea reactivo  │   │                      │
    │                        │    │ • Pre-llena datos│   │                      │
    │                        │    │   del cliente    │   │                      │
    │                        │    │ • Calcula fecha  │   │                      │
    │                        │    │   programada     │   │                      │
    │                        │    │   (+3 días háb)  │   │                      │
    │                        │    │ • Crea tarjeta   │   │                      │
    │                        │    │   en Kanban      │   │                      │
    │                        │    └─────────────────┘   │                      │
    │                        │                          │                      │
    │                        │                          │ 5. Ve tarjeta en     │
    │                        │                          │    "Mis Ensayos"     │
    │                        │                          │    (estado Programado)│
    │                        │                          │                      │
    │                        │                          │ 6. Click → abre form │
    │                        │                          │    con datos cliente  │
    │                        │                          │    pre-llenados       │
    │                        │                          │                      │
    │                        │                          │ 7. Llena campos      │
    │                        │                          │    del ensayo         │
    │                        │                          │                      │
    │                        │                          │ 8. Envía ensayo      │
    │                        │                          │    (submit)          │
    │                        │                          │                      │
    │                        │    ┌─────────────────┐   │                      │
    │                        │    │ AUTO:            │   │                      │
    │                        │    │ • Valida schema  │   │                      │
    │                        │    │ • Guarda response│   │                      │
    │                        │    │ • Estado →       │   │                      │
    │                        │    │   "En Evaluación"│   │                      │
    │                        │    │ • Sync ticket    │   │                      │
    │                        │    │ • Genera PDF     │   │                      │
    │                        │    └─────────────────┘   │                      │
    │                        │                          │                      │
    │                        │                          │                      │ 9. Ve ensayo en
    │                        │                          │                      │    Kanban Manager
    │                        │                          │                      │    (En Evaluación)
    │                        │                          │                      │
    │                        │                          │                      │ 10. Drag & Drop
    │                        │                          │                      │     → Validado
    │                        │                          │                      │     (con firma)
    │                        │                          │                      │
    │                        │    ┌─────────────────┐   │                      │
    │                        │    │ AUTO:            │   │                      │
    │                        │    │ • Registra       │   │                      │
    │                        │    │   transición     │   │                      │
    │                        │    │ • Sync ticket    │   │                      │
    │                        │    │ • Notifica       │   │                      │
    │                        │    │   técnico        │   │                      │
    │                        │    └─────────────────┘   │                      │
    │                        │                          │                      │
    │                        │                          │                      │ 11. Drag & Drop
    │                        │                          │                      │     → Finalizado
    │                        │                          │                      │
    │                        │                   ┌──────┴──────┐               │
    │                        │                   │  ENSAYO      │               │
    │                        │                   │  COMPLETADO  │               │
    │                        │                   └─────────────┘               │
```

---

## 3. Máquina de Estados

```
┌────────────────────────────────────────────────────────────────────┐
│                    ESTADOS DEL ENSAYO/TICKET                        │
└────────────────────────────────────────────────────────────────────┘

                         ┌──────────────┐
                         │  PROGRAMADO  │ (pendiente)
                         │              │
                         │ Técnico abre │
                         │ formulario   │
                         └──────┬───────┘
                                │
                    Técnico envía (submit)
                                │
                                ▼
                         ┌──────────────┐
                         │EN EVALUACIÓN │ (en_revision)
                         │              │
                         │ Manager      │
                         │ revisa PDF   │
                         └───┬──────┬───┘
                             │      │
              Manager valida │      │ Manager rechaza
                             │      │ (con motivo)
                             ▼      ▼
                  ┌──────────────┐  ┌──────────────┐
                  │   VALIDADO   │  │  RECHAZADO   │
                  │              │  │              │
                  │              │  │ Técnico puede│
                  │              │  │ re-enviar    │
                  └──────┬───────┘  └──────────────┘
                         │                  │
              Manager finaliza              │ Re-envío
                         │                  │ (crea nuevo
                         ▼                  │  reactivo hijo)
                  ┌──────────────┐          │
                  │  FINALIZADO  │          │
                  │              │◄─────────┘
                  │  (terminal)  │  (nuevo intento
                  └──────────────┘   repite el ciclo)


    QUIÉN PUEDE TRANSICIONAR:
    ─────────────────────────
    • pendiente → en_revision    : TÉCNICO (al enviar form)
    • en_revision → validado     : MANAGER (Kanban D&D)
    • en_revision → rechazado    : MANAGER (Kanban D&D)
    • validado → finalizado      : MANAGER (Kanban D&D)
    • rechazado → pendiente      : SISTEMA (al crear hijo por reapply)
```

---

## 4. Flujo de Datos por Endpoint

```
┌──────────────────────────────────────────────────────────────────────┐
│                    MAPA DE ENDPOINTS Y TABLAS                         │
└──────────────────────────────────────────────────────────────────────┘

POST /api/auth/login
  └─► users (verify password)
  └─► Redis (store refresh token)
  └─► Response: { accessToken, refreshToken, user }

POST /api/tickets
  └─► sla_config (get hours)
  └─► forms + form_versions (get current version)
  └─► clientes (get client data)
  └─► reactivos (INSERT with pre-filled responses)
  └─► tickets (INSERT linked to reactivo)
  └─► BullMQ (enqueue auto-assignment if no tecnico)

GET /api/kanban?tecnicoId=X
  └─► reactivos JOIN forms JOIN users (grouped by state)
  └─► observations (count unread per reactivo)
  └─► Response: { columns: [{state, label, cards: [...]}] }

POST /api/reactivos/:id/submit
  └─► reactivos (validate ownership + state)
  └─► form_versions (get JSON schema)
  └─► reactivos (UPDATE responses + state='en_revision')
  └─► tickets (SYNC estado='en_revision')
  └─► Response: { reactivo updated }

POST /api/kanban/:id/transition
  └─► reactivos (validate state machine)
  └─► state_transitions (INSERT audit record)
  └─► reactivos (UPDATE state)
  └─► tickets (SYNC estado)
  └─► notifications (INSERT for tecnico)
  └─► Response: { transition record }

GET /api/reactivos/:id/pdf
  └─► reactivos (get responses)
  └─► form_versions (get HTML template)
  └─► PDFService: inject responses into HTML → Puppeteer → PDF buffer
  └─► Response: application/pdf binary

POST /api/clientes
  └─► clientes (INSERT with all required fields)
  └─► Response: { cliente }

GET /api/clientes/search?q=...
  └─► clientes (tsvector full-text search)
  └─► Redis (check/set cache)
  └─► Response: { data, total, page }
```

---

## 5. Relaciones entre Tablas (ERD simplificado)

```
┌─────────┐     ┌──────────────┐     ┌───────────────┐
│  users  │◄────┤form_assignments├────►│    forms      │
│         │     └──────────────┘     │               │
│ id      │                          │ id            │
│ email   │     ┌──────────────┐     │ name          │
│ name    │◄────┤  reactivos   │────►│ slug          │
│ role    │     │              │     │ currentVersion│
└────┬────┘     │ id           │     └───────┬───────┘
     │          │ formId       │             │
     │          │ formVersionId│     ┌───────┴───────┐
     │          │ tecnicoId    │     │ form_versions │
     │          │ state        │     │               │
     │          │ responses {} │     │ htmlContent   │
     │          │ clienteNombre│     │ jsonSchema    │
     │          │ fechaProgramada    │ fieldsMetadata│
     │          └──────┬───────┘     └───────────────┘
     │                 │
     │          ┌──────┴───────┐     ┌───────────────┐
     │          │   tickets    │────►│   clientes    │
     │          │              │     │               │
     │          │ clienteId    │     │ nombre        │
     │          │ formId       │     │ rfc           │
     │          │ reactivoId   │     │ direccionCT   │
     │          │ tecnicoAsignadoId  │ telefono      │
     │          │ estado       │     │ actividad     │
     │          │ prioridad    │     │ contacto      │
     │          │ slaHoras     │     │ horarios      │
     │          │ fechaLimite  │     │ etiquetas[]   │
     │          └──────────────┘     └───────────────┘
     │
     │          ┌──────────────┐     ┌───────────────┐
     ├─────────►│state_transitions├──►│  signatures   │
     │          │              │     │               │
     │          │ reactivoId   │     │ encrypted_img │
     │          │ fromState    │     │ image_hash    │
     │          │ toState      │     └───────────────┘
     │          │ actorId      │
     │          │ signatureId  │
     │          └──────────────┘
     │
     │          ┌──────────────┐     ┌───────────────┐
     ├─────────►│ observations │     │   sla_config  │
     │          │              │     │               │
     │          │ reactivoId   │     │ prioridad     │
     │          │ authorId     │     │ horasLimite   │
     │          │ content      │     └───────────────┘
     │          └──────────────┘
     │                               ┌───────────────┐
     │          ┌──────────────┐     │reglas_asignac.│
     └─────────►│ notifications│     │               │
                │              │     │ nombre        │
                │ recipientId  │     │ tipo          │
                │ type         │     │ condiciones{} │
                │ payload{}    │     └───────────────┘
                └──────────────┘
                                     ┌───────────────┐
                                     │  audit_logs   │
                                     │               │
                                     │ action        │
                                     │ entity_type   │
                                     │ entity_id     │
                                     │ actor_id      │
                                     │ details{}     │
                                     └───────────────┘
```

---

## 6. Sincronización Ticket ↔ Reactivo

```
┌─────────────────────────────────────────────────────────────┐
│              PATRÓN DE SINCRONIZACIÓN                        │
└─────────────────────────────────────────────────────────────┘

    CREACIÓN (Ticket → Reactivo):
    ─────────────────────────────
    POST /api/tickets
         │
         ├─► INSERT reactivos (state='pendiente', responses=datos_cliente)
         │
         └─► INSERT tickets (reactivoId=reactivo.id, estado='pendiente')


    SUBMIT (Reactivo → Ticket):
    ────────────────────────────
    POST /api/reactivos/:id/submit
         │
         ├─► UPDATE reactivos SET state='en_revision'
         │
         └─► UPDATE tickets SET estado='en_revision'
              WHERE reactivoId = :id


    KANBAN D&D (Reactivo → Ticket):
    ────────────────────────────────
    POST /api/kanban/:id/transition
         │
         ├─► UPDATE reactivos SET state=:newState
         │
         └─► UPDATE tickets SET estado=:newState
              WHERE reactivoId = :id


    Dirección del sync: SIEMPRE reactivo → ticket
    El ticket NUNCA modifica el estado del reactivo directamente.
```

---

## 7. Servicios de Background (BullMQ)

```
┌─────────────────────────────────────────────────────────────┐
│                    QUEUES (Redis + BullMQ)                    │
└─────────────────────────────────────────────────────────────┘

    ┌──────────────────────┐
    │ tickets-sla-check    │  Cada 15 min verifica tickets vencidos
    │ (repeatable job)     │  → Marca como overdue
    └──────────────────────┘  → Notifica al manager

    ┌──────────────────────┐
    │ tickets-assignment   │  Al crear ticket sin técnico asignado
    │ (on-demand job)      │  → Ejecuta reglas de asignación
    └──────────────────────┘  → Asigna técnico automáticamente
                               (por ubicación o por carga)
```
