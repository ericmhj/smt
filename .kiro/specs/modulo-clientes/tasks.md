# Plan de Implementación: Módulo de Clientes

## Visión General

Implementación incremental del Módulo de Clientes dentro del SGR existente. Se agregan 6 tablas nuevas a PostgreSQL, módulos backend en Fastify/TypeScript, workers BullMQ, y páginas frontend en Next.js. Cada tarea construye sobre las anteriores, integrándose con la infraestructura ya existente (auth, audit, notifications, S3, Redis).

## Tareas

- [x] 1. Esquema de base de datos y rol asistente
  - [x] 1.1 Crear migración SQL con las 6 tablas nuevas
    - Crear archivo `packages/backend/src/db/migrations/0003_modulo_clientes.sql`
    - Definir tablas: `clientes`, `cliente_contactos`, `cliente_documentos`, `tickets`, `sla_config`, `reglas_asignacion`
    - Agregar columna generada `search_vector` tsvector en `clientes`
    - Crear índices: GIN sobre `search_vector`, GIN sobre `etiquetas`, índices B-tree en FKs y campos de filtro
    - Insertar datos seed de SLA por defecto (alta: 24h, media: 48h, baja: 72h)
    - _Requerimientos: 4.6, 9.2, 10.3, 10.7_

  - [x] 1.2 Crear esquemas Drizzle ORM para las tablas nuevas
    - Crear `packages/backend/src/db/schema/clientes.ts` con tablas `clientes`, `clienteContactos`, `clienteDocumentos`
    - Crear `packages/backend/src/db/schema/tickets.ts` con tablas `tickets`, `slaConfig`, `reglasAsignacion`
    - Exportar las nuevas tablas desde `packages/backend/src/db/schema/index.ts`
    - _Requerimientos: 3.1, 9.1, 10.2, 6.1_

  - [x] 1.3 Agregar rol 'asistente' al sistema
    - Crear migración `packages/backend/src/db/migrations/0004_add_asistente_role.sql` para agregar 'asistente' al conjunto de roles válidos
    - Actualizar el enum/tipo de roles en `packages/backend/src/db/schema/enums.ts` si aplica
    - Verificar que el middleware de autenticación existente reconoce el nuevo rol
    - _Requerimientos: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. RBAC Guard y permisos del módulo
  - [x] 2.1 Implementar guard de permisos del módulo de clientes
    - Crear `packages/backend/src/modules/clientes/rbac.guard.ts`
    - Definir tipo `ClientePermission` con todos los permisos del módulo
    - Implementar `PERMISSION_MATRIX` para roles `manager` y `asistente`
    - Implementar función `hasPermission(role, permission)` y hook `requirePermission`
    - Registrar intentos de acceso no autorizado en auditoría
    - _Requerimientos: 2.1, 2.3, 11.1, 11.2, 11.3, 11.5_

  - [ ]* 2.2 Tests de propiedad para RBAC (Propiedades 1 y 2)
    - **Propiedad 1: Control de Acceso al Módulo** — Para cualquier rol, acceso permitido si y solo si es `manager` o `asistente`
    - **Propiedad 2: Permisos Exclusivos del Manager** — Endpoints de configuración solo accesibles por `manager`
    - Crear `packages/backend/src/modules/clientes/__tests__/properties/rbac.property.test.ts`
    - Usar fast-check con mínimo 100 iteraciones
    - **Valida: Requerimientos 1.2, 1.5, 2.1, 2.3, 6.1, 6.6, 10.2, 10.6, 11.2, 11.3**

