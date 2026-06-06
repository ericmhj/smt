# Documento de Requerimientos

## Introducción

Módulo de Clientes para el Sistema de Gestión de Reactivos (SGR). Este módulo extiende el sistema existente con capacidades de gestión de clientes y tickets (solicitudes de ensayo). El módulo es exclusivamente accesible para los roles Manager y Asistente (nuevo rol). Ningún otro rol del sistema (superusuario, admin, técnico, técnico_de_campo) puede ver ni interactuar con datos de clientes. Los tickets representan solicitudes de ensayo que vinculan un cliente con un formulario (norma) y un técnico asignado.

## Glosario

- **SGR**: Sistema de Gestión de Reactivos — la aplicación principal existente.
- **Módulo_Clientes**: Subsistema del SGR dedicado a la gestión de clientes y tickets de ensayo.
- **Manager**: Rol existente del SGR que tiene permisos completos en el Módulo_Clientes, incluyendo configuración de reglas de asignación y definición de SLAs.
- **Asistente**: Nuevo rol del SGR con permisos operativos en el Módulo_Clientes (crear/editar clientes, gestionar etiquetas, crear tickets, asignar técnicos), pero sin acceso al Kanban ni capacidad de configurar reglas de asignación o SLAs.
- **Cliente**: Persona o empresa registrada en el sistema que solicita ensayos. Tiene nombre, empresa, email, teléfono, dirección e industria.
- **Ticket**: Solicitud de ensayo vinculada a un cliente. Representa el pedido de un ensayo específico y tiene un ciclo de vida de estados. Sinónimo de "solicitud de ensayo".
- **Solicitud_de_Ensayo**: Sinónimo de Ticket.
- **Etiqueta**: Clasificación libre aplicable a un cliente (industria, tamaño, prioridad, interés) que permite segmentación y filtrado.
- **Regla_de_Asignación**: Configuración que determina cómo se asignan automáticamente los clientes a vendedores o técnicos basándose en ubicación o carga de trabajo.
- **SLA**: Acuerdo de nivel de servicio que define el tiempo máximo de resolución por nivel de prioridad de un ticket.
- **Prioridad**: Nivel de urgencia de un ticket: alta, media o baja.
- **Garage_S3**: Servicio de almacenamiento de objetos compatible con S3 utilizado por el SGR para archivos.
- **Formulario**: Plantilla de ensayo (norma) existente en el SGR que se vincula al ticket.
- **Técnico**: Usuario con rol técnico o técnico_de_campo que ejecuta el ensayo asociado a un ticket.
- **Reactivo**: Registro generado al completar un ensayo, resultado de la ejecución de un formulario por un técnico.

## Requerimientos

### Requerimiento 1: Nuevo Rol Asistente en el Sistema

**User Story:** Como administrador del sistema, quiero incorporar el rol Asistente al SGR, para que pueda operar el módulo de clientes sin acceso a funcionalidades de otros módulos restringidos.

#### Criterios de Aceptación

1. THE SGR SHALL incluir el rol "asistente" en el conjunto de roles válidos del sistema.
2. WHEN un usuario con rol Asistente inicia sesión, THE SGR SHALL permitir acceso exclusivamente al Módulo_Clientes y funcionalidades compartidas (perfil propio, notificaciones).
3. THE SGR SHALL impedir que el Asistente acceda al tablero Kanban (Estado de los Ensayos).
4. THE SGR SHALL impedir que el Asistente realice transiciones de estado sobre ensayos/reactivos.
5. IF un usuario con rol Asistente intenta acceder a una funcionalidad no autorizada, THEN THE SGR SHALL denegar el acceso y redirigir al dashboard del Módulo_Clientes.

---

### Requerimiento 2: Control de Acceso al Módulo de Clientes

**User Story:** Como responsable de seguridad, quiero que solo Manager y Asistente accedan al módulo de clientes, para proteger la información comercial de accesos no autorizados.

#### Criterios de Aceptación

1. THE Módulo_Clientes SHALL permitir acceso únicamente a usuarios con rol Manager o Asistente.
2. THE Módulo_Clientes SHALL ocultar toda referencia visual (menús, enlaces, rutas) a datos de clientes para usuarios con roles superusuario, admin, técnico o técnico_de_campo.
3. IF un usuario con rol distinto a Manager o Asistente intenta acceder a cualquier endpoint del Módulo_Clientes, THEN THE SGR SHALL denegar la solicitud con código HTTP 403 y registrar el intento en auditoría.
4. THE SGR SHALL aplicar el control de acceso tanto en la capa de API (backend) como en la interfaz de usuario (frontend) de forma consistente.

