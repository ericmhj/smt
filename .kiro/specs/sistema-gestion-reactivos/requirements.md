# Documento de Requerimientos

## Introducción

Sistema de Gestión de Reactivos (SGR) para la administración del ciclo de vida de reactivos aplicados por técnicos de campo. El sistema permite la creación de formularios HTML con control de versiones, asignación a técnicos, aplicación de reactivos, seguimiento mediante tablero Kanban con firma digital, observaciones del manager con archivos adjuntos, y notificaciones en tiempo real. Soporta cuatro roles con permisos diferenciados.

## Glosario

- **SGR**: Sistema de Gestión de Reactivos — la aplicación principal.
- **Superusuario**: Rol con control total sobre perfiles, formularios, asignaciones y reactivos.
- **Administrador**: Rol que gestiona perfiles (excepto superusuario), administra formularios y asigna formularios a técnicos.
- **Manager**: Rol que accede al tablero Kanban, avanza estados de reactivos con firma digital, asigna formularios y envía observaciones con adjuntos.
- **Técnico_de_Campo**: Rol que llena formularios asignados, recibe notificaciones y observaciones, consulta reactivos en PDF y puede re-aplicar formularios tras rechazo.
- **Reactivo**: Registro generado al enviar un formulario completado por un técnico de campo, con un ciclo de vida de estados.
- **Formulario**: Plantilla HTML configurable que el técnico de campo completa para generar un reactivo.
- **Kanban**: Tablero visual que muestra reactivos organizados por estado (Pendiente, En revisión, Validado, Rechazado, Finalizado).
- **Firma_Digital**: Imagen de firma (subida o dibujada) asociada a cada cambio de estado realizado por el manager.
- **Observación**: Mensaje del manager dirigido al técnico con texto obligatorio y archivos adjuntos opcionales.
- **Intento**: Número secuencial que indica cuántas veces se ha aplicado un formulario para un mismo caso (tras rechazos).
- **Versión_Formulario**: Identificador de versión de un formulario HTML, generado automáticamente ante cambios estructurales.
- **Esquema_JSON**: Definición de la estructura esperada de las respuestas de un formulario, almacenada como metadato de cada versión y usada para validar los datos JSONB.

## Requerimientos

### Requerimiento 1: Gestión de Perfiles de Usuario

**User Story:** Como Superusuario o Administrador, quiero gestionar los perfiles de usuario del sistema, para poder controlar quién tiene acceso y con qué rol.

#### Criterios de Aceptación

1. THE SGR SHALL permitir al Superusuario crear, editar, desactivar y eliminar perfiles de cualquier rol (Administrador, Manager, Técnico_de_Campo).
2. THE SGR SHALL permitir al Administrador crear, editar y desactivar perfiles de los roles Manager y Técnico_de_Campo.
3. THE SGR SHALL impedir que el Administrador modifique o elimine perfiles con rol Superusuario.
4. WHEN un perfil es desactivado, THE SGR SHALL revocar el acceso del usuario al sistema de forma inmediata.

---

### Requerimiento 2: Administración de Formularios

**User Story:** Como Superusuario o Administrador, quiero administrar los formularios del sistema, para poder definir qué información recopilan los técnicos de campo.

#### Criterios de Aceptación

1. THE SGR SHALL permitir al Superusuario y al Administrador crear, editar, activar y desactivar formularios.
2. THE SGR SHALL mostrar la lista de formularios con su estado (activo/inactivo) y versión actual.
3. WHEN un formulario es desactivado, THE SGR SHALL impedir nuevas asignaciones de ese formulario a técnicos.
4. THE SGR SHALL permitir al Manager visualizar todos los formularios activos en modo solo lectura.

---

### Requerimiento 3: Creación de Formularios HTML con Control de Versiones y Almacenamiento JSONB

**User Story:** Como Superusuario o Administrador, quiero crear formularios a partir de HTML con control de versiones automático y almacenamiento flexible de respuestas, para poder evolucionar los formularios sin perder datos históricos y sin generar tablas dinámicas.

#### Criterios de Aceptación

1. WHEN el Superusuario o Administrador sube un archivo HTML, THE SGR SHALL parsear el contenido y generar un formulario renderizable.
2. WHEN se detectan cambios estructurales en un formulario existente (campos añadidos, eliminados o renombrados), THE SGR SHALL crear una nueva versión del formulario con su esquema JSON asociado.
3. WHEN se detectan cambios estéticos (estilos, textos de ayuda, orden visual), THE SGR SHALL actualizar el formulario sin crear nueva versión.
4. THE SGR SHALL almacenar las respuestas de los formularios en una columna JSONB validada contra el esquema JSON de la versión del formulario correspondiente, en lugar de crear tablas dinámicas por versión.
5. THE SGR SHALL sanitizar el HTML subido eliminando scripts y contenido potencialmente malicioso.
6. THE SGR SHALL registrar en auditoría cada creación y modificación de formulario con fecha, usuario y tipo de cambio.
7. FOR ALL formularios HTML válidos, parsear y luego renderizar el formulario SHALL producir una estructura equivalente al HTML original (propiedad round-trip).
8. FOR ALL respuestas almacenadas en JSONB, THE SGR SHALL validar que el documento JSON cumple con el esquema definido para la versión del formulario antes de persistirlo (propiedad de conformidad de esquema).