- [x] 3. Módulo de Clientes — Servicio y validación
  - [x] 3.1 Implementar esquemas de validación Zod para clientes
    - Crear `packages/backend/src/modules/clientes/cliente.schemas.ts`
    - Definir `createClienteSchema`, `updateClienteSchema` con validaciones de email RFC 5322 y teléfono 7-15 dígitos
    - Definir schemas para contactos: `createContactoSchema`, `updateContactoSchema`
    - Definir schemas de query params para listado y filtros
    - _Requerimientos: 4.1, 4.2, 4.3_

  - [x] 3.2 Implementar ClienteService con CRUD y etiquetas
    - Crear `packages/backend/src/modules/clientes/cliente.service.ts`
    - Implementar métodos: `create`, `update`, `getById`, `list`, `addTag`, `removeTag`, `deactivate`
    - Normalizar etiquetas (trim + toLowerCase) antes de almacenar
    - Verificar unicidad de email y teléfono antes de crear/actualizar
    - Integrar con servicio de auditoría existente para todas las mutaciones
    - _Requerimientos: 3.1, 3.3, 3.4, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 12.1_

  - [x] 3.3 Implementar gestión de contactos de cliente
    - Agregar métodos de contactos en `ClienteService` o servicio separado
    - Implementar CRUD de contactos vinculados a un cliente
    - Manejar flag `es_principal` (solo un contacto principal por cliente)
    - _Requerimientos: 3.1_

  - [ ]* 3.4 Tests de propiedad para validación de datos (Propiedades 3, 4, 5)
    - **Propiedad 3: Validación de Datos de Cliente** — Aceptar si y solo si campos obligatorios presentes con formato correcto
    - **Propiedad 4: Unicidad de Email y Teléfono** — Emails y teléfonos distintos entre clientes
    - **Propiedad 5: Normalización de Etiquetas** — Valor almacenado = trim + toLowerCase de entrada
    - Crear `packages/backend/src/modules/clientes/__tests__/properties/validation.property.test.ts`
    - Crear `packages/backend/src/modules/clientes/__tests__/properties/tags.property.test.ts`
    - **Valida: Requerimientos 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.3**

  - [ ]* 3.5 Tests unitarios para ClienteService
    - Crear `packages/backend/src/modules/clientes/__tests__/unit/cliente.service.test.ts`
    - Testear creación exitosa, edición parcial, desactivación
    - Testear rechazo por email/teléfono duplicado
    - Testear normalización de etiquetas
    - _Requerimientos: 3.3, 4.4, 4.5, 5.3_

- [x] 4. Checkpoint — Verificar esquema y servicio de clientes
  - Asegurarse que todas las pruebas pasan, preguntar al usuario si surgen dudas.

- [x] 5. Módulo de Documentos
  - [x] 5.1 Implementar DocumentoService con validación y S3
    - Crear `packages/backend/src/modules/clientes/documento.service.ts`
    - Implementar validación de tamaño (≤10 MB) y tipos MIME permitidos
    - Implementar upload a Garage S3 reutilizando el cliente existente (`packages/backend/src/lib/minio.ts`)
    - Implementar listado de documentos por cliente y generación de URL pre-firmada para descarga
    - Implementar eliminación de documento (S3 + DB)
    - Integrar con auditoría para upload y delete
    - _Requerimientos: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 12.3_

  - [ ]* 5.2 Tests de propiedad para validación de archivos (Propiedad 8)
    - **Propiedad 8: Validación de Archivos Adjuntos** — Aceptar si y solo si tamaño ≤ 10MB y MIME en conjunto permitido
    - Crear `packages/backend/src/modules/clientes/__tests__/properties/files.property.test.ts`
    - **Valida: Requerimientos 7.2, 7.3, 7.7, 7.8**

- [x] 6. Búsqueda Full-Text y filtros
  - [x] 6.1 Implementar BusquedaService con tsvector y cache Redis
    - Crear `packages/backend/src/modules/clientes/busqueda.service.ts`
    - Implementar búsqueda full-text usando `plainto_tsquery('spanish', query)` con fallback ILIKE para coincidencias parciales
    - Implementar filtros combinados (industria, etiquetas, fecha, asignado_a) con operador AND
    - Agregar cache Redis con TTL de 5 minutos para resultados de búsqueda
    - Implementar invalidación de cache al modificar un cliente
    - _Requerimientos: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 6.2 Tests de propiedad para búsqueda y filtros (Propiedades 6, 9, 10)
    - **Propiedad 6: Filtrado por Etiquetas (Intersección)** — Todos los resultados poseen TODAS las etiquetas del filtro
    - **Propiedad 9: Búsqueda Full-Text Retorna Coincidencias** — Subcadena de campo buscable incluye al cliente en resultados
    - **Propiedad 10: Filtros Combinados (Intersección)** — Todos los resultados cumplen TODAS las condiciones activas
    - Crear `packages/backend/src/modules/clientes/__tests__/properties/search.property.test.ts`
    - **Valida: Requerimientos 5.5, 8.1, 8.3, 8.4**

