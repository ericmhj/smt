# Requirements Document

## Introduction

Este documento define los requisitos para el módulo "Ensayo Técnico" del SGR. El módulo permite al técnico llenar y enviar el formulario de ensayo desde el Kanban cuando el reactivo se encuentra en estado "Programado" (pendiente). Al enviar exitosamente, el estado transiciona a "En Evaluación" (en_revision), se genera el PDF correspondiente y se sincroniza el estado del ticket asociado. Para estados posteriores, el técnico solo visualiza el PDF. En caso de rechazo, puede ver el motivo y opcionalmente re-enviar una nueva versión del ensayo.

## Glossary

- **SGR**: Sistema de Gestión de Ensayos (la aplicación completa)
- **Técnico**: Usuario con rol "tecnico" que ejecuta los ensayos
- **Reactivo**: Registro de un ensayo asignado a un técnico, contiene las respuestas del formulario
- **Kanban_Tecnico**: Tablero Kanban del técnico ubicado en /my-kanban que muestra sus reactivos agrupados por estado
- **Formulario_Ensayo**: Plantilla HTML asociada a un reactivo vía formVersionId que contiene los campos a llenar
- **JSON_Schema**: Esquema de validación almacenado en form_versions.json_schema que define las reglas de los campos
- **Respuestas**: Objeto JSONB almacenado en reactivos.responses con los valores ingresados por el técnico
- **PDF_Ensayo**: Documento PDF generado a partir del formulario llenado, accesible vía /api/reactivos/:id/pdf
- **Ticket**: Registro asociado al reactivo cuyo estado se sincroniza con el estado del reactivo
- **Estado_Pendiente**: Estado "pendiente" del reactivo, mostrado como "Programado" en el Kanban
- **Estado_En_Revision**: Estado "en_revision" del reactivo, mostrado como "En Evaluación" en el Kanban
- **Estado_Rechazado**: Estado "rechazado" del reactivo, indica que el manager rechazó el ensayo
- **Motivo_Rechazo**: Texto almacenado en reactivos.rejectionReason explicando por qué se rechazó
- **Intento**: Cada envío del formulario constituye un intento; re-envíos crean un nuevo reactivo con parentReactivoId y attemptNumber incrementado
- **Submit_Endpoint**: Endpoint POST /api/reactivos/:id/submit que procesa el envío del formulario

## Requirements

### Requirement 1: Apertura del formulario editable desde el Kanban

**User Story:** Como técnico, quiero abrir el formulario de ensayo editable al hacer clic en una tarjeta en estado "Programado", para poder llenar los campos del ensayo.

#### Acceptance Criteria

1. WHEN el técnico hace clic en una tarjeta del Kanban_Tecnico cuyo estado es Estado_Pendiente, THE Kanban_Tecnico SHALL obtener el contenido HTML del Formulario_Ensayo asociado al reactivo vía formVersionId y mostrarlo en un modal editable
2. WHEN el Formulario_Ensayo se muestra en modo editable, THE Kanban_Tecnico SHALL renderizar todos los campos definidos en el HTML como campos de entrada interactivos
3. WHEN el Formulario_Ensayo se abre para un reactivo con Respuestas existentes no vacías, THE Kanban_Tecnico SHALL pre-llenar los campos con los valores almacenados en Respuestas

### Requirement 2: Apertura del PDF para estados no editables

**User Story:** Como técnico, quiero ver el PDF del ensayo al hacer clic en tarjetas que no están en estado "Programado", para poder revisar ensayos ya enviados.

#### Acceptance Criteria

1. WHEN el técnico hace clic en una tarjeta del Kanban_Tecnico cuyo estado es Estado_En_Revision, validado o finalizado, THE Kanban_Tecnico SHALL abrir el visor de PDF_Ensayo existente con el documento del reactivo correspondiente
2. WHILE el visor de PDF_Ensayo está abierto, THE Kanban_Tecnico SHALL mantener el formulario en modo solo lectura sin posibilidad de edición

### Requirement 3: Validación del formulario antes del envío

**User Story:** Como técnico, quiero que el sistema valide mis respuestas antes de enviar, para asegurarme de que el ensayo cumple con los requisitos del formulario.

#### Acceptance Criteria

1. WHEN el técnico presiona el botón "Enviar" en el Formulario_Ensayo, THE SGR SHALL validar las Respuestas contra el JSON_Schema asociado al formVersionId del reactivo
2. IF la validación contra el JSON_Schema falla, THEN THE SGR SHALL mostrar mensajes de error específicos indicando los campos que no cumplen con las reglas de validación
3. IF la validación contra el JSON_Schema falla, THEN THE SGR SHALL mantener el Formulario_Ensayo abierto con los datos ingresados preservados para corrección

