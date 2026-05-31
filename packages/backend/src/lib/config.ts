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
  return {
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
  };
}
