# Single stage: install all deps and run with tsx
# Node 22: requerido por pnpm@9.12.0 (packageManager en package.json).
FROM node:22-alpine
RUN apk add --no-cache netcat-openbsd chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# Install dependencies (including devDependencies for tsx)
COPY pnpm-workspace.yaml package.json ./
COPY pnpm-lock.yaml* ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --no-frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend

# Make entrypoint executable
RUN chmod +x packages/backend/entrypoint.sh

EXPOSE 3001

# Use entrypoint that runs seed then starts server
CMD ["sh", "packages/backend/entrypoint.sh"]
