# Matriz de Permisos por Rol — Sistema de Gestión de Ensayos (SGR)

## Roles del Sistema

| Rol | Descripción |
|---|---|
| **Superusuario** | Acceso total al sistema. Administración completa. |
| **Admin** | Administración de usuarios, formularios y asignaciones. |
| **Manager** | Gestión operativa: Kanban, tickets, clientes, configuración SLA. |
| **Técnico** | Ejecución de ensayos asignados. |
| **Asistente** | Apoyo administrativo: clientes y tickets (sin configuración). |

---

## Módulos y Acceso por Rol

### 1. Gestión de Usuarios (`/users`)

| Acción | Superusuario | Admin | Manager | Técnico | Asistente |
|---|:---:|:---:|:---:|:---:|:---:|
| Ver lista de usuarios | ✓ | ✓ | ✗ | ✗ | ✗ |
| Crear usuario | ✓ | ✓ | ✗ | ✗ | ✗ |
| Editar usuario | ✓ | ✓ | ✗ | ✗ | ✗ |
| Eliminar usuario | ✓ | ✗ | ✗ | ✗ | ✗ |
| Desactivar usuario | ✓ | ✓ | ✗ | ✗ | ✗ |
| Listar técnicos (para asignación) | ✓ | ✓ | ✓ | ✗ | ✓ |

**Jerarquía de gestión:**
- Superusuario puede gestionar: admin, manager, técnico
- Admin puede gestionar: manager, técnico
- Nadie puede eliminar o modificar un superusuario excepto otro superusuario

---

### 2. Formularios (`/forms`)

| Acción | Superusuario | Admin | Manager | Técnico | Asistente |
|---|:---:|:---:|:---:|:---:|:---:|
| Ver lista de formularios | ✓ | ✓ | ✓ (solo activos) | ✓ | ✓ |
| Vista previa del formulario | ✓ | ✓ | ✓ | ✓ | ✓ |
| Crear formulario (subir HTML) | ✓ | ✓ | ✗ | ✗ | ✗ |
| Editar/actualizar formulario | ✓ | ✓ | ✗ | ✗ | ✗ |
| Activar/desactivar formulario | ✓ | ✓ | ✗ | ✗ | ✗ |
| Eliminar formulario | ✓ | ✗ | ✗ | ✗ | ✗ |
| Ver versiones del formulario | ✓ | ✓ | ✗ | ✗ | ✗ |

---

### 3. Asignaciones de Formularios (`/assignments`)

| Acción | Superusuario | Admin | Manager | Técnico | Asistente |
|---|:---:|:---:|:---:|:---:|:---:|
| Ver asignaciones | ✓ | ✓ | ✓ | ✗ | ✗ |
| Crear asignación (form→técnico) | ✓ | ✓ | ✓ | ✗ | ✗ |
| Revocar asignación | ✓ | ✓ | ✓ | ✗ | ✗ |

---

### 4. Estado de los Ensayos — Kanban del Manager (`/kanban`)

| Acción | Superusuario | Admin | Manager | Técnico | Asistente |
|---|:---:|:---:|:---:|:---:|:---:|
| Ver tablero (todos los ensayos) | ✓ | ✓ | ✓ | ✗ | ✗ |
| Drag & Drop (transiciones) | ✗ | ✗ | ✓ | ✗ | ✗ |
| Ver PDF de ensayo | ✓ | ✓ | ✓ | ✗ | ✗ |
| Filtrar por técnico/formulario | ✓ | ✓ | ✓ | ✗ | ✗ |

**Transiciones permitidas (solo Manager vía D&D):**
- Programado → En Evaluación
- En Evaluación → Validado
- En Evaluación → Rechazado
- Validado → Finalizado

---

### 5. Mis Ensayos — Kanban del Técnico (`/my-kanban`)

| Acción | Superusuario | Admin | Manager | Técnico | Asistente |
|---|:---:|:---:|:---:|:---:|:---:|
| Ver tablero (solo propios) | ✗ | ✗ | ✗ | ✓ | ✗ |
| Abrir formulario editable (estado Programado) | ✗ | ✗ | ✗ | ✓ | ✗ |
| Enviar ensayo (submit) | ✗ | ✗ | ✗ | ✓ | ✗ |
| Ver PDF (estados posteriores) | ✗ | ✗ | ✗ | ✓ | ✗ |
| Ver motivo de rechazo | ✗ | ✗ | ✗ | ✓ | ✗ |
| Re-enviar ensayo rechazado | ✗ | ✗ | ✗ | ✓ | ✗ |

**Restricciones:**
- Solo puede llenar/enviar ensayos asignados a él
- Solo puede enviar en estado "Programado"
- No puede hacer D&D (tablero es read-only)

---

### 6. Mis Formularios (`/my-forms`)