- [x] 7. Rutas HTTP del módulo de Clientes
  - [x] 7.1 Implementar rutas de clientes
    - Crear `packages/backend/src/modules/clientes/cliente.routes.ts`
    - Endpoints: POST /api/clientes, GET /api/clientes, GET /api/clientes/:id, PUT /api/clientes/:id, POST /api/clientes/:id/tags, DELETE /api/clientes/:id/tags/:tag, DELETE /api/clientes/:id (soft delete)
    - Endpoint de búsqueda: GET /api/clientes/search?q=...&industria=...&etiquetas=...
    - Aplicar `requirePermission` en cada ruta según la matriz de permisos
    - Crear `packages/backend/src/modules/clientes/index.ts` para exportar el módulo
    - _Requerimientos: 2.1, 3.1, 3.4, 5.1, 5.2, 8.1, 8.2_

  - [x] 7.2 Implementar rutas de documentos de cliente
    - Crear `packages/backend/src/modules/clientes/documento.routes.ts`
    - Endpoints: POST /api/clientes/:id/documentos (multipart upload), GET /api/clientes/:id/documentos, GET /api/clientes/:id/documentos/:docId/download, DELETE /api/clientes/:id/documentos/:docId
    - Aplicar `requirePermission('clientes:documents')` en cada ruta
    - _Requerimientos: 7.1, 7.5, 7.6, 7.9_

  - [x] 7.3 Implementar rutas de contactos de cliente
    - Agregar endpoints: POST /api/clientes/:id/contactos, GET /api/clientes/:id/contactos, PUT /api/clientes/:id/contactos/:contactoId, DELETE /api/clientes/:id/contactos/:contactoId
    - _Requerimientos: 3.1_

  - [x] 7.4 Registrar módulo de clientes en app.ts
    - Importar y registrar `clienteRoutes` en `packages/backend/src/app.ts`
    - Pasar dependencias (db, s3 client, redis)
    - _Requerimientos: 2.1_

- [x] 8. Módulo de Tickets — Servicio core
  - [x] 8.1 Implementar esquemas de validación Zod para tickets
    - Crear `packages/backend/src/modules/tickets/ticket.schemas.ts`
    - Definir `createTicketSchema`, `ticketTransitionSchema`, `ticketFiltersSchema`
    - Definir `createReglaAsignacionSchema`, `updateSLAConfigSchema`
    - _Requerimientos: 9.1, 10.1_

  - [x] 8.2 Implementar TicketService con máquina de estados
    - Crear `packages/backend/src/modules/tickets/ticket.service.ts`
    - Implementar `create`: estado inicial 'abierto', calcular `sla_horas` y `fecha_limite` según config SLA
    - Implementar `transition`: validar transiciones permitidas según `TICKET_VALID_TRANSITIONS`
    - Implementar `reassignTecnico`: solo permitido en estado 'abierto'
    - Implementar `linkReactivo`: vincular reactivo cuando el técnico genera uno
    - Implementar `list` con filtros y paginación
    - Integrar con auditoría para crear y transicionar
    - _Requerimientos: 9.1, 9.2, 9.3, 9.5, 9.6, 9.7, 9.8, 9.9, 12.2_

  - [x] 8.3 Implementar SLAService
    - Crear `packages/backend/src/modules/tickets/sla.service.ts`
    - Implementar `getConfig`, `updateConfig` (solo manager)
    - Implementar `calculateDeadline(prioridad, fechaCreacion)` que retorna fecha_limite
    - Implementar `checkOverdue` para detectar tickets vencidos
    - Implementar `isApproachingDeadline` (≥80% del tiempo SLA consumido)
    - _Requerimientos: 10.1, 10.2, 10.3, 10.4, 10.5, 10.7_

  - [x] 8.4 Implementar AsignacionService
    - Crear `packages/backend/src/modules/tickets/asignacion.service.ts`
    - Implementar `executeRules`: evaluar reglas activas en orden
    - Regla tipo 'ubicacion': matchear dirección del cliente con patrones configurados
    - Regla tipo 'carga': asignar al técnico con menos tickets abiertos, null si hay empate
    - Implementar CRUD de reglas (solo manager)
    - _Requerimientos: 6.2, 6.3, 6.4, 6.5, 6.7_

  - [ ]* 8.5 Tests de propiedad para tickets (Propiedades 7, 11, 12, 13, 14)
    - **Propiedad 7: Asignación por Carga de Trabajo** — Asigna al técnico con menor cantidad de tickets abiertos; null si empate
    - **Propiedad 11: Estado Inicial del Ticket** — Estado 'abierto', sla_horas según prioridad, fecha_limite = created_at + sla_horas
    - **Propiedad 12: Máquina de Estados (Monotonía)** — Transición aceptada si y solo si está en el conjunto válido
    - **Propiedad 13: Reasignación Solo en Estado Abierto** — Reasignación aceptada si y solo si estado = 'abierto'
    - **Propiedad 14: Indicador de Ticket Vencido** — vencido = true si hora_actual > fecha_limite y estado ∉ {completado, cerrado}
    - Crear `packages/backend/src/modules/tickets/__tests__/properties/ticket-state.property.test.ts`
    - **Valida: Requerimientos 6.3, 6.4, 6.7, 9.2, 9.3, 9.8, 9.9, 10.5, 10.7**

  - [ ]* 8.6 Tests unitarios para TicketService y AsignacionService
    - Crear `packages/backend/src/modules/tickets/__tests__/unit/ticket.service.test.ts`
    - Testear creación con SLA calculado correctamente
    - Testear transiciones válidas e inválidas
    - Testear reasignación rechazada en estado != 'abierto'
    - Testear asignación automática por regla de ubicación y carga
    - _Requerimientos: 9.2, 9.3, 9.8, 6.3, 6.4_

