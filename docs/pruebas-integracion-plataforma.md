# Pruebas de Integración — Plataforma Mikel (4 Módulos)

## Prerrequisitos

Levantar los 4 módulos en orden:

```powershell
# 1. Keycloak
cd c:\dev\Integrator
docker compose -f docker-compose.keycloak.yml --env-file .env.keycloak up -d

# 2. License Service (+ Kafka, Redis, Portal)
cd c:\dev\licencesmikel\license-service
docker compose up -d

# 3. SGR en modo integrado
cd c:\dev\smt
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d

# 4. APISIX
cd c:\dev\apisix
docker compose -f docker-compose.apisix.yml --env-file .env.apisix up -d
```

Verificar que todos los servicios están healthy:
```powershell
docker ps --format "table {{.Names}}\t{{.Status}}"
```

---

## Etapa 1: Conectividad y Health Checks

### P1.1 — Todos los servicios responden health check

| # | Comando | Resultado esperado |
|---|---------|-------------------|
| 1 | `Invoke-RestMethod http://localhost:8180/health/ready` | Status 200 |
| 2 | `Invoke-RestMethod http://localhost:8080/actuator/health` | `{"status":"UP"}` |
| 3 | `Invoke-RestMethod http://localhost:3001/api/health` | `{"status":"ok"}` |
| 4 | `Invoke-RestMethod http://localhost:9080/health` | `{"status":"ok","service":"MikelIntegratorGW"}` |

### P1.2 — APISIX alcanza todos los upstreams

| # | Acción | Resultado esperado |
|---|--------|-------------------|
| 1 | Revisar logs de APISIX: health check a sgr-backend:3001 pasa | Logs muestran upstream-sgr healthy |
| 2 | Revisar logs de APISIX: health check a license-app:8080 pasa | Logs muestran upstream-licencesmikel healthy |

---

## Etapa 2: Autenticación con Keycloak

### P2.1 — Obtener token JWT de Keycloak

```powershell
$tokenResponse = Invoke-RestMethod -Method POST `
  -Uri "http://localhost:8180/realms/mikel-crm/protocol/openid-connect/token" `
  -ContentType "application/x-www-form-urlencoded" `
  -Body @{
    grant_type = "password"
    client_id = "mikel-crm-test"
    client_secret = "test-client-secret-dev"
    username = "dev-tester"
    password = "dev1234"
  }

$token = $tokenResponse.access_token
Write-Host "Token obtenido: $($token.Substring(0,50))..."
```

**Criterio:** Se obtiene un `access_token` no vacío.

### P2.2 — Token contiene claims esperados

Decodificar el JWT (base64 del segundo segmento) y verificar:

| Claim | Valor esperado |
|-------|---------------|
| `iss` | `http://keycloak:8080/realms/mikel-crm` o `http://localhost:8180/realms/mikel-crm` |
| `sub` | UUID no vacío |
| `license_id` | `LIC-TEST-001` |
| `plan_type` | `PLAN_PRO` |
| `roles` o `realm_access.roles` | Contiene al menos un rol |

### P2.3 — SGR rechaza token auto-emitido en modo integrado

```powershell
# Intentar usar un token generado por el SGR directamente (issuer: sgr-api)
# Este debe ser rechazado con 401
$headers = @{ Authorization = "Bearer $tokenLegacy" }
$response = Invoke-WebRequest -Method GET `
  -Uri "http://localhost:3001/api/users" `
  -Headers $headers -SkipHttpErrorCheck

# Esperado: 401 con code AUTH_ISSUER_MISMATCH o AUTH_003
$response.StatusCode  # 401
```

### P2.4 — SGR acepta token de Keycloak vía acceso directo

```powershell
$headers = @{ Authorization = "Bearer $token" }
$response = Invoke-RestMethod -Method GET `
  -Uri "http://localhost:3001/api/health" `
  -Headers $headers

# Esperado: 200 OK (health es público, pero demuestra conectividad)
```

### P2.5 — Endpoints login/refresh deshabilitados en modo integrado