| Acción | Superusuario | Admin | Manager | Técnico | Asistente |
|---|:---:|:---:|:---:|:---:|:---:|
| Ver formularios asignados | ✗ | ✗ | ✗ | ✓ | ✗ |
| Crear reactivo (llenar formulario) | ✗ | ✗ | ✗ | ✓ | ✗ |

---

### 7. Clientes (`/clientes`)

| Acción | Superusuario | Admin | Manager | Técnico | Asistente |
|---|:---:|:---:|:---:|:---:|:---:|
| Ver lista de clientes | ✗ | ✗ | ✓ | ✗ | ✓ |
| Ver detalle de cliente | ✗ | ✗ | ✓ | ✗ | ✓ |
| Crear cliente | ✗ | ✗ | ✓ | ✗ | ✓ |
| Editar cliente | ✗ | ✗ | ✓ | ✗ | ✓ |
| Desactivar cliente | ✗ | ✗ | ✓ | ✗ | ✓ |
| Buscar clientes (full-text) | ✗ | ✗ | ✓ | ✗ | ✓ |
| Gestionar etiquetas | ✗ | ✗ | ✓ | ✗ | ✓ |
| Subir/eliminar documentos | ✗ | ✗ | ✓ | ✗ | ✓ |
| Ver contactos | ✗ | ✗ | ✓ | ✗ | ✓ |
| Agregar/editar/eliminar contactos | ✗ | ✗ | ✓ | ✗ | ✓ |

---

### 8. Tickets (`/tickets`)

| Acción | Superusuario | Admin | Manager | Técnico | Asistente |
|---|:---:|:---:|:---:|:---:|:---:|
| Ver lista de tickets | ✗ | ✗ | ✓ | ✗ | ✓ |
| Ver detalle de ticket | ✗ | ✗ | ✓ | ✗ | ✓ |
| Crear ticket | ✗ | ✗ | ✓ | ✗ | ✓ |
| Cambiar estado (transiciones) | ✗ | ✗ | ✓ | ✗ | ✓ |
| Reasignar técnico | ✗ | ✗ | ✓ | ✗ | ✓ |
| Vincular reactivo | ✗ | ✗ | ✓ | ✗ | ✓ |

---

### 9. Configuración (`/configuracion`)

| Acción | Superusuario | Admin | Manager | Técnico | Asistente |
|---|:---:|:---:|:---:|:---:|:---:|
| Ver/editar configuración SLA | ✗ | ✗ | ✓ | ✗ | ✗ |
| Ver/crear/editar reglas de asignación | ✗ | ✗ | ✓ | ✗ | ✗ |

---

### 10. Notificaciones

| Acción | Superusuario | Admin | Manager | Técnico | Asistente |
|---|:---:|:---:|:---:|:---:|:---:|
| Recibir notificaciones | ✓ | ✓ | ✓ | ✓ | ✓ |
| Marcar como leída | ✓ | ✓ | ✓ | ✓ | ✓ |

---

### 11. Auditoría (`/audit`)

| Acción | Superusuario | Admin | Manager | Técnico | Asistente |
|---|:---:|:---:|:---:|:---:|:---:|
| Ver logs de auditoría | ✓ | ✓ | ✗ | ✗ | ✗ |

---

## Ruta por Defecto al Iniciar Sesión

| Rol | Redirige a |
|---|---|
| Superusuario | `/kanban` |
| Admin | `/kanban` |
| Manager | `/kanban` |
| Técnico | `/my-forms` |
| Asistente | `/clientes` |

---

## Resumen Visual de Navegación (Sidebar)

| Elemento del menú | Superusuario | Admin | Manager | Técnico | Asistente |
|---|:---:|:---:|:---:|:---:|:---:|
| Estado de los Ensayos (Kanban) | ✓ | ✓ | ✓ | ✗ | ✗ |
| Usuarios | ✓ | ✓ | ✗ | ✗ | ✗ |
| Formularios | ✓ | ✓ | ✓ | ✗ | ✗ |
| Asignaciones | ✓ | ✓ | ✓ | ✗ | ✗ |
| Clientes | ✗ | ✗ | ✓ | ✗ | ✓ |
| Tickets | ✗ | ✗ | ✓ | ✗ | ✓ |
| Configuración > SLA | ✗ | ✗ | ✓ | ✗ | ✗ |
| Configuración > Reglas Asignación | ✗ | ✗ | ✓ | ✗ | ✗ |
| Mis Formularios | ✗ | ✗ | ✗ | ✓ | ✗ |
| Mis Ensayos (Kanban técnico) | ✗ | ✗ | ✗ | ✓ | ✗ |

---

## Cuentas de Prueba

| Rol | Email | Password |
|---|---|---|
| Superusuario | admin@sgr.local | admin123 |
| Admin | administrador@sgr.local | admin123 |
| Manager | manager@sgr.local | manager123 |
| Técnico | tecnico@sgr.local | tecnico123 |
| Asistente | asistente@sgr.local | asistente123 |
