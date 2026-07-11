# Implementation Plan: Integración Plataforma

## Overview

Implementación incremental de la integración del SGR con la plataforma SaaS (Keycloak, APISIX, License Service, Kafka). Cada fase construye sobre la anterior, comenzando con la configuración base y terminando con la integración completa. Todos los componentes mantienen el modo dual (standalone/integrado) controlado por `STANDALONE_AUTH`.

## Tasks

- [x] 1. Configuración y modo dual (standalone vs integrado)
  - [x] 1.1 Extender `AppConfig` en `packages/backend/src/lib/config.ts`
    - Agregar campos `standaloneAuth`, `keycloak`, `kafka` y `licenseService` al interface `AppConfig`
    - Implementar parsing de variables de entorno: `STANDALONE_AUTH`, `KEYCLOAK_JWKS_URL`, `KEYCLOAK_ISSUER`, `KAFKA_BROKERS`, `LICENSE_SERVICE_URL`
    - `STANDALONE_AUTH` default a `true` cuando no está definida
    - _Requirements: 11.4, 11.5_

  - [x] 1.2 Implementar validación de configuración al inicio
    - Cuando `STANDALONE_AUTH=false`, validar que `KEYCLOAK_JWKS_URL`, `KAFKA_BROKERS` y `LICENSE_SERVICE_URL` estén definidas
    - Fallar con `process.exit(1)` indicando exactamente cuál variable falta
    - Cuando `STANDALONE_AUTH=true`, no requerir variables de integración
    - _Requirements: 11.5_

  - [ ]* 1.3 Write property test for configuration validation
    - **Property 15: Integrated Mode Configuration Validation**
    - **Validates: Requirements 11.5**

- [x] 2. Auth Strategy — Modo dual de autenticación
  - [x] 2.1 Crear interface `AuthStrategy` y factory en `packages/backend/src/modules/auth/auth-strategy.factory.ts`
    - Definir interface `AuthStrategy` con métodos `verifyToken(token: string): Promise<JWTPayload>` e `isLoginEnabled(): boolean`
    - Implementar `createAuthStrategy(config: AppConfig): AuthStrategy` que retorna la estrategia según `STANDALONE_AUTH`
    - _Requirements: 1.7, 11.1_

  - [x] 2.2 Implementar `StandaloneAuthStrategy` en `packages/backend/src/modules/auth/standalone-auth.strategy.ts`
    - Extraer la lógica actual de `AuthService.verifyToken` a esta clase
    - `isLoginEnabled()` retorna `true`
    - Mantener verificación con claves RSA locales (comportamiento actual)
    - _Requirements: 1.7, 11.1_

  - [x] 2.3 Implementar `KeycloakAuthStrategy` en `packages/backend/src/modules/auth/keycloak-auth.strategy.ts`
    - Usar `jose.createRemoteJWKSet` con el JWKS_Endpoint de Keycloak
    - Verificar firma RS256 y validar claims estándar (exp, iss)
    - Cachear JWKS con TTL de 300 segundos
    - Mapear claims de Keycloak (sub, tenant_id, roles[0], email, preferred_username) a `JWTPayload` interno
    - `isLoginEnabled()` retorna `false`
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x] 2.4 Refactorizar `auth.middleware.ts` para usar `AuthStrategy`
    - Inyectar `AuthStrategy` en vez de `AuthService` directamente
    - Verificar issuer: en modo integrado rechazar tokens con issuer `sgr-api`; en standalone rechazar tokens con issuer Keycloak
    - Retornar 401 con código `AUTH_ISSUER_MISMATCH` cuando el issuer no corresponde al modo
    - _Requirements: 1.4, 1.6, 1.7_

  - [x] 2.5 Deshabilitar endpoints login/refresh en modo integrado
    - En `auth.routes.ts`, responder 410 en POST `/api/auth/login` y `/api/auth/refresh` cuando `isLoginEnabled()` es `false`
    - Incluir cuerpo JSON indicando que la autenticación se realiza mediante Keycloak
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 2.6 Write property test for token verification
    - **Property 1: Token Verification Correctness**
    - **Validates: Requirements 1.1, 1.4**

  - [ ]* 2.7 Write property test for claim extraction
    - **Property 2: Claim Extraction Completeness**
    - **Validates: Requirements 1.2, 1.3**

  - [ ]* 2.8 Write property test for mode-based token acceptance
    - **Property 3: Mode-Based Token Acceptance**
    - **Validates: Requirements 1.6, 1.7, 11.1**