---

### Requerimiento 3: Registro Rápido de Clientes

**User Story:** Como Manager o Asistente, quiero registrar clientes de forma rápida mediante un formulario responsive, para poder capturar información en escritorio y dispositivos móviles.

#### Criterios de Aceptación

1. THE Módulo_Clientes SHALL proporcionar un formulario de registro de clientes con los campos: nombre (obligatorio), empresa (obligatorio), email (obligatorio), teléfono (obligatorio), dirección (opcional) e industria (opcional).
2. THE Módulo_Clientes SHALL renderizar el formulario de registro de forma funcional en pantallas de escritorio (ancho mayor a 1024px) y dispositivos móviles (ancho menor a 768px).
3. WHEN un Manager o Asistente envía el formulario con datos válidos, THE Módulo_Clientes SHALL crear el registro del cliente y confirmar la operación.
4. THE Módulo_Clientes SHALL permitir editar todos los campos de un cliente existente por parte de un Manager o Asistente.
5. THE Módulo_Clientes SHALL impedir que usuarios con rol distinto a Manager o Asistente creen o editen clientes.

---

### Requerimiento 4: Validación Automática de Datos de Cliente

**User Story:** Como Manager o Asistente, quiero que el sistema valide automáticamente los datos del cliente, para evitar registros con información incorrecta o duplicada.

#### Criterios de Aceptación

1. WHEN un usuario ingresa un email, THE Módulo_Clientes SHALL validar que el formato cumpla con el estándar RFC 5322 simplificado (usuario@dominio.extensión).
2. WHEN un usuario ingresa un teléfono, THE Módulo_Clientes SHALL validar que el formato contenga entre 7 y 15 dígitos, permitiendo prefijo internacional con signo más y separadores opcionales (guiones, espacios).
3. WHEN un usuario envía el formulario sin completar los campos obligatorios (nombre, empresa, email, teléfono), THE Módulo_Clientes SHALL rechazar el envío e indicar los campos faltantes.
4. WHEN un usuario intenta registrar un cliente con un email que ya existe en el sistema, THE Módulo_Clientes SHALL rechazar el registro e informar que el email ya está asociado a otro cliente.
5. WHEN un usuario intenta registrar un cliente con un teléfono que ya existe en el sistema, THE Módulo_Clientes SHALL rechazar el registro e informar que el teléfono ya está asociado a otro cliente.
6. FOR ALL clientes registrados, el email y el teléfono SHALL ser únicos en la tabla de clientes (propiedad de unicidad).

---

### Requerimiento 5: Etiquetas y Segmentos de Clientes

**User Story:** Como Manager o Asistente, quiero aplicar etiquetas de texto libre a los clientes y filtrarlos por etiquetas, para poder segmentar mi cartera de clientes según criterios flexibles.

#### Criterios de Aceptación

1. THE Módulo_Clientes SHALL permitir al Manager y al Asistente aplicar una o más etiquetas de texto libre a un cliente.
2. THE Módulo_Clientes SHALL permitir al Manager y al Asistente eliminar etiquetas existentes de un cliente.
3. WHEN un usuario aplica una etiqueta, THE Módulo_Clientes SHALL almacenar la etiqueta en formato normalizado (minúsculas, sin espacios iniciales ni finales).
4. THE Módulo_Clientes SHALL proporcionar un mecanismo de filtrado que permita seleccionar clientes por una o más etiquetas.
5. WHEN un usuario filtra por múltiples etiquetas, THE Módulo_Clientes SHALL retornar los clientes que posean todas las etiquetas seleccionadas (intersección).
6. THE Módulo_Clientes SHALL impedir que usuarios con rol distinto a Manager o Asistente gestionen etiquetas.

---

### Requerimiento 6: Asignación Automática de Clientes a Equipos

**User Story:** Como Manager, quiero configurar reglas de asignación automática para que los nuevos tickets se asignen a vendedores o técnicos según ubicación o carga de trabajo, reduciendo el trabajo manual de distribución.

#### Criterios de Aceptación