- [x] 9. Checkpoint — Verificar servicios de tickets y SLA
  - Asegurarse que todas las pruebas pasan, preguntar al usuario si surgen dudas.

- [x] 10. Rutas HTTP del módulo de Tickets
  - [x] 10.1 Implementar rutas de tickets
    - Crear `packages/backend/src/modules/tickets/ticket.routes.ts`
    - Endpoints: POST /api/tickets, GET /api/tickets, GET /api/tickets/:id, PATCH /api/tickets/:id/estado, PATCH /api/tickets/:id/tecnico, PATCH /api/tickets/:id/reactivo
    - Aplicar `requirePermission` según operación
    - _Requerimientos: 9.1, 9.3, 9.5, 9.6, 9.8_

  - [x] 10.2 Implementar rutas de configuración SLA
    - Agregar endpoints: GET /api/config/sla, PUT /api/config/sla/:prioridad
    - Proteger con `requirePermission('config:sla')` (solo manager)
    - _Requerimientos: 10.2, 10.3, 10.6_

  - [x] 10.3 Implementar rutas de reglas de asignación
    - Agregar endpoints: GET /api/config/reglas-asignacion, POST /api/config/reglas-asignacion, PUT /api/config/reglas-asignacion/:id, DELETE /api/config/reglas-asignacion/:id
    - Proteger con `requirePermission('config:assignment_rules')` (solo manager)
    - _Requerimientos: 6.1, 6.6_

  - [x] 10.4 Registrar módulo de tickets en app.ts
    - Importar y registrar `ticketRoutes` en `packages/backend/src/app.ts`
    - Crear `packages/backend/src/modules/tickets/index.ts` para exportar el módulo
    - _Requerimientos: 9.1_