```powershell
$response = Invoke-WebRequest -Method POST `
  -Uri "http://localhost:3001/api/auth/login" `
  -ContentType "application/json" `
  -Body '{"email":"admin@sgr.local","password":"admin123"}' `
  -SkipHttpErrorCheck

# Esperado: 410 Gone con AUTH_ENDPOINT_DISABLED
$response.StatusCode  # 410
```

---

## Etapa 3: Routing vía APISIX

### P3.1 — Ruta /api/sgr/* llega al SGR

```powershell
$headers = @{ Authorization = "Bearer $token" }
$response = Invoke-RestMethod -Method GET `
  -Uri "http://localhost:9080/api/sgr/health" `
  -Headers $headers

# Esperado: {"status":"ok"} (APISIX reescribe /api/sgr/health → /api/health en SGR)
```

### P3.2 — APISIX inyecta headers correctos al SGR

```powershell
# Verificar en los logs del SGR que recibe los headers:
# X-Consumer-Id: <uuid del sub>
# X-Tenant-Slug: <tenant_id del claim o subdominio>
# X-Plan-Type: PLAN_PRO

# Hacer un request y revisar logs:
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Method GET `
  -Uri "http://localhost:9080/api/sgr/users" `
  -Headers $headers
```

**Criterio:** El request llega al SGR con los headers X-Consumer-Id y X-Tenant-Slug presentes (verificar en logs del backend).

### P3.3 — APISIX rechaza request sin token

```powershell
$response = Invoke-WebRequest -Method GET `
  -Uri "http://localhost:9080/api/sgr/users" `
  -SkipHttpErrorCheck

# Esperado: 401 Unauthorized (openid-connect plugin rechaza)
$response.StatusCode  # 401
```

### P3.4 — APISIX remueve header Authorization antes de reenviar

Verificar en logs del SGR que NO recibe el header `Authorization` — el backend debe confiar en los headers X-* inyectados por APISIX.

### P3.5 — Ruta /api/v1/* sigue funcionando para License Service

```powershell
$headers = @{ Authorization = "Bearer $token" }
$response = Invoke-WebRequest -Method GET `
  -Uri "http://localhost:9080/api/v1/actuator/health" `
  -Headers $headers -SkipHttpErrorCheck

# Esperado: proxy a license-app, response del Spring Boot
```

---

## Etapa 4: Resolución de Tenant

### P4.1 — Tenant resuelto desde claim JWT

```powershell
# El token de Keycloak contiene tenant_id → SGR lo usa para resolver el schema
$headers = @{ Authorization = "Bearer $token" }
$response = Invoke-RestMethod -Method GET `
  -Uri "http://localhost:9080/api/sgr/users" `
  -Headers $headers

# Esperado: Respuesta del SGR con datos del tenant correcto
# Verificar en logs: "search_path = sgr_{slug}, public"
```

### P4.2 — Tenant resuelto desde subdominio (cuando APISIX extrae de Host)

```powershell
# Simular subdominio: empresa-test.localhost
$headers = @{
  Authorization = "Bearer $token"
  Host = "empresa-test.localhost"
}
$response = Invoke-WebRequest -Method GET `
  -Uri "http://localhost:9080/api/sgr/users" `
  -Headers $headers -SkipHttpErrorCheck

# Si el tenant "empresa-test" existe → 200
# Si no existe → 404 TENANT_NOT_FOUND
```

### P4.3 — Tenant suspendido retorna 403

```powershell
# Prerrequisito: suspender un tenant directamente en la BD
# UPDATE platform.tenants SET status = 'suspended' WHERE slug = 'test-tenant';

$headers = @{
  Authorization = "Bearer $token"
  "X-Tenant-Slug" = "test-tenant-suspendido"
}
$response = Invoke-WebRequest -Method GET `
  -Uri "http://localhost:3001/api/users" `
  -Headers $headers -SkipHttpErrorCheck

# Esperado: 403 con código TENANT_SUSPENDED
$response.StatusCode  # 403
```

---

## Etapa 5: Ciclo de Vida de Tenant vía Kafka

### P5.1 — Evento tenant.created crea schema en SGR

