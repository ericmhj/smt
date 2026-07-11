import { readFileSync, existsSync } from 'node:fs';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  frontendUrl: string;

  database: {
    url: string;
  };

  redis: {
    url: string;
  };

  jwt: {
    privateKey: string;
    publicKey: string;
    accessTokenExpiry: string;
    refreshTokenExpiry: string;
    issuer: string;
  };

  standaloneAuth: boolean;

  keycloak?: {
    jwksUrl: string;
    issuer: string;
    jwksCacheTtl: number;
  };

  kafka?: {
    brokers: string[];
    groupId: string;
    topic: string;
  };

  licenseService?: {
    baseUrl: string;
    timeoutMs: number;
    circuitBreaker: {
      failureThreshold: number;
      resetTimeoutMs: number;
    };
  };
}

function loadKey(pathOrValue: string | undefined, envName: string): string {
  if (!pathOrValue) {
    throw new Error(`${envName} environment variable is not set`);
  }

  // If it looks like a file path, read the file
  if (existsSync(pathOrValue)) {
    return readFileSync(pathOrValue, 'utf-8');
  }

  // Otherwise treat it as the key value directly (useful for testing/CI)
  return pathOrValue;
}

export function loadConfig(): AppConfig {
  const standaloneAuth = process.env.STANDALONE_AUTH !== 'false';

  const config: AppConfig = {
    port: Number(process.env.PORT) || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

    database: {
      url: process.env.DATABASE_URL || '',
    },

    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    },

    jwt: {
      privateKey: loadKey(process.env.JWT_PRIVATE_KEY_PATH, 'JWT_PRIVATE_KEY_PATH'),
      publicKey: loadKey(process.env.JWT_PUBLIC_KEY_PATH, 'JWT_PUBLIC_KEY_PATH'),
      accessTokenExpiry: process.env.JWT_ACCESS_TOKEN_EXPIRY || '15m',
      refreshTokenExpiry: process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d',
      issuer: process.env.JWT_ISSUER || 'sgr-api',
    },

    standaloneAuth,
  };

  if (!standaloneAuth) {
    config.keycloak = {
      jwksUrl: process.env.KEYCLOAK_JWKS_URL || '',
      issuer: process.env.KEYCLOAK_ISSUER || '',
      jwksCacheTtl: 300,
    };

    config.kafka = {
      brokers: (process.env.KAFKA_BROKERS || '').split(',').filter(Boolean),
      groupId: 'sgr-tenant-lifecycle',
      topic: 'tenant.lifecycle',
    };

    config.licenseService = {
      baseUrl: process.env.LICENSE_SERVICE_URL || '',
      timeoutMs: 5000,
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeoutMs: 60000,
      },
    };
  }

  return config;
}

export function validateConfig(config: AppConfig): void {
  if (config.standaloneAuth) {
    return;
  }

  if (!config.keycloak?.jwksUrl) {
    console.error('Variable KEYCLOAK_JWKS_URL es requerida en modo integrado');
    process.exit(1);
  }

  if (!config.keycloak?.issuer) {
    console.error('Variable KEYCLOAK_ISSUER es requerida en modo integrado');
    process.exit(1);
  }

  if (!config.kafka?.brokers || config.kafka.brokers.filter((b) => b.length > 0).length === 0) {
    console.error('Variable KAFKA_BROKERS es requerida en modo integrado');
    process.exit(1);
  }

  if (!config.licenseService?.baseUrl) {
    console.error('Variable LICENSE_SERVICE_URL es requerida en modo integrado');
    process.exit(1);
  }
}
