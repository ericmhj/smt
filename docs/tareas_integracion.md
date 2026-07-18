# Plan de Tareas — Integración Plataforma

## Overview

Implementación incremental de la integración del SGR con la plataforma SaaS (Keycloak, APISIX, License Service, Kafka). Cada fase construye sobre la anterior, comenzando con la configuración base y terminando con la integración completa. Todos los componentes mantienen el modo dual (standalone/integrado) controlado por `STANDALONE_AUTH`.

---

## Fase 1: Configuración y modo dual (standalone vs integrado)

- [ ] 1.1 Extender `AppConfig` en `packages/backend/src/lib/config.ts`
  - Agregar campos `standaloneAuth`, `keycloak`, `kafka` y `licenseService` al interface `AppConfig`
  - Implementar parsing de variables de entorno: `STANDALONE_AUTH`, `KEYCLOAK_JWKS_URL`, `KEYCLOAK_ISSUER`, `KAFKA_BROKERS`, `LICENSE_SERVICE_URL`
  - `STANDALONE_AUTH` default a `true` cuando no está definida
  - _Requirements: 11.4, 11.5_

- [ ] 1.2 Implementar validación de configuración al inicio
  - Cuando `STANDALONE_AUTH=false`, validar que `KEYCLOAK_JWKS_URL`, `KAFKA_BROKERS` y `LICENSE_SERVICE_URL` estén definidas
  - Fallar con `process.exit(1)` indicando exactamente cuál variable falta
  - Cuando `STANDALONE_AUTH=true`, no requerir variables de integración
  - _Requirements: 11.5_

- [ ] 1.3 *(Opcional)* Property test: Integrated Mode Configuration Validation
  - **Property 15**: Para cualquier combinación de variables donde STANDALONE_AUTH=false, fallar si falta alguna variable requerida
  - **Validates: Requirements 11.5**

---

## Fase 2: Auth Strategy — Modo dual de autenticación

- [ ] 2.1 Crear interface `AuthStrategy` y factory en `packages/backend/src/modules/auth/auth-strategy.factory.ts`
  - Definir interface `AuthStrategy` con métodos `verifyToken(token): Promise<JWTPayload>` e `isLoginEnabled(): boolean`
  - Implementar `createAuthStrategy(config): AuthStrategy` que retorna la estrategia según `STANDALONE_AUTH`
  - _Requirements: 1.7, 11.1_

- [ ] 2.2 Implementar `StandaloneAuthStrategy` en `packages/backend/src/modules/auth/standalone-auth.strategy.ts`
  - Extraer la lógica actual de `AuthService.verifyToken` a esta clase
  - `isLoginEnabled()` retorna `true`
  - Mantener verificación con claves RSA locales (comportamiento actual)
  - _Requirements: 1.7, 11.1_

- [ ] 2.3 Implementar `KeycloakAuthStrategy` en `packages/backend/src/modules/auth/keycloak-auth.strategy.ts`
  - Usar `jose.createRemoteJWKSet` con el JWKS_Endpoint de Keycloak
  - Verificar firma RS256 y validar claims estándar (exp, iss)
  - Cachear JWKS con TTL de 300 segundos
  - Mapear claims de Keycloak (sub, tenant_id, roles[0], email, preferred_username) a `JWTPayload` interno
  - `isLoginEnabled()` retorna `false`
  - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [ ] 2.4 Refactorizar `auth.middleware.ts` para usar `AuthStrategy`
  - Inyectar `AuthStrategy` en vez de `AuthService` directamente
  - Verificar issuer: en modo integrado rechazar tokens con issuer `sgr-api`; en standalone rechazar tokens con issuer Keycloak
  - Retornar 401 con código `AUTH_ISSUER_MISMATCH` cuando el issuer no corresponde al modo
  - _Requirements: 1.4, 1.6, 1.7_

- [ ] 2.5 Deshabilitar endpoints login/refresh en modo integrado
  - En `auth.routes.ts`, responder 410 en POST `/api/auth/login` y `/api/auth/refresh` cuando `isLoginEnabled()` es `false`
  - Incluir cuerpo JSON indicando que la autenticación se realiza mediante Keycloak
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 2.6 *(Opcional)* Property test: Token Verification Correctness
  - **Property 1**: Tokens con firma válida de JWKS → aceptados; firma inválida/expirados → rechazados
  - **Validates: Requirements 1.1, 1.4**

