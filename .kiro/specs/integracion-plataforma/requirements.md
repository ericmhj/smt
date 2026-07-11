# Requirements Document

## Introduction

Este documento define los requisitos para integrar los 4 proyectos existentes (SGR, License Service, Keycloak, APISIX) en una plataforma SaaS unificada. La integración cubre autenticación centralizada con Keycloak, enrutamiento mediante APISIX como gateway único, ciclo de vida de tenants coordinado vía Kafka, consumo de créditos inter-servicio y Single Sign-On con resolución por subdominio.

## Glossary

- **SGR**: Sistema de Gestión de Ensayos. Backend Node.js/Fastify con frontend Next.js. Opera con esquema-por-tenant en PostgreSQL.
- **License_Service**: Servicio Java/Spring Boot que gestiona contratos, facturación, créditos y ciclo de vida de tenants.
- **Keycloak**: Servidor de identidad (v24.0.3) que emite JWT RS256 y gestiona Organizations, roles y SSO.
- **APISIX**: API Gateway (Apache APISIX 3.9.0) que valida JWT contra Keycloak JWKS y enruta tráfico a los servicios.
- **JWT_Keycloak**: Token de acceso RS256 emitido por Keycloak con claims estándar y claims personalizados (license_id, plan_type, tenant_id, roles).
- **JWKS_Endpoint**: URL pública de Keycloak que expone las claves públicas para verificación de firma JWT.
- **Tenant**: Organización cliente aislada con su propio schema PostgreSQL (sgr_{slug}), Organization en Keycloak y contrato en License_Service.
- **Schema_Tenant**: Schema PostgreSQL con nomenclatura sgr_{slug} que contiene todas las tablas de datos del tenant.
- **Kafka_Event**: Mensaje publicado en un topic de Apache Kafka para comunicación asíncrona entre servicios.
- **Credit**: Unidad de consumo que se descuenta al generar documentos PDF en el SGR.
- **Roles_Keycloak**: Roles definidos en Keycloak que coinciden directamente con los roles internos del SGR (platform_admin, admin, manager, tecnico, asistente). Keycloak es la fuente única de verdad.
- **Middleware_Auth**: Plugin/middleware de Fastify que intercepta peticiones y valida el JWT antes de procesar la ruta.
- **APISIX_Route**: Regla declarativa en YAML que define el upstream, plugins y path matching para una ruta del gateway.
- **X-Tenant-Slug**: Header HTTP inyectado por APISIX con el slug del tenant resuelto desde el subdominio o el claim JWT.
- **Circuit_Breaker**: Patrón de resiliencia que abre el circuito tras N fallos consecutivos a un servicio externo, evitando cascadas de errores.
- **Mikel_Net**: Red Docker compartida (bridge) que permite comunicación entre contenedores de los 4 proyectos.

## Requirements

### Requisito 1: Validación de JWT de Keycloak en SGR

**User Story:** Como desarrollador de plataforma, quiero que el SGR valide tokens JWT emitidos por Keycloak en lugar de generar tokens propios, para que un solo login sirva para acceder a todos los módulos de la plataforma.

#### Criterios de Aceptación

1. WHEN el SGR recibe una petición con header Authorization Bearer, THE Middleware_Auth SHALL verificar la firma del token contra el JWKS_Endpoint de Keycloak usando el algoritmo RS256.
2. WHEN la verificación de firma es exitosa, THE Middleware_Auth SHALL extraer los claims sub, tenant_id, roles, email y preferred_username del JWT_Keycloak y poblar el contexto de la petición.
3. THE SGR SHALL usar el valor del claim roles del JWT_Keycloak directamente como rol del usuario sin transformación, siendo Keycloak la fuente única de verdad para los roles (platform_admin, admin, manager, tecnico, asistente).
4. WHEN la verificación de firma falla o el token está expirado, THE Middleware_Auth SHALL responder con código HTTP 401 y un cuerpo JSON con el código de error AUTH_INVALID_TOKEN.
5. THE SGR SHALL cachear las claves públicas del JWKS_Endpoint durante 300 segundos para reducir latencia de verificación.
6. WHILE el SGR opera en modo integrado, THE SGR SHALL rechazar tokens emitidos por el issuer sgr-api (tokens legacy auto-emitidos).
7. WHILE el SGR opera en modo standalone (variable STANDALONE_AUTH=true), THE SGR SHALL aceptar tokens auto-emitidos con issuer sgr-api para compatibilidad en desarrollo local.