- [x] 11. Workers BullMQ (SLA y asignación automática)
  - [x] 11.1 Implementar colas y workers de tickets
    - Crear `packages/backend/src/modules/tickets/queues.ts`
    - Definir cola `tickets-sla-check` con job repetible cada 15 minutos
    - Definir cola `tickets-assignment` para ejecución de reglas de asignación
    - _Requerimientos: 10.4, 6.4_

  - [x] 11.2 Implementar SLA check worker
    - Crear `packages/backend/src/modules/tickets/sla.worker.ts`
    - Consultar tickets no completados/cerrados con fecha_limite próxima (≥80%) o vencida
    - Enviar notificación al manager y asistente creador del ticket usando el módulo de notificaciones existente
    - _Requerimientos: 10.4, 10.5_

  - [x] 11.3 Implementar assignment worker
    - Crear `packages/backend/src/modules/tickets/assignment.worker.ts`
    - Al recibir job, ejecutar `AsignacionService.executeRules`
    - Si se encuentra técnico, actualizar ticket; si no, notificar al manager
    - _Requerimientos: 6.4, 6.5, 6.7_

  - [x] 11.4 Integrar creación de ticket con cola de asignación
    - En `TicketService.create`, si `tecnicoAsignadoId` no fue proporcionado, encolar job en `tickets-assignment`
    - _Requerimientos: 6.4_

- [x] 12. Integración con flujo de ensayos/reactivos existente
  - [x] 12.1 Implementar vinculación automática ticket-reactivo
    - Detectar cuando un reactivo vinculado a un ticket pasa a estado "finalizado"
    - Opciones: hook en el módulo de reactivos existente o listener en la transición de estado
    - Al detectar finalización, llamar `TicketService.transition(ticketId, 'completado')`
    - Vincular `reactivo_id` en el ticket
    - _Requerimientos: 9.4, 9.5_

- [x] 13. Checkpoint — Verificar backend completo
  - Asegurarse que todas las pruebas pasan, preguntar al usuario si surgen dudas.

- [x] 14. Frontend — Páginas de Clientes
  - [x] 14.1 Implementar página de listado de clientes
    - Crear `packages/frontend/src/app/(dashboard)/clientes/page.tsx`
    - Tabla con columnas: nombre, empresa, email, teléfono, industria, etiquetas, estado
    - Barra de búsqueda full-text y filtros combinados (industria, etiquetas, fecha, asignado)
    - Paginación
    - Ocultar la ruta `/clientes` para roles sin acceso en la navegación
    - _Requerimientos: 3.1, 8.1, 8.2, 8.3, 8.4, 2.2_

  - [x] 14.2 Implementar formulario de creación/edición de cliente
    - Crear `packages/frontend/src/app/(dashboard)/clientes/nuevo/page.tsx`
    - Crear `packages/frontend/src/app/(dashboard)/clientes/[id]/editar/page.tsx`
    - Formulario responsive (desktop >1024px, mobile <768px) con validación cliente-side (Zod)
    - Campos: nombre, empresa, email, teléfono, dirección, industria
    - Feedback inline de errores de validación y conflictos de unicidad
    - _Requerimientos: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 14.3 Implementar página de detalle de cliente
    - Crear `packages/frontend/src/app/(dashboard)/clientes/[id]/page.tsx`
    - Mostrar datos del cliente, contactos, documentos adjuntos y tickets asociados
    - Gestión de etiquetas (agregar/eliminar) con input de autocompletado
    - Sección de documentos con upload, lista y descarga
    - _Requerimientos: 5.1, 5.2, 7.1, 7.5, 7.6_

  - [x] 14.4 Implementar componente de gestión de documentos
    - Componente de upload con drag-and-drop y validación de tamaño/tipo en frontend
    - Lista de documentos con nombre, tamaño, fecha y botón de descarga
    - Feedback de error para archivos rechazados (tamaño o formato)
    - _Requerimientos: 7.1, 7.2, 7.3, 7.5, 7.6, 7.7, 7.8_

- [x] 15. Frontend — Páginas de Tickets
  - [x] 15.1 Implementar página de listado de tickets
    - Crear `packages/frontend/src/app/(dashboard)/tickets/page.tsx`
    - Tabla con: cliente, formulario (norma), técnico, prioridad, estado, fecha límite, indicador vencido
    - Filtros: estado, prioridad, cliente, técnico, vencido
    - Indicador visual para tickets vencidos (color rojo) y próximos a vencer (color amarillo)
    - _Requerimientos: 9.6, 10.5_

  - [x] 15.2 Implementar formulario de creación de ticket
    - Crear `packages/frontend/src/app/(dashboard)/tickets/nuevo/page.tsx`
    - Selección de cliente (search/dropdown), formulario activo, técnico, prioridad
    - Mostrar SLA calculado (horas y fecha límite estimada) antes de confirmar
    - _Requerimientos: 9.1, 10.1_

  - [x] 15.3 Implementar página de detalle de ticket
    - Crear `packages/frontend/src/app/(dashboard)/tickets/[id]/page.tsx`
    - Mostrar información del ticket, cliente, técnico, reactivo vinculado (si existe)
    - Botones de transición de estado según estado actual y rol del usuario
    - Permitir reasignación de técnico solo si estado = 'abierto'
    - Timeline de cambios de estado
    - _Requerimientos: 9.3, 9.5, 9.8_