- [ ] 2.7 *(Opcional)* Property test: Claim Extraction Completeness
  - **Property 2**: Claims de Keycloak mapeados correctamente a JWTPayload sin transformación de roles
  - **Validates: Requirements 1.2, 1.3**

- [ ] 2.8 *(Opcional)* Property test: Mode-Based Token Acceptance
  - **Property 3**: Token aceptado solo si issuer corresponde al modo (standalone↔sgr-api, integrado↔keycloak)
  - **Validates: Requirements 1.6, 1.7, 11.1**

**🔒 Checkpoint**: Verificar que auth funciona en ambos modos antes de continuar.

---

## Fase 3: Resolución de Tenant mejorada

- [ ] 4.1 Implementar extracción de slug desde subdominio en `packages/backend/src/modules/tenant/tenant-resolution.service.ts`
  - Crear función que extraiga slug de Host header formato `{slug}.{dominio}`
  - Excluir `localhost`, `www`, IPs y dominios bare
  - Retornar `null` cuando no se puede extraer un slug válido
  - _Requirements: 4.1_

- [ ] 4.2 Implementar tenant middleware en `packages/backend/src/modules/tenant/tenant.middleware.ts`
  - Resolver tenant desde header `X-Tenant-Slug` (prioridad) o fallback a JWT claim `tenant_id`
  - Buscar slug en `platform.tenants`, verificar status `active`
  - Configurar `search_path` a `sgr_{slug}, public` y poblar `request.tenantContext`
  - Retornar 404 `TENANT_NOT_FOUND` si slug no existe
  - Retornar 403 `TENANT_SUSPENDED` si status no es `active`
  - _Requirements: 4.2, 4.3, 4.4, 4.5_

- [ ] 4.3 *(Opcional)* Property test: Subdomain Slug Extraction
  - **Property 5**: Host `{slug}.{dominio}` → retorna slug; localhost/IPs → retorna null
  - **Validates: Requirements 4.1**

- [ ] 4.4 *(Opcional)* Property test: Tenant Resolution from Header
  - **Property 6**: X-Tenant-Slug con slug activo → search_path configurado correctamente
  - **Validates: Requirements 4.2**

- [ ] 4.5 *(Opcional)* Property test: Tenant Resolution Fallback from JWT
  - **Property 7**: Sin X-Tenant-Slug pero con tenant_id en JWT → resuelve correctamente
  - **Validates: Requirements 4.3**

- [ ] 4.6 *(Opcional)* Property test: Tenant Error Responses Match State
  - **Property 8**: Slug inexistente → 404; slug suspendido → 403
  - **Validates: Requirements 4.4, 4.5**

**🔒 Checkpoint**: Verificar resolución de tenant en ambos modos.

---

## Fase 4: Kafka Consumer y Provisión de Tenants

- [ ] 6.1 Crear tipos de eventos Kafka en `packages/backend/src/modules/kafka/kafka.events.ts`
  - Definir interfaces `TenantCreatedEvent`, `TenantSuspendedEvent`, `TenantReactivatedEvent`
  - Definir type union `TenantLifecycleEvent`
  - Definir interface `KafkaConfig` con brokers, groupId y topic
  - _Requirements: 5.1, 6.1, 6.4, 9.2_

- [ ] 6.2 Implementar `TenantLifecycleConsumer` en `packages/backend/src/modules/kafka/kafka.consumer.ts`
  - Instalar `kafkajs` como dependencia
  - Conectar al broker con consumer group `sgr-tenant-lifecycle`
  - Suscribirse a topic `tenant.lifecycle`
  - Implementar handlers para cada tipo de evento
  - No commit offset si el procesamiento falla (para reintento)
  - Graceful shutdown en SIGTERM
  - No inicializar si `STANDALONE_AUTH=true`
  - _Requirements: 9.1, 9.2, 9.4, 9.5_

- [ ] 6.3 Implementar reconexión con backoff exponencial
  - Delays: 1s, 2s, 4s, 8s, 16s (2^(N-1) segundos, máximo 5 intentos)
  - Loggear cada intento de reconexión
  - _Requirements: 9.3_

