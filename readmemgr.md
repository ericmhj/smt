# Sistema de Gestión de Reactivos (SGR)

## URLs del sistema

| Servicio | URL |
|----------|-----|
| Frontend (aplicación) | http://localhost:3000 |
| Backend API | http://localhost:3001 |
| Swagger (documentación API) | http://localhost:3001/api/docs |
| Health check | http://localhost:3001/api/health |
| MinIO Console (archivos) | http://localhost:9001 |

## Usuarios de prueba

| Rol | Email | Contraseña | Permisos |
|-----|-------|------------|----------|
| Superusuario | admin@sgr.local | admin123 | Control total del sistema |
| Administrador | admin2@sgr.local | admin123 | Gestión de perfiles, formularios y asignaciones |
| Manager | manager@sgr.local | manager123 | Kanban, firma digital, observaciones, asignaciones |
| Técnico de campo | tecnico@sgr.local | tecnico123 | Llenar formularios, ver reactivos en PDF |

## Perfiles y permisos

| Funcionalidad | Superusuario | Administrador | Manager | Técnico |
|---------------|:---:|:---:|:---:|:---:|
| Gestión de usuarios | ✅ Total | ✅ Parcial | ❌ | ❌ |
| Crear/editar formularios | ✅ | ✅ | ❌ | ❌ |
| Ver formularios | ✅ | ✅ | ✅ (solo lectura) | ❌ |
| Asignar formularios | ✅ | ✅ | ✅ | ❌ |
| Tablero Kanban (ver) | ✅ (solo lectura) | ✅ (solo lectura) | ✅ | ❌ |
| Mover tarjetas Kanban | ❌ | ❌ | ✅ (con firma) | ❌ |
| Enviar observaciones | ❌ | ❌ | ✅ | ❌ |
| Llenar formularios | ❌ | ❌ | ❌ | ✅ |
| Ver reactivos (PDF) | ❌ | ❌ | ❌ | ✅ |
| Re-aplicar tras rechazo | ❌ | ❌ | ❌ | ✅ |
| Recibir notificaciones | ❌ | ❌ | ❌ | ✅ |

## Cómo levantar el sistema

```bash
# Desde la raíz del proyecto (C:\dev\smt)
docker compose up --build -d
```

## Cómo detener el sistema

```bash
docker compose down
```

## Cómo borrar todo y empezar limpio

```bash
docker compose down -v
```

## Flujo de prueba rápido

1. **Login como admin** → http://localhost:3000 → admin@sgr.local / admin123
2. **Crear formulario** → Menú "Formularios" → Nuevo → Pegar HTML con campos
3. **Asignar a técnico** → Menú "Asignaciones" → Seleccionar técnico + formulario
4. **Login como técnico** → tecnico@sgr.local / tecnico123
5. **Llenar formulario** → "Mis formularios" → Seleccionar → Llenar → Enviar
6. **Login como manager** → manager@sgr.local / manager123
7. **Revisar en Kanban** → Mover tarjeta → Firmar → Validar o Rechazar
8. **Agregar observación** → Detalle del reactivo → Escribir texto + adjuntar archivo

## Servicios de infraestructura

| Servicio | Puerto | Credenciales |
|----------|--------|-------------|
| PostgreSQL | 5432 | user: sgr / pass: sgr_dev_password / db: sgr_dev |
| Redis | 6379 | pass: sgr_redis_dev |
| MinIO | 9000 (API) / 9001 (Console) | user: sgr_minio_dev / pass: sgr_minio_dev_password |
| ClamAV | 3310 | (sin credenciales) |

## API - Endpoints principales

### Autenticación
- `POST /api/auth/login` — Login (devuelve tokens JWT)
- `POST /api/auth/refresh` — Renovar token
- `POST /api/auth/logout` — Cerrar sesión

### Usuarios
- `GET /api/users` — Listar usuarios
- `POST /api/users` — Crear usuario
- `PATCH /api/users/:id` — Editar usuario
- `PATCH /api/users/:id/deactivate` — Desactivar usuario

### Formularios
- `GET /api/forms` — Listar formularios
- `POST /api/forms` — Crear formulario desde HTML
- `PUT /api/forms/:id` — Actualizar formulario
- `GET /api/forms/:id/versions` — Historial de versiones
- `GET /api/forms/:id/schema` — Esquema JSON

### Asignaciones
- `POST /api/assignments` — Asignar formulario a técnico
- `DELETE /api/assignments/:id` — Revocar asignación
- `GET /api/my-forms` — Formularios del técnico

### Reactivos
- `POST /api/reactivos` — Crear reactivo (técnico envía formulario)
- `POST /api/reactivos/:id/reapply` — Re-aplicar tras rechazo
- `GET /api/reactivos/:id/pdf` — Descargar PDF
- `GET /api/my-reactivos` — Reactivos del técnico

### Kanban
- `GET /api/kanban` — Obtener tablero
- `POST /api/kanban/:reactivoId/transition` — Mover tarjeta (solo Manager)
- `GET /api/kanban/:reactivoId/detail` — Detalle completo

### Observaciones
- `POST /api/reactivos/:id/observations` — Crear observación con adjuntos
- `PATCH /api/observations/:id/read` — Marcar como leída

### Notificaciones
- `GET /api/notifications` — Listar notificaciones
- `GET /api/notifications/unread-count` — Contador de no leídas
- `GET /api/notifications/stream` — SSE en tiempo real
