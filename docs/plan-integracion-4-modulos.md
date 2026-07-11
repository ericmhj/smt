# Plan de Integración — 4 Módulos

## Visión

```
Usuario → APISIX (Gateway) → Keycloak (Auth) → License Service / SGR
```

Cuando un cliente se registra en el Portal de Contratación, el flujo debe:
1. Crear tenant en **license-service** (contrato, créditos, facturación)
2. Crear tenant en **SGR** (schema PostgreSQL con tablas de ensayos)
3. Crear Organization en **Keycloak** (identidad, SSO, roles)
4. **APISIX** rutea todas las peticiones validando JWT de Keycloak

---

## Análisis de Compatibilidad Actual

### Roles — Comparación entre sistemas

| # | Keycloak (Organizations) | License Service | SGR |
|---|---|---|---|
| 1 | — | — | `platform_admin` |
| 2 | `ADMIN_CUENTA` | `ADMIN_CUENTA` | `admin` |
| 3 | `SUPERVISOR` | `SUPERVISOR` | `manager` |
| 4 | — | — | `tecnico` |
| 5 | — | — | `asistente` |
| 6 | `TECNICO` (campo) | `TECNICO` | `tecnico` |

**Incompatibilidades:**
- SGR usa `admin` donde License usa `ADMIN_CUENTA`
- SGR usa `manager` donde License usa `SUPERVISOR`
- SGR tiene `asistente` que no existe en License ni Keycloak
- SGR tiene `platform_admin` que es concepto de nivel plataforma

---

### Estados de Tenant — Comparación

| License Service | SGR | ¿Compatible? |
|---|---|---|
| `ONBOARDING` | — (no existe) | ❌ SGR no tiene concepto de onboarding |
| `ACTIVE` | `active` | ✅ |
| `SUSPENDED` | `suspended` | ✅ |
| `CANCELLED` | `pending_deletion` | ⚠️ Similar pero diferente semántica |

---

### Autenticación — Cómo funciona hoy

| Sistema | Auth actual | JWT emitido por |
|---|---|---|
| SGR | Custom (jose library, RS256) | SGR backend mismo |
| License Service | Valida JWT de Keycloak | Keycloak |
| Portal Contratación | JWT en localStorage | Keycloak (diseño) |
| APISIX | Valida JWKS de Keycloak | Keycloak |

**Problema principal:** SGR genera sus propios JWT. Para integrar, debe migrar a aceptar JWT de Keycloak.

---

## Arquitectura Target (Integrada)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          FLUJO INTEGRADO                                 │
└─────────────────────────────────────────────────────────────────────────┘

Usuario (Browser)
     │
     ▼