- [x] 3. Checkpoint - Auth Strategy
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Resolución de Tenant mejorada
  - [x] 4.1 Implementar extracción de slug desde subdominio en `packages/backend/src/modules/tenant/tenant-resolution.service.ts`
    - Crear función que extraiga slug de Host header formato `{slug}.{dominio}`
    - Excluir `localhost`, `www`, IPs y dominios bare
    - Retornar `null` cuando no se puede extraer un slug válido
    - _Requirements: 4.1_

  - [x] 4.2 Implementar tenant middleware en `packages/backend/src/modules/tenant/tenant.middleware.ts`
    - Resolver tenant desde header `X-Tenant-Slug` (prioridad) o fallback a JWT claim `tenant_id`
    - Buscar slug en `platform.tenants`, verificar status `active`
    - Configurar `search_path` a `sgr_{slug}, public` y poblar `request.tenantContext`
    - Retornar 404 `TENANT_NOT_FOUND` si slug no existe
    - Retornar 403 `TENANT_SUSPENDED` si status no es `active`
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [ ]* 4.3 Write property test for subdomain slug extraction
    - **Property 5: Subdomain Slug Extraction**
    - **Validates: Requirements 4.1**

  - [ ]* 4.4 Write property test for tenant resolution from header
    - **Property 6: Tenant Resolution from Header**
    - **Validates: Requirements 4.2**

  - [ ]* 4.5 Write property test for tenant resolution fallback from JWT
    - **Property 7: Tenant Resolution Fallback from JWT**
    - **Validates: Requirements 4.3**

  - [ ]* 4.6 Write property test for tenant error responses
    - **Property 8: Tenant Error Responses Match State**
    - **Validates: Requirements 4.4, 4.5**

- [x] 5. Checkpoint - Tenant Resolution
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Kafka Consumer y Provisión de Tenants
  - [x] 6.1 Crear tipos de eventos Kafka en `packages/backend/src/modules/kafka/kafka.events.ts`
    - Definir interfaces `TenantCreatedEvent`, `TenantSuspendedEvent`, `TenantReactivatedEvent`
    - Definir type union `TenantLifecycleEvent`
    - Definir interface `KafkaConfig` con brokers, groupId y topic
    - _Requirements: 5.1, 6.1, 6.4, 9.2_

  - [x] 6.2 Implementar `TenantLifecycleConsumer` en `packages/backend/src/modules/kafka/kafka.consumer.ts`
    - Instalar `kafkajs` como dependencia
    - Conectar al broker con consumer group `sgr-tenant-lifecycle`
    - Suscribirse a topic `tenant.lifecycle`
    - Implementar handlers para cada tipo de evento
    - No commit offset si el procesamiento falla (para reintento)
    - Graceful shutdown en SIGTERM
    - No inicializar si `STANDALONE_AUTH=true`
    - _Requirements: 9.1, 9.2, 9.4, 9.5_

  - [x] 6.3 Implementar reconexión con backoff exponencial
    - Delays: 1s, 2s, 4s, 8s, 16s (2^(N-1) segundos, máximo 5 intentos)
    - Loggear cada intento de reconexión
    - _Requirements: 9.3_

  - [x] 6.4 Implementar `TenantProvisioningService` en `packages/backend/src/modules/tenant/tenant-provisioning.service.ts`
    - `provisionTenant(event)`: crear schema `sgr_{slug}`, aplicar template SQL, crear registro en `platform.tenants`, crear usuario admin
    - Idempotente: si schema ya existe, no-op sin error
    - Completar provisión en < 30 segundos
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 6.5 Implementar `suspendTenant` y `reactivateTenant` en `TenantProvisioningService`
    - `suspendTenant(slug)`: actualizar status a `suspended`, invalidar caché Redis del tenant
    - `reactivateTenant(slug)`: actualizar status a `active`
    - Idempotente: suspender tenant ya suspendido es no-op
    - _Requirements: 6.2, 6.3, 6.5_

  - [ ]* 6.6 Write property test for tenant provisioning idempotency
    - **Property 9: Tenant Provisioning Idempotency**
    - **Validates: Requirements 5.6**

  - [ ]* 6.7 Write property test for tenant provisioning completeness
    - **Property 10: Tenant Provisioning Completeness**
    - **Validates: Requirements 5.2, 5.3, 5.4**

  - [ ]* 6.8 Write property test for tenant lifecycle state machine
    - **Property 11: Tenant Lifecycle State Machine**
    - **Validates: Requirements 6.2, 6.3, 6.5**

  - [ ]* 6.9 Write property test for Kafka retry backoff
    - **Property 14: Kafka Retry Backoff Calculation**
    - **Validates: Requirements 9.3**