- [ ] 6.4 Implementar `TenantProvisioningService` en `packages/backend/src/modules/tenant/tenant-provisioning.service.ts`
  - `provisionTenant(event)`: crear schema `sgr_{slug}`, aplicar template SQL, crear registro en `platform.tenants`, crear usuario admin
  - Idempotente: si schema ya existe, no-op sin error
  - Completar provisión en < 30 segundos
  - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [ ] 6.5 Implementar `suspendTenant` y `reactivateTenant` en `TenantProvisioningService`
  - `suspendTenant(slug)`: actualizar status a `suspended`, invalidar caché Redis del tenant
  - `reactivateTenant(slug)`: actualizar status a `active`
  - Idempotente: suspender tenant ya suspendido es no-op
  - _Requirements: 6.2, 6.3, 6.5_

- [ ] 6.6 *(Opcional)* Property test: Tenant Provisioning Idempotency
  - **Property 9**: Procesar evento N veces produce exactamente un schema, un registro y un admin
  - **Validates: Requirements 5.6**

- [ ] 6.7 *(Opcional)* Property test: Tenant Provisioning Completeness
  - **Property 10**: Evento válido → schema + registro + admin user creados correctamente
  - **Validates: Requirements 5.2, 5.3, 5.4**

- [ ] 6.8 *(Opcional)* Property test: Tenant Lifecycle State Machine
  - **Property 11**: Secuencias de eventos producen transiciones correctas e idempotentes
  - **Validates: Requirements 6.2, 6.3, 6.5**

- [ ] 6.9 *(Opcional)* Property test: Kafka Retry Backoff Calculation
  - **Property 14**: Intento N → delay exactamente 2^(N-1) segundos
  - **Validates: Requirements 9.3**

**🔒 Checkpoint**: Verificar que Kafka consumer procesa eventos correctamente.

---

## Fase 5: Credit Client y Circuit Breaker

- [ ] 8.1 Implementar `CreditClient` en `packages/backend/src/modules/credits/credit.client.ts`
  - Instalar `opossum` como dependencia
  - Implementar `consume(tenantId, operation)`: POST a `/api/v1/tenants/{id}/credits/consume`
  - Implementar `compensate(tenantId, operationId)`: POST a `/api/v1/tenants/{id}/credits/compensate`
  - Configurar Circuit Breaker: threshold 3 fallos, reset 60s, timeout 5s
  - Retornar `CreditResult` con status `approved`, `insufficient` o `deferred`
  - _Requirements: 7.1, 7.2, 7.3_

- [ ] 8.2 Implementar lógica de deuda pendiente cuando circuit breaker está abierto
  - Cuando circuit breaker abierto O timeout: permitir generación y registrar deuda en `platform.credit_debts`
  - Si PDF falla después de consumir crédito: invocar compensate; si compensate falla, registrar en `credit_debts`
  - Crear migración SQL para tabla `platform.credit_debts`
  - _Requirements: 7.4, 7.5, 7.6_

- [ ] 8.3 Integrar `CreditClient` en el flujo de generación de PDF
  - En modo integrado con CB cerrado: consume → genera PDF
  - Si respuesta 402: cancelar generación, retornar 402 al usuario
  - Si CB abierto: generar con deuda, agregar warning header en respuesta
  - En modo standalone: omitir consumo de créditos
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 11.3_

- [ ] 8.4 *(Opcional)* Property test: Credit Consumption Ordering
  - **Property 12**: En modo integrado con CB cerrado, consume SIEMPRE precede a generación
  - **Validates: Requirements 7.1, 7.2, 7.3**

- [ ] 8.5 *(Opcional)* Property test: Circuit Breaker Deferred Mode
  - **Property 13**: CB abierto → genera PDF + registra deuda; fallo post-consumo → compensate
  - **Validates: Requirements 7.4, 7.5, 7.6**

**🔒 Checkpoint**: Verificar consumo de créditos y circuit breaker.

---

## Fase 6: Docker Networking y APISIX Route

