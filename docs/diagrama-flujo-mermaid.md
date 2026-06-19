# Diagramas del Sistema SGR (Mermaid)

## 1. Arquitectura General

```mermaid
graph TB
    subgraph Frontend["Frontend (Next.js :3000)"]
        FE_Kanban["/kanban<br>Manager"]
        FE_MyKanban["/my-kanban<br>Técnico"]
        FE_Forms["/forms<br>Admin/Manager"]
        FE_Clientes["/clientes<br>Manager/Asistente"]
        FE_Tickets["/tickets<br>Manager/Asistente"]
        FE_Users["/users<br>Admin"]
        FE_Config["/configuracion<br>Manager"]
        FE_API["lib/api.ts<br>(fetch + JWT auto-refresh)"]
    end

    subgraph Backend["Backend (Fastify :3001)"]
        AUTH["Auth Middleware<br>JWT RS256"]
        MOD_AUTH["auth/"]
        MOD_USERS["users/"]
        MOD_FORMS["forms/"]
        MOD_ASSIGN["assignments/"]
        MOD_REACT["reactivos/"]
        MOD_KANBAN["kanban/"]
        MOD_CLIENT["clientes/"]
        MOD_TICKET["tickets/"]
        MOD_NOTIF["notifications/"]
        MOD_AUDIT["audit/"]
        SVC_PDF["PDFService<br>(Puppeteer)"]
        SVC_SLA["SLAService<br>(BullMQ)"]
    end

    subgraph Storage["Almacenamiento"]
        PG[(PostgreSQL<br>15 tablas)]
        REDIS[(Redis<br>Cache + Queues)]
        S3[(Garage S3<br>Archivos)]
    end

    FE_Kanban --> FE_API
    FE_MyKanban --> FE_API
    FE_Forms --> FE_API
    FE_Clientes --> FE_API
    FE_Tickets --> FE_API
    FE_Users --> FE_API
    FE_Config --> FE_API

    FE_API -->|"REST API (JSON)"| AUTH
    AUTH --> MOD_AUTH
    AUTH --> MOD_USERS
    AUTH --> MOD_FORMS
    AUTH --> MOD_ASSIGN
    AUTH --> MOD_REACT
    AUTH --> MOD_KANBAN
    AUTH --> MOD_CLIENT
    AUTH --> MOD_TICKET
    AUTH --> MOD_NOTIF
    AUTH --> MOD_AUDIT

    MOD_REACT --> SVC_PDF
    MOD_TICKET --> SVC_SLA

    MOD_AUTH --> PG
    MOD_AUTH --> REDIS
    MOD_USERS --> PG
    MOD_FORMS --> PG
    MOD_ASSIGN --> PG
    MOD_REACT --> PG
    MOD_KANBAN --> PG
    MOD_CLIENT --> PG
    MOD_CLIENT --> S3
    MOD_TICKET --> PG
    MOD_TICKET --> REDIS
    MOD_NOTIF --> PG
    MOD_AUDIT --> PG
    SVC_SLA --> REDIS
```

---

## 2. Ciclo de Vida del Ensayo

```mermaid
sequenceDiagram
    participant Admin
    participant Manager
    participant Sistema
    participant Técnico

    Admin->>Sistema: 1. Crear formulario (HTML)
    Admin->>Sistema: 2. Asignar form a técnico

    Manager->>Sistema: 3. Dar de alta cliente
    Manager->>Sistema: 4. Crear ticket (cliente + form + técnico)
    
    Note over Sistema: AUTO: Crea reactivo<br>Pre-llena datos cliente<br>Calcula fecha (+3 días háb)<br>Crea tarjeta Kanban

    Técnico->>Sistema: 5. Abre tarjeta "Programado"
    Sistema->>Técnico: 6. Muestra form con datos cliente
    Técnico->>Sistema: 7. Llena y envía ensayo

    Note over Sistema: AUTO: Valida schema<br>Guarda responses<br>Estado → En Evaluación<br>Sync ticket<br>Genera PDF

    Manager->>Sistema: 8. Ve ensayo en Kanban
    Manager->>Sistema: 9. D&D → Validado (con firma)

    Note over Sistema: AUTO: Registra transición<br>Sync ticket<br>Notifica técnico

    Manager->>Sistema: 10. D&D → Finalizado

    Note over Sistema: ENSAYO COMPLETADO
```

---

## 3. Máquina de Estados

```mermaid
stateDiagram-v2
    [*] --> Programado: Ticket creado

    Programado --> EnEvaluacion: Técnico envía (submit)
    
    EnEvaluacion --> Validado: Manager aprueba (D&D)
    EnEvaluacion --> Rechazado: Manager rechaza (D&D)
    
    Validado --> Finalizado: Manager finaliza (D&D)
    
    Rechazado --> Programado: Técnico re-envía (crea nuevo intento)
    
    Finalizado --> [*]

    note right of Programado
        Técnico abre formulario
        Datos del cliente pre-llenados
    end note

    note right of EnEvaluacion
        PDF generado
        Manager revisa
    end note

    note right of Rechazado
        Motivo visible al técnico
        Puede crear nuevo intento
    end note
```

---

## 4. Relaciones entre Tablas (ERD)