- [x] 7. Checkpoint - Kafka & Tenant Provisioning
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Credit Client y Circuit Breaker
  - [x] 8.1 Implementar `CreditClient` en `packages/backend/src/modules/credits/credit.client.ts`
    - Instalar `opossum` como dependencia
    - Implementar `consume(tenantId, operation)`: POST a `/api/v1/tenants/{id}/credits/consume`
    - Implementar `compensate(tenantId, operationId)`: POST a `/api/v1/tenants/{id}/credits/compensate`
    - Configurar Circuit Breaker: threshold 3 fallos, reset 60s, timeout 5s
    - Retornar `CreditResult` con status `approved`, `insufficient` o `deferred`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 8.2 Implementar lógica de deuda pendiente cuando circuit breaker está abierto
    - Cuando circuit breaker abierto O timeout: permitir generación y registrar deuda en `platform.credit_debts`
    - Si PDF falla después de consumir crédito: invocar compensate; si compensate falla, registrar en `credit_debts`
    - Crear migración SQL para tabla `platform.credit_debts`
    - _Requirements: 7.4, 7.5, 7.6_

  - [x] 8.3 Integrar `CreditClient` en el flujo de generación de PDF
    - En modo integrado con CB cerrado: consume → genera PDF
    - Si respuesta 402: cancelar generación, retornar 402 al usuario
    - Si CB abierto: generar con deuda, agregar warning header en respuesta
    - En modo standalone: omitir consumo de créditos
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 11.3_

  - [ ]* 8.4 Write property test for credit consumption ordering
    - **Property 12: Credit Consumption Ordering**
    - **Validates: Requirements 7.1, 7.2, 7.3**

  - [ ]* 8.5 Write property test for circuit breaker deferred mode
    - **Property 13: Circuit Breaker Deferred Mode**
    - **Validates: Requirements 7.4, 7.5, 7.6**

- [x] 9. Checkpoint - Credit Client
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Docker Networking y APISIX Route
  - [x] 10.1 Crear `docker-compose.override.yml` para modo integrado
    - Agregar variables de entorno `STANDALONE_AUTH=false`, `KEYCLOAK_JWKS_URL`, `KEYCLOAK_ISSUER`, `KAFKA_BROKERS`, `LICENSE_SERVICE_URL`
    - Conectar backend y postgres a red `mikel-net` (external)
    - Conectar backend a red `keycloak-external` (external)
    - No modificar el `docker-compose.yml` base
    - _Requirements: 8.1, 8.2, 8.3, 8.5_

  - [x] 10.2 Configurar upstream y ruta SGR en APISIX (`c:\dev\apisix\apisix-config\apisix.yaml`)
    - Agregar upstream `upstream-sgr` apuntando a `sgr-backend:3001` con health check en `/api/health`
    - Agregar ruta `/api/sgr/*` con plugins: openid-connect (JWKS verify), proxy-rewrite (`/api/sgr/{path}` → `/api/{path}`), serverless-pre-function (extraer claims a headers), CORS
    - Remover header Authorization antes de reenviar
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 10.3 Write property test for URL path rewrite
    - **Property 4: URL Path Rewrite Preservation**
    - **Validates: Requirements 3.5**

- [x] 11. Wiring: Inicialización condicional en `app.ts` e `index.ts`
  - [x] 11.1 Actualizar `packages/backend/src/app.ts` para usar AuthStrategy
    - Crear auth strategy via factory según configuración
    - Pasar strategy al middleware de auth refactorizado
    - Registrar tenant middleware después de auth middleware
    - _Requirements: 1.7, 11.1_

  - [x] 11.2 Actualizar `packages/backend/src/index.ts` para inicialización condicional
    - Si modo integrado: inicializar Kafka consumer, credit client
    - Si modo standalone: omitir Kafka y credit client
    - Registrar graceful shutdown para Kafka consumer
    - _Requirements: 9.5, 11.1, 11.2, 11.3_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- `kafkajs` and `opossum` are new dependencies to install; `jose` and `fast-check` already exist
- All code runs inside Docker containers — no local Node.js required
- The APISIX config file is outside the SGR repo at `c:\dev\apisix\apisix-config\apisix.yaml`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "6.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["1.3", "2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4", "2.5"] },
    { "id": 4, "tasks": ["2.6", "2.7", "2.8", "4.1"] },
    { "id": 5, "tasks": ["4.2"] },
    { "id": 6, "tasks": ["4.3", "4.4", "4.5", "4.6"] },
    { "id": 7, "tasks": ["6.2", "6.3"] },
    { "id": 8, "tasks": ["6.4", "6.5"] },
    { "id": 9, "tasks": ["6.6", "6.7", "6.8", "6.9"] },
    { "id": 10, "tasks": ["8.1"] },
    { "id": 11, "tasks": ["8.2"] },
    { "id": 12, "tasks": ["8.3"] },
    { "id": 13, "tasks": ["8.4", "8.5"] },
    { "id": 14, "tasks": ["10.1", "10.2"] },
    { "id": 15, "tasks": ["10.3"] },
    { "id": 16, "tasks": ["11.1"] },
    { "id": 17, "tasks": ["11.2"] }
  ]
}
```