### Requisito 2: Eliminación de Generación de JWT Propio

**User Story:** Como desarrollador de plataforma, quiero eliminar la generación de tokens JWT propios del SGR cuando opera en modo integrado, para evitar tener dos fuentes de autenticación en producción.

#### Criterios de Aceptación

1. WHILE el SGR opera en modo integrado (STANDALONE_AUTH=false), THE SGR SHALL deshabilitar los endpoints POST /api/auth/login y POST /api/auth/refresh.
2. WHILE el SGR opera en modo integrado, THE SGR SHALL eliminar la generación de claves RSA al inicio del servicio.
3. WHEN un cliente invoca POST /api/auth/login en modo integrado, THE SGR SHALL responder con código HTTP 410 y un cuerpo JSON indicando que la autenticación se realiza mediante Keycloak.
4. WHILE el SGR opera en modo standalone, THE SGR SHALL mantener el flujo de login/refresh actual sin cambios para desarrollo local.

### Requisito 3: Configuración de Ruta APISIX para SGR

**User Story:** Como usuario, quiero acceder al SGR a través del gateway unificado APISIX, para utilizar un solo punto de entrada para todos los servicios de la plataforma.

#### Criterios de Aceptación

1. THE APISIX SHALL definir un upstream sgr-backend que apunte al contenedor sgr-backend en el puerto 3001 con health check activo sobre /api/health.
2. THE APISIX SHALL definir una ruta /api/sgr/* que enrute peticiones GET, POST, PUT, PATCH y DELETE al upstream sgr-backend.
3. WHEN una petición llega a /api/sgr/*, THE APISIX SHALL validar el JWT_Keycloak usando el plugin openid-connect contra el JWKS_Endpoint de Keycloak antes de enrutar.
4. WHEN la validación JWT es exitosa, THE APISIX SHALL extraer los claims del token e inyectar los headers X-Consumer-Id, X-Tenant-Slug y X-Plan-Type antes de reenviar la petición al SGR.
5. THE APISIX SHALL aplicar proxy-rewrite para transformar /api/sgr/{path} en /api/{path} antes de enviar al SGR.
6. THE APISIX SHALL remover el header Authorization antes de reenviar la petición al SGR para evitar doble validación.

### Requisito 4: Resolución de Tenant por Subdominio

**User Story:** Como usuario de un tenant, quiero acceder a mi instancia mediante un subdominio personalizado (miempresa.mikel.com), para tener una experiencia dedicada sin necesidad de seleccionar la organización.

#### Criterios de Aceptación

1. WHEN una petición llega a APISIX con un Host header del formato {slug}.{dominio_base}, THE APISIX SHALL extraer el slug y asignarlo al header X-Tenant-Slug.
2. WHEN el SGR recibe una petición con el header X-Tenant-Slug, THE SGR SHALL usar el valor del header para resolver el Schema_Tenant y configurar el search_path de PostgreSQL.
3. WHEN el SGR recibe una petición sin header X-Tenant-Slug y sin subdominio reconocible, THE SGR SHALL usar el claim tenant_id del JWT_Keycloak para buscar el slug del tenant en la tabla platform.tenants.
4. IF el slug del header X-Tenant-Slug no corresponde a ningún tenant registrado, THEN THE SGR SHALL responder con código HTTP 404 y un cuerpo JSON con el código TENANT_NOT_FOUND.
5. IF el tenant resuelto tiene status diferente de active, THEN THE SGR SHALL responder con código HTTP 403 y un cuerpo JSON con el código TENANT_SUSPENDED.

### Requisito 5: Provisión Automática de Tenant en SGR vía Kafka

**User Story:** Como sistema de contratación, quiero que al crear un tenant en License_Service se cree automáticamente el schema en SGR, para que el cliente pueda usar los ensayos inmediatamente después de contratar.

#### Criterios de Aceptación

1. WHEN License_Service crea un nuevo tenant, THE License_Service SHALL publicar un Kafka_Event al topic tenant.lifecycle con tipo tenant.created conteniendo tenant_id, slug, nombre y admin_email.
2. WHEN el SGR recibe un evento tenant.created, THE SGR SHALL crear el Schema_Tenant sgr_{slug} ejecutando el template SQL de tablas base.
3. WHEN el SGR recibe un evento tenant.created, THE SGR SHALL crear un registro en la tabla platform.tenants con el slug, nombre y status active.
4. WHEN el SGR recibe un evento tenant.created, THE SGR SHALL crear un usuario administrador en el schema del tenant con el email proporcionado y rol admin.
5. IF la creación del Schema_Tenant falla por un error de base de datos, THEN THE SGR SHALL registrar el error en logs y el evento permanecerá en Kafka para reintento automático.
6. WHEN el SGR recibe un evento tenant.created para un slug que ya existe en platform.tenants, THE SGR SHALL ignorar el evento sin producir error (idempotencia).
7. THE SGR SHALL completar la provisión del Schema_Tenant en un tiempo inferior a 30 segundos desde la recepción del evento.

### Requisito 6: Sincronización de Suspensión de Tenant

**User Story:** Como administrador de plataforma, quiero que al suspender un tenant en License_Service se suspenda también en SGR y Keycloak, para que el bloqueo sea completo y consistente entre todos los servicios.

#### Criterios de Aceptación

1. WHEN License_Service suspende un tenant, THE License_Service SHALL publicar un Kafka_Event al topic tenant.lifecycle con tipo tenant.suspended conteniendo tenant_id y slug.
2. WHEN el SGR recibe un evento tenant.suspended, THE SGR SHALL actualizar el status del tenant a suspended en la tabla platform.tenants.
3. WHEN el SGR recibe un evento tenant.suspended, THE SGR SHALL invalidar todas las entradas de caché Redis asociadas al tenant.
4. WHEN License_Service reactiva un tenant, THE License_Service SHALL publicar un Kafka_Event al topic tenant.lifecycle con tipo tenant.reactivated conteniendo tenant_id y slug.
5. WHEN el SGR recibe un evento tenant.reactivated, THE SGR SHALL actualizar el status del tenant a active en la tabla platform.tenants.

### Requisito 7: Consumo de Créditos al Generar PDF

**User Story:** Como sistema de ensayos, quiero descontar un crédito del License_Service cuando un técnico genera un PDF de ensayo, para que el modelo de negocio de créditos funcione de extremo a extremo.

#### Criterios de Aceptación

1. WHEN un técnico solicita la generación de un PDF de ensayo, THE SGR SHALL invocar POST /api/v1/tenants/{tenant_id}/credits/consume en License_Service con el tipo de operación y metadata del ensayo antes de generar el documento.
2. WHEN License_Service responde con HTTP 200, THE SGR SHALL proceder con la generación del PDF.
3. WHEN License_Service responde con HTTP 402 (saldo insuficiente), THE SGR SHALL cancelar la generación del PDF y responder al usuario con código HTTP 402 y un mensaje indicando créditos insuficientes.
4. IF License_Service no responde dentro de 5 segundos, THEN THE SGR SHALL activar el Circuit_Breaker y permitir la generación del PDF registrando una deuda pendiente para cobro posterior.
5. IF la generación del PDF falla después de consumir el crédito, THEN THE SGR SHALL invocar POST /api/v1/tenants/{tenant_id}/credits/compensate en License_Service para devolver el crédito.
6. WHILE el Circuit_Breaker está abierto (más de 3 fallos consecutivos en 60 segundos), THE SGR SHALL permitir generación de PDF sin consumo previo y registrar la deuda para reconciliación.

### Requisito 8: Red Docker Compartida entre Servicios

**User Story:** Como desarrollador de plataforma, quiero que todos los servicios se comuniquen a través de redes Docker compartidas, para que la comunicación inter-servicio sea interna sin exponer puertos al host.

#### Criterios de Aceptación

1. THE SGR SHALL conectar sus contenedores backend y postgres a la red Docker mikel-net además de su red interna sgr-network.
2. THE SGR SHALL conectar su contenedor backend a la red Docker keycloak-external para poder resolver el JWKS_Endpoint de Keycloak.
3. THE SGR SHALL declarar las redes mikel-net y keycloak-external como redes externas (external: true) en su docker-compose.yml.
4. THE APISIX SHALL conectarse a la red sgr-network o mikel-net para alcanzar el contenedor sgr-backend en el puerto 3001.
5. WHEN el SGR necesita comunicarse con License_Service, THE SGR SHALL resolver el hostname license-app a través de la red mikel-net sin usar puertos expuestos al host.

### Requisito 9: Consumidor Kafka en SGR

**User Story:** Como desarrollador de plataforma, quiero que el SGR tenga un consumidor Kafka que escuche eventos del ciclo de vida de tenants, para reaccionar automáticamente a altas, suspensiones y reactivaciones.

#### Criterios de Aceptación

1. THE SGR SHALL conectarse al broker Kafka (kafka:9092) a través de la red mikel-net usando un consumer group identificado como sgr-tenant-lifecycle.
2. THE SGR SHALL suscribirse al topic tenant.lifecycle y procesar mensajes con tipos tenant.created, tenant.suspended y tenant.reactivated.
3. IF la conexión al broker Kafka falla al iniciar, THEN THE SGR SHALL reintentar la conexión con backoff exponencial (1s, 2s, 4s, 8s) hasta un máximo de 5 intentos.
4. IF el procesamiento de un evento falla, THEN THE SGR SHALL no confirmar el offset del mensaje (no commit) para que Kafka lo reintente en la siguiente iteración del consumer.
5. WHILE el SGR opera en modo standalone, THE SGR SHALL no inicializar el consumidor Kafka para permitir desarrollo sin dependencia de infraestructura externa.

### Requisito 10: Single Sign-On entre Portal y SGR

**User Story:** Como usuario, quiero iniciar sesión una sola vez en Keycloak y acceder tanto al Portal de Contratación como al SGR, para no tener que recordar múltiples credenciales ni autenticarme repetidamente.

#### Criterios de Aceptación

1. THE SGR SHALL redirigir usuarios no autenticados a la página de login de Keycloak (realm mikel-crm) cuando no hay un JWT_Keycloak válido presente.
2. WHEN un usuario se autentica en Keycloak, THE Keycloak SHALL emitir un JWT_Keycloak que sea válido para ambos servicios (SGR y Portal de Contratación).
3. THE SGR SHALL validar el JWT_Keycloak usando el mismo JWKS_Endpoint que utiliza el Portal de Contratación y APISIX.
4. WHEN el JWT_Keycloak expira, THE SGR (frontend) SHALL usar el refresh token de Keycloak para obtener un nuevo access token sin redirigir al usuario a login.
5. WHEN el usuario cierra sesión en cualquiera de las aplicaciones, THE Keycloak SHALL invalidar la sesión SSO para todas las aplicaciones del realm mikel-crm.

### Requisito 11: Compatibilidad con Desarrollo Local (Modo Standalone)

**User Story:** Como desarrollador, quiero poder ejecutar el SGR de forma independiente sin necesidad de levantar Keycloak, APISIX ni License_Service, para mantener un flujo de desarrollo ágil.

#### Criterios de Aceptación

1. WHEN la variable de entorno STANDALONE_AUTH tiene valor true, THE SGR SHALL usar el sistema de autenticación local con JWT auto-emitido (comportamiento actual).
2. WHEN la variable de entorno STANDALONE_AUTH tiene valor true, THE SGR SHALL no inicializar el consumidor Kafka ni la conexión al broker.
3. WHEN la variable de entorno STANDALONE_AUTH tiene valor true, THE SGR SHALL no requerir conectividad a License_Service para generar PDFs (omitir consumo de créditos).
4. THE SGR SHALL usar el valor STANDALONE_AUTH=true como default cuando la variable no está definida, garantizando que un clone fresco del repositorio funcione sin configuración adicional.
5. WHEN la variable STANDALONE_AUTH tiene valor false, THE SGR SHALL requerir las variables KEYCLOAK_JWKS_URL, KAFKA_BROKERS y LICENSE_SERVICE_URL definidas, y fallar al iniciar si alguna falta.
