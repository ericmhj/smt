# DER — Base de Datos Multi-Tenant (Schema per Tenant)

## Estructura General

```mermaid
graph TB
    subgraph "PostgreSQL Instance"
        subgraph "Schema: public"
            T[tenants]
            P[plans]
            CE[catalogo_estados]
            SM[schema_migrations]
        end

        subgraph "Schema: sgr_default (Tenant Principal)"
            U1[users]
            F1[forms]
            FV1[form_versions]
            FA1[form_assignments]
            R1[reactivos]
            ST1[state_transitions]
            SIG1[signatures]
            OBS1[observations]
            OF1[observation_files]
            NOT1[notifications]
            AL1[audit_logs]
            CL1[clientes]
            CC1[cliente_contactos]
            CD1[cliente_documentos]
            TK1[tickets]
            SLA1[sla_config]
            RA1[reglas_asignacion]
        end

        subgraph "Schema: sgr_laboratoriomorales"
            U2[users]
            F2[forms]
            R2[reactivos]
            TK2[tickets]
            CL2[clientes]
        end

        subgraph "Schema: sgr_industriasdelnorte"
            U3[users]
            F3[forms]
            R3[reactivos]
            TK3[tickets]
            CL3[clientes]
        end
    end
```

---

## Schema: public (Tablas de Plataforma)

```mermaid
erDiagram
    tenants {
        uuid id PK
        varchar slug UK "3-50 chars, a-z0-9 y guiones"
        varchar nombre
        varchar plan FK "starter|professional|enterprise"
        varchar status "active|suspended|pending_deletion"
        jsonb config
        timestamptz scheduled_deletion_at
        timestamptz created_at
        timestamptz updated_at
    }

    plans {
        uuid id PK
        varchar nombre UK
        integer max_users
        integer max_forms
        integer max_storage_mb
        jsonb features
        boolean activo
        timestamptz created_at
        timestamptz updated_at
    }

    catalogo_estados {
        serial id PK
        varchar codigo UK "pendiente|en_revision|validado|rechazado|finalizado"
        varchar etiqueta
        varchar color
        integer orden
        boolean es_terminal
        boolean activo
        timestamptz created_at
    }

    schema_migrations {
        uuid id PK
        varchar schema_name
        varchar migration_name
        timestamptz applied_at
    }

    tenants }|--|| plans : "plan references"
```

---

## Schema: sgr_{slug} (Tablas por Tenant — 17 tablas idénticas)