### Requirement 4: Envío del formulario y transición de estado

**User Story:** Como técnico, quiero enviar el formulario completado para que mi ensayo sea evaluado por el manager.

#### Acceptance Criteria

1. WHEN las Respuestas pasan la validación del JSON_Schema, THE Submit_Endpoint SHALL almacenar las Respuestas en el campo responses del reactivo
2. WHEN las Respuestas se almacenan exitosamente, THE Submit_Endpoint SHALL transicionar el estado del reactivo de Estado_Pendiente a Estado_En_Revision
3. WHEN el estado del reactivo transiciona a Estado_En_Revision, THE Submit_Endpoint SHALL sincronizar el estado del Ticket asociado a Estado_En_Revision
4. WHEN el envío se completa exitosamente, THE Submit_Endpoint SHALL generar el PDF_Ensayo a partir del formulario llenado
5. WHEN el envío se completa exitosamente, THE Kanban_Tecnico SHALL mover la tarjeta del reactivo de la columna "Programado" a la columna "En Evaluación"
6. WHEN el envío se completa exitosamente, THE Kanban_Tecnico SHALL mostrar una notificación de éxito al técnico

### Requirement 5: Control de acceso al envío

**User Story:** Como administrador del sistema, quiero que solo el técnico asignado pueda enviar el formulario, para mantener la integridad de los ensayos.

#### Acceptance Criteria

1. THE Submit_Endpoint SHALL verificar que el usuario autenticado tiene el rol "tecnico"
2. THE Submit_Endpoint SHALL verificar que el tecnicoId del reactivo coincide con el ID del usuario autenticado
3. IF el usuario no tiene rol "tecnico" o no es el técnico asignado al reactivo, THEN THE Submit_Endpoint SHALL rechazar la solicitud con código HTTP 403
4. IF el reactivo no se encuentra en Estado_Pendiente, THEN THE Submit_Endpoint SHALL rechazar el envío con un mensaje indicando que el ensayo no es editable en su estado actual

### Requirement 6: Visualización del motivo de rechazo

**User Story:** Como técnico, quiero ver el motivo de rechazo cuando mi ensayo fue rechazado, para entender qué debo corregir.

#### Acceptance Criteria

1. WHEN el técnico hace clic en una tarjeta del Kanban_Tecnico cuyo estado es Estado_Rechazado, THE Kanban_Tecnico SHALL mostrar el Motivo_Rechazo almacenado en el reactivo de forma visible y clara
2. WHEN el técnico visualiza un reactivo rechazado, THE Kanban_Tecnico SHALL mostrar un botón "Re-enviar ensayo" que permita iniciar un nuevo intento

### Requirement 7: Re-envío de ensayo rechazado

**User Story:** Como técnico, quiero poder re-enviar un ensayo que fue rechazado con correcciones, para completar el ensayo satisfactoriamente.

#### Acceptance Criteria

1. WHEN el técnico presiona "Re-enviar ensayo" en un reactivo con Estado_Rechazado, THE SGR SHALL crear un nuevo reactivo con parentReactivoId referenciando al reactivo rechazado y attemptNumber incrementado en uno
2. WHEN se crea el nuevo reactivo por re-envío, THE SGR SHALL asignar Estado_Pendiente al nuevo reactivo y copiar formId, formVersionId, tecnicoId y clienteNombre del reactivo original
3. WHEN se crea el nuevo reactivo por re-envío, THE SGR SHALL abrir el Formulario_Ensayo en modo editable pre-llenado con las Respuestas del reactivo rechazado para permitir correcciones
4. WHEN el técnico envía el formulario del nuevo intento, THE Submit_Endpoint SHALL procesar el envío siguiendo las mismas reglas de validación y transición de estado que un envío normal

### Requirement 8: Endpoint de envío del formulario (Backend)

**User Story:** Como desarrollador, quiero un endpoint dedicado para el envío de formularios de ensayo, para separar la lógica de submit de las demás operaciones.

#### Acceptance Criteria

1. THE Submit_Endpoint SHALL aceptar solicitudes POST en la ruta /api/reactivos/:id/submit con un cuerpo JSON conteniendo las Respuestas
2. THE Submit_Endpoint SHALL retornar el reactivo actualizado con estado Estado_En_Revision y las Respuestas almacenadas al completar exitosamente
3. IF el reactivo referenciado por :id no existe, THEN THE Submit_Endpoint SHALL retornar código HTTP 404 con mensaje descriptivo
4. IF ocurre un error interno durante el procesamiento, THEN THE Submit_Endpoint SHALL retornar código HTTP 500 sin exponer detalles internos del sistema
5. THE Submit_Endpoint SHALL registrar la transición de estado en la tabla state_transitions con fromState "pendiente", toState "en_revision" y el actorId del técnico