1. THE Módulo_Clientes SHALL proporcionar una interfaz de configuración de reglas de asignación accesible exclusivamente para el Manager.
2. THE Módulo_Clientes SHALL soportar reglas basadas en ubicación geográfica del cliente (dirección o región).
3. THE Módulo_Clientes SHALL soportar reglas basadas en carga de trabajo actual del técnico (cantidad de tickets abiertos asignados).
4. WHEN un nuevo ticket es creado y existen reglas de asignación configuradas, THE Módulo_Clientes SHALL ejecutar las reglas y asignar automáticamente el técnico correspondiente.
5. WHEN no existen reglas configuradas o ninguna regla aplica al ticket, THE Módulo_Clientes SHALL dejar el ticket sin asignación automática para que el Manager o Asistente lo asigne manualmente.
6. THE Módulo_Clientes SHALL impedir que el Asistente acceda a la configuración de reglas de asignación.
7. IF las reglas de asignación no pueden determinar un técnico (empate en carga de trabajo, ubicación sin cobertura), THEN THE Módulo_Clientes SHALL dejar el ticket sin asignación automática y notificar al Manager.

---

### Requerimiento 7: Adjuntar Documentos y Contratos al Cliente

**User Story:** Como Manager o Asistente, quiero adjuntar documentos PDF, imágenes y contratos al perfil de un cliente, para centralizar la documentación comercial asociada.

#### Criterios de Aceptación

1. THE Módulo_Clientes SHALL permitir al Manager y al Asistente subir archivos al perfil de un cliente.
2. THE Módulo_Clientes SHALL aceptar archivos con tamaño máximo de 10 MB por archivo individual.
3. THE Módulo_Clientes SHALL aceptar archivos en los formatos: pdf, jpg, jpeg, png, doc, docx.
4. THE Módulo_Clientes SHALL almacenar los archivos en Garage_S3 utilizando la misma infraestructura de almacenamiento del SGR existente.
5. THE Módulo_Clientes SHALL permitir al Manager y al Asistente visualizar la lista de documentos adjuntos de un cliente con nombre original, tamaño y fecha de carga.
6. THE Módulo_Clientes SHALL permitir al Manager y al Asistente descargar los documentos adjuntos de un cliente.
7. IF un archivo excede el tamaño máximo de 10 MB, THEN THE Módulo_Clientes SHALL rechazar la carga e informar el límite permitido.
8. IF un archivo tiene un formato no permitido, THEN THE Módulo_Clientes SHALL rechazar la carga e informar los formatos aceptados.
9. THE Módulo_Clientes SHALL impedir que usuarios con rol distinto a Manager o Asistente suban o descarguen documentos de clientes.

---

### Requerimiento 8: Búsqueda y Filtros Avanzados de Clientes

**User Story:** Como Manager o Asistente, quiero buscar clientes por texto libre y aplicar filtros combinados, para localizar rápidamente la información que necesito.

#### Criterios de Aceptación

1. THE Módulo_Clientes SHALL proporcionar un campo de búsqueda de texto completo que busque coincidencias en: nombre, empresa, email, teléfono, dirección e industria del cliente.
2. THE Módulo_Clientes SHALL proporcionar filtros combinables por: industria, etiqueta, fecha de registro y técnico/vendedor asignado.
3. WHEN un usuario aplica múltiples filtros simultáneamente, THE Módulo_Clientes SHALL retornar solo los clientes que cumplan todas las condiciones (intersección).
4. WHEN un usuario ingresa texto en el campo de búsqueda, THE Módulo_Clientes SHALL retornar resultados que contengan coincidencias parciales (búsqueda tipo "contiene").
5. THE Módulo_Clientes SHALL impedir que usuarios con rol distinto a Manager o Asistente ejecuten búsquedas o filtros sobre datos de clientes.

---

### Requerimiento 9: Tickets Vinculados a Clientes (Solicitudes de Ensayo)

**User Story:** Como Manager o Asistente, quiero crear tickets de solicitud de ensayo vinculados a un cliente, seleccionando el formulario (norma) y asignando un técnico, para gestionar el flujo de trabajo de ensayos desde la perspectiva comercial.

#### Criterios de Aceptación

1. THE Módulo_Clientes SHALL permitir al Manager y al Asistente crear un ticket seleccionando: cliente existente, formulario activo (norma) y técnico a asignar.
2. WHEN un ticket es creado, THE Módulo_Clientes SHALL registrarlo con estado inicial "abierto".
3. THE Módulo_Clientes SHALL gestionar los tickets con los siguientes estados y transiciones válidas: abierto a en_progreso, en_progreso a completado, completado a cerrado.
4. WHEN el técnico asignado completa el ensayo (el reactivo asociado pasa a estado "finalizado"), THE Módulo_Clientes SHALL mover automáticamente el ticket al estado "completado".
5. THE Módulo_Clientes SHALL vincular el ticket con: cliente, formulario, técnico asignado y reactivo generado (una vez que el técnico lo genera).
6. THE Módulo_Clientes SHALL permitir al Manager y al Asistente visualizar todos los tickets con su estado actual, cliente asociado y técnico asignado.
7. THE Módulo_Clientes SHALL impedir que el técnico asignado modifique el ticket directamente; el técnico solo completa el ensayo a través del flujo normal del SGR.
8. WHILE un ticket se encuentra en estado "abierto", THE Módulo_Clientes SHALL permitir al Manager o Asistente modificar el técnico asignado.
9. FOR ALL tickets, la secuencia de estados SHALL ser estrictamente monotónica siguiendo el orden: abierto, en_progreso, completado, cerrado (propiedad de progresión unidireccional).