```powershell
# Producir evento en Kafka:
docker exec license-kafka /opt/kafka/bin/kafka-console-producer.sh `
  --broker-list localhost:9092 `
  --topic tenant.lifecycle

# Pegar este JSON:
# {"type":"tenant.created","tenant_id":"test-uuid-001","slug":"empresa-prueba","nombre":"Empresa Prueba S.A.","admin_email":"admin@empresa-prueba.com","timestamp":"2026-07-10T10:00:00Z"}
```

**Verificar en SGR:**
```powershell
# Conectar a PostgreSQL del SGR
docker exec -it sgr-postgres psql -U sgr -d sgr_dev

# Verificar schema creado
SELECT nspname FROM pg_namespace WHERE nspname = 'sgr_empresa_prueba';
-- Debe retornar 1 fila

# Verificar tenant en platform.tenants
SELECT * FROM platform.tenants WHERE slug = 'empresa-prueba';
-- status debe ser 'active'

# Verificar admin user
SELECT email, role FROM sgr_empresa_prueba.users WHERE email = 'admin@empresa-prueba.com';
-- role debe ser 'admin'
```

### P5.2 — Evento tenant.created es idempotente

Enviar el mismo evento dos veces. La segunda vez no debe producir error ni duplicados:
- No se crea un segundo registro en `platform.tenants`
- No se duplica el usuario admin
- Logs muestran "ya existe, omitiendo provisión"

### P5.3 — Evento tenant.suspended bloquea acceso

```powershell
# Enviar evento de suspensión:
# {"type":"tenant.suspended","tenant_id":"test-uuid-001","slug":"empresa-prueba","timestamp":"2026-07-10T11:00:00Z"}

# Verificar que el tenant queda suspendido:
SELECT status FROM platform.tenants WHERE slug = 'empresa-prueba';
-- Debe ser 'suspended'

# Intentar acceder:
$headers = @{
  Authorization = "Bearer $token"
  "X-Tenant-Slug" = "empresa-prueba"
}
$response = Invoke-WebRequest -Method GET `
  -Uri "http://localhost:3001/api/users" `
  -Headers $headers -SkipHttpErrorCheck

$response.StatusCode  # 403 TENANT_SUSPENDED
```

### P5.4 — Evento tenant.reactivated restaura acceso

```powershell
# Enviar evento de reactivación:
# {"type":"tenant.reactivated","tenant_id":"test-uuid-001","slug":"empresa-prueba","timestamp":"2026-07-10T12:00:00Z"}

SELECT status FROM platform.tenants WHERE slug = 'empresa-prueba';
-- Debe ser 'active'

# El acceso vuelve a funcionar (200 OK)
```

---

## Etapa 6: Consumo de Créditos

### P6.1 — PDF generation consume un crédito (mock)

```powershell
# Prerrequisito: License Service debe tener el endpoint /api/v1/tenants/{id}/credits/consume
# Si no está implementado aún, verificar que el SGR:
# 1. Intenta llamar a license-app:8080
# 2. Si falla (404/timeout), activa circuit breaker
# 3. Registra deuda en platform.credit_debts

# Verificar la tabla de deudas:
docker exec -it sgr-postgres psql -U sgr -d sgr_dev -c "SELECT * FROM platform.credit_debts;"
```

### P6.2 — Circuit breaker se abre tras 3 fallos

1. Asegurar que License Service NO tiene el endpoint (retorna 404)
2. Intentar generar 3 PDFs consecutivos
3. A partir del 4to, el SGR debe:
   - NO intentar llamar a License Service (circuit open)
   - Generar PDF directamente
   - Registrar deuda

Verificar logs del SGR: `"Circuit breaker ABIERTO"`

### P6.3 — Créditos insuficientes bloquean generación

Si License Service responde con 402:
- SGR retorna 402 al usuario
- PDF NO se genera
- No se registra deuda

---

## Etapa 7: Single Sign-On (SSO)

### P7.1 — Token de Keycloak funciona en ambos servicios

```powershell
# Mismo token funciona para SGR:
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri "http://localhost:9080/api/sgr/health" -Headers $headers
# 200 OK

# Y para License Service:
Invoke-RestMethod -Uri "http://localhost:9080/api/v1/actuator/health" -Headers $headers
# 200 OK (o lo que License Service retorne)
```

