# DevContainers — Sistema de Gestión de Reactivos

## Arquitectura de contenedores

```
┌─────────────────────────────────────────────────────────────────┐
│                    Red: sgr-dev-network                          │
│                                                                 │
│  ┌──────────────────┐     ┌──────────────────┐                 │
│  │  backend-dev     │     │  frontend-dev    │                 │
│  │  (Node.js 20)    │     │  (Node.js 20)    │                 │
│  │                  │     │                  │                 │
│  │  Puerto: 3001    │◄────│  Puerto: 3000    │                 │
│  │  API + Swagger   │     │  Next.js App     │                 │
│  └────────┬─────────┘     └──────────────────┘                 │
│           │                                                     │
│  ┌────────┼──────────────────────────────────────────────┐     │
│  │        ▼          Servicios de infraestructura         │     │
│  │                                                        │     │
│  │  ┌──────────┐  ┌───────┐  ┌───────┐  ┌────────┐     │     │
│  │  │PostgreSQL│  │ Redis │  │ MinIO │  │ ClamAV │     │     │
│  │  │  :5432   │  │ :6379 │  │ :9000 │  │ :3310  │     │     │
│  │  └──────────┘  └───────┘  │ :9001 │  └────────┘     │     │
│  │                            └───────┘                   │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## Puertos expuestos

| Puerto | Servicio | URL |
|--------|----------|-----|
| 3000 | Frontend (Next.js) | http://localhost:3000 |
| 3001 | Backend API (Fastify) | http://localhost:3001 |
| 3001 | Swagger UI | http://localhost:3001/api/docs |
| 5432 | PostgreSQL | postgres://sgr:sgr_dev_password@localhost:5432/sgr_dev |
| 6379 | Redis | redis://:sgr_redis_dev@localhost:6379 |
| 9000 | MinIO API | http://localhost:9000 |
| 9001 | MinIO Console | http://localhost:9001 |
| 3310 | ClamAV | tcp://localhost:3310 |

## Orden de arranque

### Paso 1: Arrancar el Backend DevContainer (PRIMERO)

1. Abrir VS Code en la raíz del proyecto
2. `Ctrl+Shift+P` → "Dev Containers: Open Folder in Container..."
3. Seleccionar `.devcontainer/backend/`
4. Esperar a que se construya y ejecute `setup.sh`

El setup automáticamente:
- Instala Node.js 20 + pnpm 9
- Instala dependencias (`pnpm install`)
- Genera claves RSA para JWT
- Levanta PostgreSQL, Redis, MinIO, ClamAV
- Ejecuta migraciones de base de datos
- Ejecuta seed de datos de desarrollo
- Crea el bucket de MinIO
- Inicia el servidor backend en puerto 3001

### Paso 2: Arrancar el Frontend DevContainer (DESPUÉS)

1. Abrir una nueva ventana de VS Code
2. `Ctrl+Shift+P` → "Dev Containers: Open Folder in Container..."
3. Seleccionar `.devcontainer/frontend/`
4. Esperar a que se construya y ejecute `setup.sh`

El setup automáticamente:
- Instala Node.js 20 + pnpm 9
- Instala dependencias (`pnpm install`)
- Inicia Next.js en puerto 3000

**IMPORTANTE:** El backend debe estar corriendo antes de arrancar el frontend, ya que el frontend se conecta a la red `sgr-dev-network` creada por el backend.

## Software incluido en cada contenedor

### Backend DevContainer

| Software | Versión | Propósito |
|----------|---------|-----------|
| Node.js | 20 LTS | Runtime |
| pnpm | 9.12.0 | Package manager |
| OpenSSL | (incluido) | Generación de claves RSA |
| Git | latest | Control de versiones |
| pg_isready | (incluido) | Health check de PostgreSQL |

**Extensiones VS Code:**
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- Prisma (para Drizzle schema highlighting)
- Docker

### Frontend DevContainer

| Software | Versión | Propósito |
|----------|---------|-----------|
| Node.js | 20 LTS | Runtime |
| pnpm | 9.12.0 | Package manager |
| Git | latest | Control de versiones |

**Extensiones VS Code:**
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- Auto Rename Tag
- ES7 React Snippets

## Conexiones internas (dentro de la red Docker)

Desde el **backend-dev** container, los servicios se acceden por nombre DNS:

| Servicio | Host interno | Puerto |
|----------|-------------|--------|
| PostgreSQL | `postgres` | 5432 |
| Redis | `redis` | 6379 |
| MinIO | `minio` | 9000 |
| ClamAV | `clamav` | 3310 |

Desde el **frontend-dev** container:

| Servicio | URL |
|----------|-----|
| Backend API | `http://localhost:3001` (via port forwarding) |

## Variables de entorno

### Backend (configuradas automáticamente en `remoteEnv`)

```env
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://sgr:sgr_dev_password@postgres:5432/sgr_dev
REDIS_URL=redis://:sgr_redis_dev@redis:6379
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=sgr_minio_dev
MINIO_SECRET_KEY=sgr_minio_dev_password
MINIO_BUCKET=sgr-files
CLAMAV_HOST=clamav
CLAMAV_PORT=3310
JWT_PRIVATE_KEY_PATH=/workspace/keys/private.pem
JWT_PUBLIC_KEY_PATH=/workspace/keys/public.pem
JWT_ISSUER=sgr-api
SIGNATURE_HMAC_SECRET=dev-hmac-secret-change-in-production
```

### Frontend (configuradas automáticamente en `remoteEnv`)

```env
NODE_ENV=development
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Credenciales de desarrollo

| Servicio | Usuario | Contraseña |
|----------|---------|------------|
| PostgreSQL | sgr | sgr_dev_password |
| MinIO | sgr_minio_dev | sgr_minio_dev_password |
| Redis | (sin usuario) | sgr_redis_dev |
| App (Superusuario) | admin@sgr.local | admin123 |
| App (Manager) | manager@sgr.local | manager123 |
| App (Técnico) | tecnico@sgr.local | tecnico123 |

## Troubleshooting

### El frontend no puede conectar al backend
- Verificar que el backend devcontainer está corriendo primero
- Verificar que la red `sgr-dev-network` existe: `docker network ls | grep sgr`
- Verificar que el backend responde: `curl http://localhost:3001/api/health`

### PostgreSQL no está listo
- El setup script espera automáticamente, pero si falla:
  ```bash
  docker logs sgr-postgres
  ```

### ClamAV tarda en arrancar
- ClamAV necesita ~60s para descargar definiciones de virus la primera vez
- El `start_period: 60s` en el healthcheck lo maneja
- Los archivos se cachean en el volumen `clamav_data`

### Regenerar claves JWT
```bash
rm -rf /workspace/keys
mkdir -p /workspace/keys
openssl genrsa -out /workspace/keys/private.pem 2048
openssl rsa -in /workspace/keys/private.pem -pubout -out /workspace/keys/public.pem
```