---

### Requerimiento 4: Asignación de Formularios a Técnicos de Campo

**User Story:** Como Superusuario, Administrador o Manager, quiero asignar formularios a técnicos de campo, para que puedan completarlos y generar reactivos.

#### Criterios de Aceptación

1. THE SGR SHALL proporcionar una sección de asignación accesible para Superusuario, Administrador y Manager.
2. WHEN un usuario autorizado selecciona un técnico y un formulario activo, THE SGR SHALL permitir asignar o revocar la asignación.
3. THE SGR SHALL permitir al Manager ver todos los formularios activos y asignar cualquiera de ellos a técnicos.
4. WHEN una asignación es revocada, THE SGR SHALL remover el formulario de la lista "Mis formularios" del técnico.
5. THE SGR SHALL impedir asignar formularios inactivos a técnicos.

---

### Requerimiento 5: Aplicación de Reactivos por el Técnico de Campo

**User Story:** Como Técnico_de_Campo, quiero completar y enviar los formularios que me han asignado, para generar reactivos que serán revisados por el manager.

#### Criterios de Aceptación

1. THE SGR SHALL mostrar al Técnico_de_Campo únicamente los formularios asignados en la sección "Mis formularios".
2. WHEN el Técnico_de_Campo completa y envía un formulario, THE SGR SHALL generar un reactivo con estado inicial "Pendiente" e intento igual a 1.
3. THE SGR SHALL permitir al Técnico_de_Campo consultar sus reactivos generados exclusivamente en formato PDF de solo lectura.
4. THE SGR SHALL incluir en el PDF del reactivo: datos del formulario, respuestas, estado actual, historial de cambios con firmas, motivo de rechazo (si aplica), número de intento y observaciones del manager con sus adjuntos.
5. THE SGR SHALL impedir que el Técnico_de_Campo modifique o reenvíe un reactivo ya generado desde la vista de consulta.

---

### Requerimiento 6: Tablero Kanban para Manager

**User Story:** Como Manager, quiero visualizar y gestionar todos los reactivos en un tablero Kanban, para poder avanzar su estado con firma digital y dar seguimiento al trabajo de los técnicos.

#### Criterios de Aceptación

1. THE SGR SHALL mostrar al Manager todos los reactivos de todos los técnicos y todos los intentos en el tablero Kanban.
2. THE SGR SHALL permitir al Manager mover tarjetas únicamente hacia adelante siguiendo las transiciones válidas: Pendiente a En_revisión, En_revisión a Validado, En_revisión a Rechazado, Validado a Finalizado.
3. THE SGR SHALL impedir mover tarjetas hacia estados anteriores o saltar estados intermedios.
4. WHEN el Manager cambia el estado de un reactivo, THE SGR SHALL exigir la firma digital del Manager antes de confirmar la transición.
5. WHEN el Manager cambia el estado de un reactivo a "Rechazado", THE SGR SHALL exigir un motivo obligatorio de rechazo.
6. THE SGR SHALL mostrar en el detalle del reactivo: respuestas del formulario, técnico asignado, historial de cambios con firmas, cadena de intentos y observaciones.
7. THE SGR SHALL permitir el acceso al tablero Kanban al Manager con permisos completos (mover tarjetas, firmar, agregar observaciones), y al Superusuario y Administrador en modo solo lectura (visualización sin capacidad de modificar estados).
8. THE SGR SHALL impedir que el Superusuario o Administrador muevan tarjetas, firmen cambios de estado o agreguen observaciones desde el Kanban.

---

### Requerimiento 7: Re-aplicación de Formulario tras Rechazo

**User Story:** Como Técnico_de_Campo, quiero poder re-aplicar un formulario cuando mi reactivo ha sido rechazado, para corregir los datos y generar un nuevo intento vinculado al anterior.

#### Criterios de Aceptación

1. WHEN un reactivo pasa al estado "Rechazado", THE SGR SHALL notificar al Técnico_de_Campo incluyendo el motivo de rechazo.
2. WHEN el Técnico_de_Campo re-aplica un formulario rechazado, THE SGR SHALL generar un nuevo reactivo con intento igual al intento anterior más uno, vinculado al reactivo padre.
3. THE SGR SHALL mostrar el número de intento en la tarjeta del Kanban.
4. THE SGR SHALL permitir al Manager ver la cadena completa de intentos en el detalle del reactivo.
5. FOR ALL reactivos re-aplicados, el número de intento SHALL ser estrictamente mayor que el intento del reactivo padre (propiedad de monotonía).

---