- [ ] 10.1 Crear `docker-compose.override.yml` para modo integrado
  - Agregar variables de entorno `STANDALONE_AUTH=false`, `KEYCLOAK_JWKS_URL`, `KEYCLOAK_ISSUER`, `KAFKA_BROKERS`, `LICENSE_SERVICE_URL`
  - Conectar backend y postgres a red `mikel-net` (external)
  - Conectar backend a red `keycloak-external` (external)
  - No modificar el `docker-compose.yml` base
  - _Requirements: 8.1, 8.2, 8.3, 8.5_

- [ ] 10.2 Configurar upstream y ruta SGR en APISIX (`c:\dev\apisix\apisix-config\apisix.yaml`)
  - Agregar upstream `upstream-sgr` apuntando a `sgr-backend:3001` con health check en `/api/health`
  - Agregar ruta `/api/sgr/*` con plugins: openid-connect, proxy-rewrite (`/api/sgr/{path}` → `/api/{path}`), serverless-pre-function (claims → headers), CORS
  - Remover header Authorization antes de reenviar
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 10.3 *(Opcional)* Property test: URL Path Rewrite Preservation
  - **Property 4**: `/api/sgr/{P}` → `/api/{P}` preservando sub-paths y query strings
  - **Validates: Requirements 3.5**

---

## Fase 7: Wiring — Inicialización condicional

- [ ] 11.1 Actualizar `packages/backend/src/app.ts` para usar AuthStrategy
  - Crear auth strategy via factory según configuración
  - Pasar strategy al middleware de auth refactorizado
  - Registrar tenant middleware después de auth middleware
  - _Requirements: 1.7, 11.1_

- [ ] 11.2 Actualizar `packages/backend/src/index.ts` para inicialización condicional
  - Si modo integrado: inicializar Kafka consumer, credit client
  - Si modo standalone: omitir Kafka y credit client
  - Registrar graceful shutdown para Kafka consumer
  - _Requirements: 9.5, 11.1, 11.2, 11.3_

**🔒 Checkpoint Final**: Verificar que el sistema funciona en ambos modos (standalone y con plataforma completa).

---

## Notas

- Tareas marcadas con *(Opcional)* son property-based tests que se pueden omitir para un MVP más rápido
- Cada tarea referencia requisitos específicos para trazabilidad
- Los checkpoints aseguran validación incremental
- **Nuevas dependencias**: `kafkajs`, `opossum` (instalar en packages/backend/package.json)
- **Dependencias existentes**: `jose`, `fast-check`, `vitest`
- Todo el código corre en Docker — no se requiere Node.js local
- El archivo APISIX está fuera del repo SGR en `c:\dev\apisix\apisix-config\apisix.yaml`

---

## Grafo de Dependencias (Waves)

```
Wave 0:  1.1, 6.1                    (config base + tipos Kafka)
Wave 1:  1.2, 2.1                    (validación + interface)
Wave 2:  1.3*, 2.2, 2.3             (tests + strategies)
Wave 3:  2.4, 2.5                    (middleware + disable login)
Wave 4:  2.6*, 2.7*, 2.8*, 4.1     (auth tests + subdomain)
Wave 5:  4.2                         (tenant middleware)
Wave 6:  4.3*, 4.4*, 4.5*, 4.6*    (tenant tests)
Wave 7:  6.2, 6.3                    (Kafka consumer + backoff)
Wave 8:  6.4, 6.5                    (provisioning service)
Wave 9:  6.6*, 6.7*, 6.8*, 6.9*    (Kafka/provisioning tests)
Wave 10: 8.1                         (credit client)
Wave 11: 8.2                         (deuda pendiente)
Wave 12: 8.3                         (integrar en PDF)
Wave 13: 8.4*, 8.5*                  (credit tests)
Wave 14: 10.1, 10.2                  (Docker + APISIX)
Wave 15: 10.3*                       (APISIX test)
Wave 16: 11.1                        (wiring app.ts)
Wave 17: 11.2                        (wiring index.ts)
```

Tareas sin `*` = requeridas (~22 tareas)
Tareas con `*` = opcionales/tests (~15 tareas)
**Total: ~37 tareas en 18 waves**


---

## Fase 8: Control de Créditos con PDF (Generación + Descargas)

**Modelo de negocio:** 1 crédito al generar/submit + N descargas gratis + cobro al N+1 (reinicia contador)