### P7.2 — JWKS compartido entre servicios

Verificar que tanto APISIX como SGR validan contra el mismo JWKS:
```powershell
# APISIX usa: http://keycloak:8080/realms/mikel-crm/.well-known/openid-configuration
# SGR usa: KEYCLOAK_JWKS_URL = http://keycloak:8080/realms/mikel-crm/protocol/openid-connect/certs
# Ambos deben aceptar el mismo token → mismo resultado
```

---

## Etapa 8: Redes Docker

### P8.1 — SGR resuelve hostnames de la plataforma

```powershell
# Desde dentro del contenedor SGR:
docker exec sgr-backend node -e "
  const dns = require('dns');
  ['keycloak', 'license-app', 'kafka'].forEach(host => {
    dns.resolve4(host, (err, addrs) => {
      console.log(host + ':', err ? 'NO RESUELVE' : addrs.join(','));
    });
  });
"
```

**Criterio:**
- `keycloak` → resuelve (vía keycloak-external)
- `license-app` → resuelve (vía mikel-net)
- `kafka` → resuelve (vía mikel-net)

### P8.2 — SGR NO expone puertos internos al host para inter-servicio

La comunicación entre servicios es SOLO por redes Docker internas. No debe usarse `localhost:8180` desde el backend.

---

## Etapa 9: Modo Standalone (Regresión)

### P9.1 — SGR funciona sin override

```powershell
# Detener todo y levantar solo SGR base (sin override):
cd c:\dev\smt
docker compose down
docker compose up -d

# Login con credenciales locales debe funcionar:
$body = @{ email = "admin@sgr.local"; password = "admin123" } | ConvertTo-Json
$response = Invoke-RestMethod -Method POST `
  -Uri "http://localhost:3001/api/auth/login" `
  -ContentType "application/json" `
  -Body $body

# Esperado: 200 OK con accessToken y user
$response.accessToken  # No vacío
```

### P9.2 — No hay errores de Kafka ni License Service en standalone

Verificar logs del backend:
```powershell
docker logs sgr-backend 2>&1 | Select-String -Pattern "Kafka|license-app|KEYCLOAK"
# No debe haber errores de conexión — estos servicios no se inicializan
```

### P9.3 — Variable STANDALONE_AUTH no definida = standalone

Un `git clone` fresco sin `.env` debe funcionar sin configuración adicional:
- `STANDALONE_AUTH` no definida → default `true`
- No intenta conectar a Kafka
- No intenta conectar a Keycloak JWKS
- Login local funciona

---

## Resumen de Criterios de Aceptación

| Etapa | Pruebas | Criterio global |
|-------|---------|-----------------|
| 1. Conectividad | 4 health checks | Todos los servicios UP |
| 2. Auth | 5 pruebas | Keycloak como SSO, legacy rechazado |
| 3. Routing | 5 pruebas | APISIX enruta correctamente a SGR |
| 4. Tenant | 3 pruebas | Resolución por claim, subdominio y header |
| 5. Kafka | 4 pruebas | Provisión, idempotencia, suspensión, reactivación |
| 6. Créditos | 3 pruebas | Consumo, circuit breaker, insuficientes |
| 7. SSO | 2 pruebas | Token único válido en todos los servicios |
| 8. Redes | 2 pruebas | Resolución DNS y aislamiento |
| 9. Standalone | 3 pruebas | Sin regresiones en modo desarrollo |

**Total: 31 pruebas manuales de integración organizadas en 9 etapas atómicas.**

---

## Orden de Ejecución Recomendado

```
Etapa 9 (Standalone) → se ejecuta PRIMERO para confirmar que no hay regresiones
Etapa 1 (Health) → confirma que todo arrancó
Etapa 8 (Redes) → confirma conectividad inter-servicio
Etapa 2 (Auth) → confirma que Keycloak funciona como IdP
Etapa 3 (Routing) → confirma que APISIX enruta al SGR
Etapa 4 (Tenant) → confirma resolución multi-tenant
Etapa 5 (Kafka) → confirma ciclo de vida asíncrono
Etapa 6 (Créditos) → confirma integración con License Service
Etapa 7 (SSO) → confirma experiencia unificada
```