---

### Requerimiento 10: SLA y Priorización de Tickets

**User Story:** Como Manager, quiero definir tiempos máximos de resolución por prioridad y recibir alertas cuando un ticket se aproxime a su vencimiento, para garantizar el cumplimiento de compromisos con los clientes.

#### Criterios de Aceptación

1. THE Módulo_Clientes SHALL permitir asignar una prioridad a cada ticket con los valores: alta, media o baja.
2. THE Módulo_Clientes SHALL proporcionar una interfaz de configuración de SLA accesible exclusivamente para el Manager.
3. THE Módulo_Clientes SHALL permitir al Manager definir el tiempo máximo de resolución (en horas) para cada nivel de prioridad, con valores por defecto: alta 24 horas, media 48 horas, baja 72 horas.
4. WHEN un ticket se encuentra a un 80% del tiempo SLA definido para su prioridad sin haber sido completado, THE Módulo_Clientes SHALL generar una alerta dirigida al Manager y al Asistente que creó el ticket.
5. WHEN un ticket excede el tiempo SLA definido para su prioridad, THE Módulo_Clientes SHALL marcar visualmente el ticket como "vencido" en la lista de tickets.
6. THE Módulo_Clientes SHALL impedir que el Asistente modifique la configuración de SLA.
7. FOR ALL tickets con prioridad asignada, el tiempo SLA aplicable SHALL corresponder al valor configurado para ese nivel de prioridad en el momento de creación del ticket (propiedad de inmutabilidad de SLA aplicado).

---

### Requerimiento 11: Permisos Diferenciados entre Manager y Asistente

**User Story:** Como administrador del sistema, quiero que las acciones administrativas del módulo de clientes estén restringidas al Manager, para mantener una jerarquía clara de responsabilidades.

#### Criterios de Aceptación

1. THE Módulo_Clientes SHALL aplicar la siguiente matriz de permisos:
   - Manager: ver clientes, crear/editar clientes, gestionar etiquetas, subir documentos, crear tickets, asignar técnicos a tickets, configurar reglas de asignación, definir SLAs, buscar y filtrar.
   - Asistente: ver clientes, crear/editar clientes, gestionar etiquetas, subir documentos, crear tickets, asignar técnicos a tickets, buscar y filtrar.
2. THE Módulo_Clientes SHALL impedir que el Asistente acceda a la configuración de reglas de asignación automática.
3. THE Módulo_Clientes SHALL impedir que el Asistente acceda a la configuración de SLA.
4. WHEN el Asistente crea un ticket, THE Módulo_Clientes SHALL permitirle ver y gestionar ese ticket.
5. FOR ALL operaciones en el Módulo_Clientes, el control de acceso en la capa de API SHALL ser consistente con la visibilidad en la interfaz de usuario (propiedad de consistencia RBAC).

---

### Requerimiento 12: Auditoría de Operaciones del Módulo de Clientes

**User Story:** Como responsable de seguridad, quiero que todas las operaciones críticas del módulo de clientes queden registradas, para garantizar trazabilidad y detección de accesos indebidos.

#### Criterios de Aceptación

1. WHEN un cliente es creado, editado o eliminado, THE Módulo_Clientes SHALL registrar la operación en el log de auditoría con: actor, fecha, IP, tipo de operación y detalle del cambio.
2. WHEN un ticket es creado o cambia de estado, THE Módulo_Clientes SHALL registrar la operación en el log de auditoría.
3. WHEN un documento es subido o eliminado del perfil de un cliente, THE Módulo_Clientes SHALL registrar la operación en el log de auditoría.
4. WHEN un usuario no autorizado intenta acceder al Módulo_Clientes, THE Módulo_Clientes SHALL registrar el intento fallido en el log de auditoría.
5. THE Módulo_Clientes SHALL utilizar el mismo sistema de auditoría append-only existente en el SGR.
