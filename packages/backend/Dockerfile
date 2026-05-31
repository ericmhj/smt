# Single stage: install all deps and run with tsx
FROM node:20-alpine
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

EXPOSE 3001

# Run directly with tsx (TypeScript execution without build)
CMD ["pnpm", "--filter", "@sgr/backend", "start"]