- [x] 16. Frontend — Páginas de Configuración (Solo Manager)
  - [x] 16.1 Implementar página de configuración SLA
    - Crear `packages/frontend/src/app/(dashboard)/configuracion/sla/page.tsx`
    - Tabla editable con prioridad y horas límite
    - Solo visible y accesible para rol `manager`
    - _Requerimientos: 10.2, 10.3, 10.6_

  - [x] 16.2 Implementar página de reglas de asignación
    - Crear `packages/frontend/src/app/(dashboard)/configuracion/asignacion/page.tsx`
    - CRUD de reglas con formulario para tipo ubicación (regiones + patrón + técnico) y tipo carga (pool de técnicos)
    - Solo visible y accesible para rol `manager`
    - _Requerimientos: 6.1, 6.2, 6.3, 6.6_

- [x] 17. Frontend — Protección de rutas y navegación
  - [x] 17.1 Actualizar navegación y middleware de rutas
    - Agregar items de menú "Clientes" y "Tickets" visibles solo para `manager` y `asistente`
    - Agregar items "Configuración SLA" y "Reglas de Asignación" visibles solo para `manager`
    - Proteger rutas del frontend: redirigir a dashboard si el rol no tiene acceso
    - Impedir que `asistente` vea el tablero Kanban existente
    - _Requerimientos: 1.2, 1.3, 1.5, 2.2, 2.4, 11.5_

- [x] 18. Auditoría (Propiedad 15)
  - [x] 18.1 Verificar integración completa con auditoría
    - Confirmar que todas las mutaciones de clientes, tickets y documentos registran en `audit_logs`
    - Confirmar que intentos de acceso no autorizado se registran
    - Reutilizar `packages/backend/src/modules/audit/audit.service.ts` existente
    - _Requerimientos: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 18.2 Tests de propiedad para auditoría (Propiedad 15)
    - **Propiedad 15: Invariante de Auditoría** — Toda mutación genera registro con actor_id, acción, entity_type, entity_id, ip_address
    - Crear test en `packages/backend/src/modules/clientes/__tests__/properties/audit.property.test.ts`
    - **Valida: Requerimientos 12.1, 12.2, 12.3, 12.4**

- [x] 19. Tests de integración end-to-end
  - [ ]* 19.1 Tests de integración para flujos completos
    - Crear `packages/backend/src/modules/clientes/__tests__/integration/cliente.routes.test.ts`
    - Crear `packages/backend/src/modules/tickets/__tests__/integration/ticket.routes.test.ts`
    - Crear `packages/backend/src/modules/tickets/__tests__/integration/sla.worker.test.ts`
    - Flujo: crear cliente → crear ticket → asignación automática → técnico genera reactivo → ticket completado → cerrado
    - Verificar búsqueda full-text con acentos y caracteres especiales
    - Verificar alertas SLA generadas correctamente
    - _Requerimientos: 9.4, 10.4, 8.1_

- [x] 20. Checkpoint final — Verificar integración completa
  - Asegurarse que todas las pruebas pasan, preguntar al usuario si surgen dudas.

## Notas

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia requerimientos específicos para trazabilidad
- Los checkpoints aseguran validación incremental
- Los tests de propiedad validan las 15 propiedades de correctitud definidas en el diseño
- Los tests unitarios validan casos específicos y condiciones de borde
- El módulo se integra con la infraestructura existente del SGR sin modificar módulos previos (excepto app.ts para registro y posible hook en reactivos para vinculación automática)