┌──────────────┐
│   APISIX     │ ← Valida JWT (JWKS de Keycloak)
│   :9080      │ ← Rate limiting por tenant
│              │ ← Rutea según path:
│              │     /api/license/* → License Service :8080
│              │     /api/sgr/*     → SGR Backend :3001
│              │     /auth/*        → Keycloak :8180
└──────┬───────┘
       │
       ├──────────────────────────────────────┐
       │                                      │
       ▼                                      ▼
┌──────────────┐                    ┌──────────────┐
│  Keycloak    │                    │License Service│
│  :8180       │                    │   :8080      │
│              │                    │              │
│ • Login/SSO  │                    │ • Contratos  │
│ • JWT emit   │◄───── JWKS ──────►│ • Créditos   │
│ • MFA        │                    │ • Cobros     │
│ • Orgs       │                    │ • Onboarding │
└──────────────┘                    └──────┬───────┘
                                           │
                                           │ Evento: tenant.created
                                           ▼
                                    ┌──────────────┐
                                    │     SGR      │
                                    │   :3001      │
                                    │              │
                                    │ • Ensayos    │
                                    │ • Kanban     │
                                    │ • Formularios│
                                    │ • Clientes   │
                                    └──────────────┘
```

---

## Historias de Usuario para la Integración

### FASE 1: Unificar Autenticación (Keycloak como fuente única)

#### HU-INT-01: SGR acepta JWT de Keycloak

**Como** desarrollador de plataforma  
**Quiero** que el SGR valide tokens JWT emitidos por Keycloak (en vez de generar los suyos)  
**Para** que un solo login sirva para acceder a todos los módulos

**Criterios:**
- [ ] SGR verifica firma JWT contra JWKS endpoint de Keycloak
- [ ] SGR extrae claims: `sub`, `tenantId`, `roles[]`, `email`, `name`
- [ ] SGR ya NO genera JWT propio (eliminar `generateTokenPair`)
- [ ] Login en SGR redirige a Keycloak login page
- [ ] Refresh token manejado por Keycloak (SGR solo valida access token)

---

#### HU-INT-02: Mapeo de roles Keycloak → SGR

**Como** administrador de plataforma  
**Quiero** que los roles de Keycloak se mapeen automáticamente a los roles del SGR  
**Para** que los usuarios tengan los mismos permisos sin configuración manual

**Mapeo propuesto:**

| Rol Keycloak (Organization Role) | Rol SGR | Rol License |
|---|---|---|
| `PLATFORM_ADMIN` (Realm role) | `platform_admin` | — |
| `ADMIN_CUENTA` | `admin` | `ADMIN_CUENTA` |
| `SUPERVISOR` | `manager` | `SUPERVISOR` |
| `TECNICO` | `tecnico` | `TECNICO` |
| `ASISTENTE` | `asistente` | — |

**Criterios:**
- [ ] JWT de KC contiene claim `roles: ["SUPERVISOR"]` → SGR interpreta como `manager`
- [ ] Tabla de mapeo configurable (no hardcodeada)
- [ ] Si un rol de KC no tiene mapeo, se rechaza con 403

---

#### HU-INT-03: APISIX como gateway único

**Como** usuario  
**Quiero** acceder a todos los servicios a través de un solo dominio  
**Para** no tener que recordar puertos distintos

**Criterios:**
- [ ] `mikel.localhost/api/sgr/*` → SGR Backend :3001
- [ ] `mikel.localhost/api/license/*` → License Service :8080
- [ ] `mikel.localhost/auth/*` → Keycloak :8180
- [ ] `mikel.localhost/portal/*` → Portal Angular :4200
- [ ] `mikel.localhost/*` → SGR Frontend :3000
- [ ] APISIX valida JWT en todas las rutas (excepto login y public)
- [ ] APISIX inyecta header `X-Tenant-Id` desde el claim del JWT

---

### FASE 2: Crear Tenant desde License Service → SGR

#### HU-INT-04: License Service dispara creación de schema en SGR

**Como** sistema de contratación  
**Quiero** que al crear un tenant en license-service, se cree automáticamente el schema en SGR  
**Para** que el cliente pueda usar los ensayos inmediatamente después de contratar

**Criterios:**
- [ ] License Service publica evento Kafka: `tenant.created { tenantId, slug, nombre, adminEmail }`
- [ ] SGR consume evento: crea schema `sgr_{slug}`, ejecuta template, crea admin user
- [ ] Si SGR falla: evento queda en retry (Kafka consumer retry)
- [ ] Timeout: schema creado en < 30 segundos
- [ ] Idempotencia: si el schema ya existe, no duplica

---

#### HU-INT-05: License Service crea Organization en Keycloak

**Como** sistema de contratación  
**Quiero** que al crear un tenant se cree una Organization en Keycloak  
**Para** que los usuarios del tenant puedan loguearse inmediatamente

**Criterios:**
- [ ] License Service llama a KC Admin API: `POST /admin/realms/mikel/organizations`
- [ ] Organization creada con atributos: `tenantId`, `plan`, `slug`
- [ ] Admin user invitado a la Organization con rol `ADMIN_CUENTA`
- [ ] KC Organization ID guardado en license DB
- [ ] Si KC falla: rollback del tenant en license DB

---

#### HU-INT-06: Sincronización de suspensión entre sistemas

**Como** platform admin  
**Quiero** que al suspender un tenant en license-service, se suspenda en SGR y KC también  
**Para** que el bloqueo sea completo y consistente

**Criterios:**
- [ ] License publica evento: `tenant.suspended { tenantId }`
- [ ] SGR consume: cambia `tenants.status = 'suspended'`, invalida cache Redis
- [ ] KC: desactiva la Organization (via Admin API)
- [ ] Si un sistema falla: los otros no se deshacen (eventual consistency)

---

### FASE 3: Consumo de Créditos desde SGR

#### HU-INT-07: SGR consume créditos al generar PDF

**Como** sistema de ensayos  
**Quiero** descontar un crédito cuando un técnico envía un ensayo y se genera el PDF  
**Para** que el modelo de negocio de créditos funcione end-to-end

**Criterios:**
- [ ] SGR llama a License Service: `POST /api/v1/tenants/{id}/credits/consume`
- [ ] Si crédito OK: genera PDF normalmente
- [ ] Si saldo insuficiente: bloquea envío, muestra error al técnico
- [ ] Si License Service no responde: circuit breaker, deja pasar (cobro posterior)
- [ ] Compensación: si PDF falla después del consumo, llama `/credits/compensate`

---

#### HU-INT-08: Portal muestra consumo de créditos del SGR

**Como** admin de cuenta  
**Quiero** ver en el dashboard del portal cuántos créditos se han consumido por ensayos  
**Para** saber cuándo necesito comprar más

**Criterios:**
- [ ] Dashboard `/dashboard` muestra: saldo, consumo del mes, historial
- [ ] Cada consumo registrado con: fecha, tipo documento, técnico, ensayo ID
- [ ] Alerta cuando saldo < 10% del paquete

---

### FASE 4: Single Sign-On y Multi-App

#### HU-INT-09: Login único para Portal + SGR

**Como** usuario  
**Quiero** logearme una sola vez y acceder tanto al Portal como al SGR  
**Para** no tener que recordar múltiples credenciales

**Criterios:**
- [ ] Login en Keycloak → token sirve para ambas apps
- [ ] Portal y SGR validan el mismo token contra el mismo JWKS
- [ ] Si el token expira en una app, ambas redirigen al login de KC

---

#### HU-INT-10: Subdominio por tenant resuelto en APISIX

**Como** usuario de un tenant  
**Quiero** acceder a `miempresa.mikel.com` y ver solo mis datos  
**Para** tener una experiencia personalizada

**Criterios:**
- [ ] APISIX extrae subdominio → lo agrega como header `X-Tenant-Slug`
- [ ] SGR usa `X-Tenant-Slug` para resolver schema (ya implementado)
- [ ] License Service usa `tenantId` del JWT (ya implementado)
- [ ] KC Organization login page personalizada con logo del tenant

---

## Priorización

| Fase | Historias | Duración | Dependencias |
|---|---|---|---|
| **1** | HU-INT-01, 02, 03 | 2-3 semanas | Keycloak configurado |
| **2** | HU-INT-04, 05, 06 | 2-3 semanas | Fase 1 + Kafka |
| **3** | HU-INT-07, 08 | 1-2 semanas | Fase 2 |
| **4** | HU-INT-09, 10 | 1-2 semanas | Fase 1 |

**Total estimado: 6-10 semanas**

---

## Prerrequisitos Técnicos

1. **Red Docker compartida** `mikel-net` — todos los módulos deben estar en ella
2. **Kafka** — License Service ya lo tiene; SGR necesita un consumer
3. **Keycloak realm** — debe tener Organizations habilitado + roles definidos
4. **APISIX rutas** — configurar upstreams y plugins de validación JWT
5. **Variables de entorno** — JWKS URL de Keycloak compartida entre SGR y License