```mermaid
erDiagram
    users ||--o{ reactivos : "tecnicoId"
    users ||--o{ tickets : "tecnicoAsignadoId"
    users ||--o{ tickets : "creadoPor"
    users ||--o{ form_assignments : "tecnicoId"
    users ||--o{ observations : "authorId"
    users ||--o{ notifications : "recipientId"
    users ||--o{ state_transitions : "actorId"
    users ||--o{ audit_logs : "actorId"

    forms ||--o{ form_versions : "formId"
    forms ||--o{ form_assignments : "formId"
    forms ||--o{ reactivos : "formId"
    forms ||--o{ tickets : "formId"

    form_versions ||--o{ reactivos : "formVersionId"

    clientes ||--o{ tickets : "clienteId"
    clientes ||--o{ cliente_contactos : "clienteId"
    clientes ||--o{ cliente_documentos : "clienteId"

    tickets ||--|| reactivos : "reactivoId"

    reactivos ||--o{ state_transitions : "reactivoId"
    reactivos ||--o{ observations : "reactivoId"
    reactivos ||--o{ reactivos : "parentReactivoId"

    signatures ||--o{ state_transitions : "signatureId"

    users {
        uuid id PK
        string email
        string name
        string role
        boolean isActive
    }

    forms {
        uuid id PK
        string name
        string slug
        boolean isActive
        int currentVersion
    }

    reactivos {
        uuid id PK
        uuid formId FK
        uuid formVersionId FK
        uuid tecnicoId FK
        uuid parentReactivoId FK
        int attemptNumber
        string state
        jsonb responses
        string clienteNombre
        timestamp fechaProgramada
    }

    tickets {
        uuid id PK
        uuid clienteId FK
        uuid formId FK
        uuid reactivoId FK
        uuid tecnicoAsignadoId FK
        string prioridad
        string estado
        int slaHoras
        timestamp fechaLimite
    }

    clientes {
        uuid id PK
        string nombre
        string rfc
        string direccionCentroTrabajo
        string telefono
        string actividadPrincipal
        string contacto
        string horarios
        jsonb etiquetas
    }
```

---

## 5. Flujo de Creación de Ticket

```mermaid
flowchart TD
    A[Manager/Asistente<br>crea ticket] --> B{Valida SLA config}
    B -->|SLA existe| C[Obtiene datos del cliente]
    B -->|No existe| ERR[Error: SLA no configurado]
    
    C --> D[Obtiene form version actual]
    D --> E[Calcula fecha programada<br>+3 días hábiles]
    
    E --> F[Crea REACTIVO<br>state=pendiente<br>responses=datos_cliente]
    F --> G[Crea TICKET<br>vinculado al reactivo<br>estado=pendiente]
    
    G --> H{¿Técnico asignado?}
    H -->|Sí| I[Ticket listo]
    H -->|No| J[Encola job BullMQ<br>auto-asignación]
    J --> K[Worker ejecuta reglas<br>ubicación o carga]
    K --> I
```

---

## 6. Flujo del Técnico (Submit)

```mermaid
flowchart TD
    A[Técnico abre<br>/my-kanban] --> B[GET /api/kanban?tecnicoId=X]
    B --> C[Ve tarjetas agrupadas<br>por estado]
    
    C --> D{Click en tarjeta}
    
    D -->|Estado: Programado| E[GET /api/reactivos/:id/form<br>GET /api/reactivos/:id]
    E --> F[Abre EnsayoFormModal<br>con datos pre-llenados]
    F --> G[Técnico llena campos]
    G --> H[POST /api/reactivos/:id/submit]
    
    H --> I{Validación schema}
    I -->|Válido| J[UPDATE responses + state<br>SYNC ticket estado<br>Genera PDF]
    I -->|Inválido| K[Muestra errores<br>en campos]
    K --> G
    
    J --> L[Tarjeta se mueve a<br>En Evaluación]
    
    D -->|Estado: Rechazado| M[Muestra motivo rechazo<br>+ botón Re-enviar]
    M --> N[POST /api/reactivos/:id/reapply]
    N --> O[Crea nuevo reactivo hijo<br>pre-llenado con responses padre]
    O --> F
    
    D -->|Otros estados| P[Abre visor PDF]
```

---

## 7. Sincronización Ticket ↔ Reactivo

```mermaid
flowchart LR
    subgraph Creación
        T1[POST /api/tickets] --> R1[INSERT reactivo]
        R1 --> T2[INSERT ticket<br>reactivoId = reactivo.id]
    end

    subgraph Submit
        S1[POST /api/reactivos/:id/submit] --> S2[UPDATE reactivo<br>state = en_revision]
        S2 --> S3[UPDATE ticket<br>estado = en_revision]
    end

    subgraph Kanban
        K1[POST /api/kanban/:id/transition] --> K2[UPDATE reactivo<br>state = newState]
        K2 --> K3[UPDATE ticket<br>estado = newState]
    end

    style Creación fill:#e8f5ee
    style Submit fill:#e3f2fd
    style Kanban fill:#fff3e0
```

---

## 8. Permisos por Módulo

```mermaid
graph LR
    subgraph Roles
        SU[Superusuario]
        AD[Admin]
        MG[Manager]
        TC[Técnico]
        AS[Asistente]
    end

    subgraph Módulos
        M_USERS[Usuarios]
        M_FORMS[Formularios]
        M_ASSIGN[Asignaciones]
        M_KANBAN[Kanban Manager]
        M_MYKAN[Mi Kanban]
        M_CLIENT[Clientes]
        M_TICKET[Tickets]
        M_CONFIG[Configuración]
    end

    SU --> M_USERS
    SU --> M_FORMS
    SU --> M_ASSIGN
    SU --> M_KANBAN
    AD --> M_USERS
    AD --> M_FORMS
    AD --> M_ASSIGN
    AD --> M_KANBAN
    MG --> M_FORMS
    MG --> M_ASSIGN
    MG --> M_KANBAN
    MG --> M_CLIENT
    MG --> M_TICKET
    MG --> M_CONFIG
    TC --> M_MYKAN
    AS --> M_CLIENT
    AS --> M_TICKET
```