### Contexto
- El PDF se genera con Puppeteer al hacer submit del ensayo
- Actualmente se regenera on-demand cada vez que se descarga (sin caché, sin contador)
- N es configurable por plan: PLAN_BASICO=3, PLAN_PRO=10, PLAN_ENTERPRISE=∞

### Tareas

- [ ] 13.1 Agregar campo `pdf_storage_key` y `download_count` a tabla `reactivos`
  - Migración SQL: `ALTER TABLE reactivos ADD COLUMN pdf_storage_key VARCHAR(255), ADD COLUMN download_count INTEGER DEFAULT 0`
  - `pdf_storage_key` almacena la key en Garage S3 del PDF generado
  - `download_count` se incrementa en cada descarga

- [ ] 13.2 Almacenar PDF en Garage S3 al momento del submit
  - En `ReactivoService.submit()`, después de transicionar estado a `en_revision`:
    1. Generar PDF con `PDFService.generate()`
    2. Subir a Garage S3 con key `{tenantSlug}/pdfs/{reactivoId}.pdf`
    3. Guardar `pdf_storage_key` en el reactivo
  - El PDF se genera UNA sola vez (no en cada descarga)

- [ ] 13.3 Integrar consumo de crédito al submit (primera generación)
  - Antes de generar el PDF, llamar a `PdfCreditService.validateBeforeGeneration()`
  - Si `approved` → generar y almacenar
  - Si `insufficient` → retornar 402 al usuario
  - Si `deferred` (circuit breaker) → generar y registrar deuda
  - Solo aplica en modo integrado (`STANDALONE_AUTH=false`)

- [ ] 13.4 Modificar endpoint `GET /api/reactivos/:id/pdf` para servir desde S3
  - Si `pdf_storage_key` existe → descargar de Garage S3 (no regenerar)
  - Si no existe (legacy) → generar on-demand como antes (sin cobrar)
  - Incrementar `download_count` en cada descarga

- [ ] 13.5 Implementar lógica de cobro al N+1 descargas
  - Configuración de N por plan (nueva tabla o config):
    ```
    PLAN_BASICO: max_free_downloads = 3
    PLAN_PRO: max_free_downloads = 10
    PLAN_ENTERPRISE: max_free_downloads = -1 (ilimitado)
    ```
  - En el endpoint GET /pdf, antes de servir:
    1. Obtener `download_count` del reactivo
    2. Obtener `max_free_downloads` del plan del tenant
    3. Si `download_count >= max_free_downloads` → consumir crédito via CreditClient
    4. Si crédito aprobado → resetear `download_count = 0`, servir PDF
    5. Si crédito insuficiente → retornar 402
  - En modo standalone o PLAN_ENTERPRISE → servir siempre sin cobrar

- [ ] 13.6 Crear tabla/config de límites por plan
  - Opción A: tabla `platform.plan_limits` con columns (plan_type, max_free_downloads, ...)
  - Opción B: config en License Service (endpoint GET /plans/{plan}/limits)
  - Opción C: hardcoded en config del SGR por ahora (iterar después)
  - _Decisión: empezar con Opción C (hardcoded) e iterar_

- [ ] 13.7 Agregar header `X-Downloads-Remaining` en respuesta del PDF
  - Informar al cliente cuántas descargas gratuitas le quedan
  - `X-Downloads-Remaining: 7` (de 10)
  - Cuando sea 0: el próximo download cobrará

### Dependencias
- Requiere: Fase 5 (Credit Client implementado) ✅ ya existe
- Requiere: Garage S3 configurado ✅ ya existe
- Requiere: `PdfCreditService` ✅ ya existe
- Requiere: `CreditClient` con circuit breaker ✅ ya existe

### Diagrama de flujo

```
Submit (técnico)
  │
  ├── CreditClient.consume() → License Service
  │     ├── 200 OK → continuar
  │     ├── 402 → cancelar submit (sin créditos)
  │     └── timeout/CB → generar con deuda
  │
  ├── PDFService.generate() → Buffer
  ├── Upload a Garage S3 → pdf_storage_key
  └── Guardar en DB (responses + state + pdf_storage_key)

GET /pdf (descarga)
  │
  ├── download_count < N → servir desde S3 gratis, download_count++
  └── download_count >= N → CreditClient.consume()
        ├── 200 OK → resetear contador, servir PDF
        └── 402 → rechazar descarga
```