```mermaid
erDiagram
    users {
        uuid id PK
        varchar email UK
        varchar password_hash
        varchar name
        varchar role "admin|manager|tecnico|asistente"
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    forms {
        uuid id PK
        varchar name
        varchar slug UK
        boolean is_active
        uuid created_by FK
        integer current_version
        timestamptz created_at
        timestamptz updated_at
    }

    form_versions {
        uuid id PK
        uuid form_id FK
        integer version_number
        text html_content
        text sanitized_html
        jsonb json_schema
        jsonb fields_metadata
        varchar change_type
        uuid created_by FK
        timestamptz created_at
    }

    form_assignments {
        uuid id PK
        uuid form_id FK
        uuid tecnico_id FK
        uuid assigned_by FK
        boolean is_active
        timestamptz created_at
        timestamptz revoked_at
    }

    reactivos {
        uuid id PK
        uuid form_id FK
        uuid form_version_id FK
        uuid tecnico_id FK
        uuid parent_reactivo_id FK "self-reference"
        integer attempt_number
        varchar state "pendiente|en_revision|validado|rechazado|finalizado"
        jsonb responses
        varchar rejection_reason
        timestamptz fecha_programada
        varchar cliente_nombre
        timestamptz created_at
        timestamptz updated_at
    }

    signatures {
        uuid id PK
        uuid user_id FK
        varchar type
        bytea encrypted_image
        varchar image_hash
        varchar hmac
        timestamptz created_at
    }

    state_transitions {
        uuid id PK
        uuid reactivo_id FK
        varchar from_state
        varchar to_state
        uuid actor_id FK
        uuid signature_id FK
        varchar reason
        varchar ip_address
        timestamptz created_at
    }

    observations {
        uuid id PK
        uuid reactivo_id FK
        uuid author_id FK
        text content
        boolean is_read
        timestamptz read_at
        timestamptz created_at
    }

    observation_files {
        uuid id PK
        uuid observation_id FK
        varchar original_name
        varchar storage_key
        varchar mime_type
        integer size_bytes
        varchar scan_status
        timestamptz created_at
    }

    notifications {
        uuid id PK
        uuid recipient_id FK
        varchar type
        jsonb payload
        boolean is_read
        timestamptz read_at
        timestamptz created_at
    }

    audit_logs {
        uuid id PK
        varchar action
        varchar entity_type
        uuid entity_id
        uuid actor_id FK
        varchar actor_role
        varchar ip_address
        jsonb details
        timestamptz created_at
    }

    clientes {
        uuid id PK
        varchar nombre
        varchar empresa
        varchar rfc
        varchar email UK
        varchar telefono
        varchar direccion_centro_trabajo
        varchar actividad_principal
        varchar contacto
        varchar horarios
        varchar industria
        jsonb etiquetas
        uuid asignado_a FK
        boolean activo
        tsvector search_vector "generated"
        timestamptz created_at
        timestamptz updated_at
    }

    cliente_contactos {
        uuid id PK
        uuid cliente_id FK
        varchar nombre
        varchar email
        varchar telefono
        varchar cargo
        boolean es_principal
        timestamptz created_at
        timestamptz updated_at
    }

    cliente_documentos {
        uuid id PK
        uuid cliente_id FK
        varchar original_name
        varchar storage_key
        varchar mime_type
        integer size_bytes
        uuid uploaded_by FK
        timestamptz created_at
    }

    tickets {
        uuid id PK
        uuid cliente_id FK
        uuid form_id FK
        uuid tecnico_asignado_id FK
        uuid reactivo_id FK
        varchar prioridad "alta|media|baja"
        integer sla_horas
        varchar estado "pendiente|en_revision|validado|rechazado|finalizado"
        timestamptz fecha_limite
        uuid creado_por FK
        timestamptz created_at
        timestamptz updated_at
    }

    sla_config {
        uuid id PK
        varchar prioridad UK "alta|media|baja"
        integer horas_limite
        boolean activo
        timestamptz created_at
        timestamptz updated_at
    }

    reglas_asignacion {
        uuid id PK
        varchar nombre
        varchar tipo "ubicacion|carga"
        jsonb condiciones
        boolean activo
        uuid creado_por FK
        timestamptz created_at
        timestamptz updated_at
    }

    users ||--o{ forms : "created_by"
    users ||--o{ form_assignments : "tecnico_id"
    users ||--o{ reactivos : "tecnico_id"
    users ||--o{ tickets : "tecnico_asignado_id"
    users ||--o{ tickets : "creado_por"
    users ||--o{ observations : "author_id"
    users ||--o{ state_transitions : "actor_id"
    users ||--o{ signatures : "user_id"
    users ||--o{ notifications : "recipient_id"
    users ||--o{ audit_logs : "actor_id"

    forms ||--o{ form_versions : "form_id"
    forms ||--o{ form_assignments : "form_id"
    forms ||--o{ reactivos : "form_id"
    forms ||--o{ tickets : "form_id"

    form_versions ||--o{ reactivos : "form_version_id"

    reactivos ||--o{ state_transitions : "reactivo_id"
    reactivos ||--o{ observations : "reactivo_id"
    reactivos ||--o{ reactivos : "parent_reactivo_id"

    signatures ||--o{ state_transitions : "signature_id"

    clientes ||--o{ tickets : "cliente_id"
    clientes ||--o{ cliente_contactos : "cliente_id"
    clientes ||--o{ cliente_documentos : "cliente_id"

    tickets ||--o| reactivos : "reactivo_id"

    observations ||--o{ observation_files : "observation_id"
```

---

## Resumen de Tablas

| Schema | Tabla | Cantidad |
|---|---|---|
| **public** | tenants, plans, catalogo_estados, schema_migrations | 4 |
| **sgr_{slug}** (por tenant) | users, forms, form_versions, form_assignments, reactivos, state_transitions, signatures, observations, observation_files, notifications, audit_logs, clientes, cliente_contactos, cliente_documentos, tickets, sla_config, reglas_asignacion | 17 |

**Total por tenant:** 17 tablas aisladas
**Total global:** 4 tablas compartidas + (17 × N tenants)
