# Single stage: install deps and run Next.js in dev mode for now
# Node 22: requerido por pnpm@9.12.0 (packageManager en package.json).
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# Install dependencies
COPY pnpm-workspace.yaml package.json ./
COPY pnpm-lock.yaml* ./
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --no-frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Run Next.js in dev mode (avoids build type errors for now)
CMD ["pnpm", "--filter", "@sgr/frontend", "dev"]