### Requerimiento 8: Notificaciones al Técnico de Campo

**User Story:** Como Técnico_de_Campo, quiero recibir notificaciones cuando el estado de mis reactivos cambia, para estar informado del progreso de mis aplicaciones.

#### Criterios de Aceptación

1. WHEN el estado de un reactivo cambia, THE SGR SHALL enviar una notificación al Técnico_de_Campo que lo generó.
2. THE SGR SHALL incluir en la notificación: estado anterior, estado nuevo, responsable del cambio, fecha y motivo (si aplica).
3. THE SGR SHALL proporcionar un panel de notificaciones accesible para el Técnico_de_Campo.
4. THE SGR SHALL enviar notificaciones mediante push y/o email según la configuración del sistema.

---

### Requerimiento 9: Firma Digital del Manager

**User Story:** Como Manager, quiero firmar digitalmente cada cambio de estado de un reactivo, para garantizar la trazabilidad y autenticidad de mis decisiones.

#### Criterios de Aceptación

1. THE SGR SHALL permitir al Manager registrar su firma digital mediante imagen subida o dibujo en pantalla.
2. THE SGR SHALL almacenar la firma digital de forma segura y asociarla al registro de cambio de estado correspondiente.
3. WHEN un cambio de estado se confirma con firma, THE SGR SHALL registrar la firma, el timestamp y el identificador del Manager en el historial del reactivo.
4. THE SGR SHALL impedir confirmar un cambio de estado sin firma digital válida.

---

### Requerimiento 10: Observaciones del Manager al Técnico de Campo

**User Story:** Como Manager, quiero enviar observaciones con archivos adjuntos a los técnicos desde el detalle de un reactivo, para comunicar correcciones o instrucciones específicas.

#### Criterios de Aceptación

1. WHEN el Manager accede al detalle de un reactivo en el Kanban, THE SGR SHALL mostrar un botón "Agregar observación".
2. THE SGR SHALL requerir texto obligatorio en cada observación.
3. THE SGR SHALL permitir adjuntar uno o varios archivos por observación con tamaño máximo de 10 MB por archivo (configurable).
4. THE SGR SHALL aceptar únicamente archivos en formatos: jpg, png, pdf, doc, docx, xls, xlsx.
5. WHEN una observación es guardada, THE SGR SHALL registrarla en el historial del reactivo con fines de auditoría.
6. WHEN una observación es guardada, THE SGR SHALL enviar una notificación al Técnico_de_Campo (dentro del sistema y/o email).
7. THE SGR SHALL permitir al Técnico_de_Campo ver la observación y descargar los archivos adjuntos desde el panel de notificaciones o desde el PDF del reactivo.
8. THE SGR SHALL permitir al Técnico_de_Campo marcar una observación como leída.
9. WHEN existen observaciones no leídas por el Técnico_de_Campo, THE SGR SHALL mostrar un indicador visual en la tarjeta del Kanban correspondiente.
10. IF un archivo adjunto excede el tamaño máximo permitido, THEN THE SGR SHALL rechazar el archivo y mostrar un mensaje de error indicando el límite.
11. IF un archivo adjunto tiene un formato no permitido, THEN THE SGR SHALL rechazar el archivo y mostrar un mensaje indicando los formatos aceptados.

---

### Requerimiento 11: Autenticación y Control de Acceso

**User Story:** Como usuario del sistema, quiero autenticarme de forma segura y acceder únicamente a las funcionalidades correspondientes a mi rol, para garantizar la seguridad de la información.

#### Criterios de Aceptación

1. THE SGR SHALL requerir autenticación mediante credenciales (usuario y contraseña) antes de permitir acceso a cualquier funcionalidad.
2. WHEN un usuario se autentica exitosamente, THE SGR SHALL otorgar acceso únicamente a las funcionalidades definidas para su rol según la matriz de accesos.
3. IF un usuario intenta acceder a una funcionalidad no autorizada para su rol, THEN THE SGR SHALL denegar el acceso y registrar el intento en el log de auditoría.
4. THE SGR SHALL aplicar la siguiente matriz de accesos:
   - Superusuario: gestión total de perfiles, formularios, asignaciones, visualización de Kanban (solo lectura) y envío de observaciones.
   - Administrador: gestión parcial de perfiles, administración de formularios, asignaciones, visualización de Kanban (solo lectura) y envío de observaciones.
   - Manager: visualización de formularios, asignaciones, Kanban con permisos completos (firma digital, mover tarjetas, observaciones).
   - Técnico_de_Campo: llenado de formularios asignados, consulta de reactivos en PDF, recepción de notificaciones y observaciones, re-aplicación tras rechazo.
5. WHEN la sesión de un usuario expira o es invalidada, THE SGR SHALL redirigir al usuario a la pantalla de autenticación.
6. FOR ALL combinaciones de rol y funcionalidad, el control de acceso SHALL ser consistente entre la interfaz de usuario y la capa de API (propiedad de consistencia de autorización).
