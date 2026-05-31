import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import Fastify, { type FastifyInstance } from 'fastify';
import { generateKeyPairSync } from 'node:crypto';
import bcrypt from 'bcrypt';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { authMiddleware } from '../../src/modules/auth/auth.middleware.js';
import { authRoutes } from '../../src/modules/auth/auth.routes.js';
import { users } from '../../src/db/schema/users.js';

describe('Auth Flow Integration', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedTestContainer;
  let app: FastifyInstance;
  let authService: AuthService;

  const testUser = {
    email: 'test@example.com',
    password: 'SecurePass123!',
    name: 'Test User',
    role: 'tecnico' as const,
  };

  beforeAll(async () => {
    // Start PostgreSQL container
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('sgr_test')
      .withUsername('test')
      .withPassword('test')
      .start();

    // Start Redis container
    redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();

    const redisHost = redisContainer.getHost();
    const redisPort = redisContainer.getMappedPort(6379);
    process.env.REDIS_URL = `redis://${redisHost}:${redisPort}`;

    // Setup database
    const connectionString = pgContainer.getConnectionUri();
    const sql = postgres(connectionString);
    const db = drizzle(sql) as any;

    // Create users table
    await sql`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'tecnico',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    // Insert test user
    const passwordHash = await bcrypt.hash(testUser.password, 10);
    await sql`
      INSERT INTO users (email, password_hash, name, role, is_active)
      VALUES (${testUser.email}, ${passwordHash}, ${testUser.name}, ${testUser.role}, true)
    `;

    // Generate RSA key pair for JWT
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // Build Fastify app
    app = Fastify({ logger: false });

    authService = new AuthService(db, {
      privateKey,
      publicKey,
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
      issuer: 'sgr-test',
    });
    await authService.initialize();

    await app.register(authMiddleware, { authService });
    await app.register(authRoutes, { authService });

    // Add a protected test endpoint
    app.get('/api/protected', async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }
      return { userId: request.user.sub, role: request.user.role };
    });

    await app.ready();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await redisContainer?.stop();
    await pgContainer?.stop();
  });

  it('login with valid credentials returns token pair', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: testUser.email,
        password: testUser.password,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(typeof body.accessToken).toBe('string');
    expect(typeof body.refreshToken).toBe('string');
  });

  it('login with invalid credentials returns 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: testUser.email,
        password: 'WrongPassword!',
      },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.code).toBe('AUTH_001');
  });

  it('refresh with valid token returns new token pair', async () => {
    // First login to get tokens
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: testUser.email,
        password: testUser.password,
      },
    });

    const { refreshToken } = loginResponse.json();

    // Refresh
    const refreshResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken },
    });

    expect(refreshResponse.statusCode).toBe(200);
    const body = refreshResponse.json();
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    // New tokens should be different from original
    expect(body.refreshToken).not.toBe(refreshToken);
  });

  it('refresh with invalid token returns 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: 'invalid.token.here' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('logout invalidates subsequent requests with same token', async () => {
    // Login
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: testUser.email,
        password: testUser.password,
      },
    });

    const { accessToken } = loginResponse.json();

    // Logout
    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(logoutResponse.statusCode).toBe(200);

    // Try to access protected endpoint with same token
    const protectedResponse = await app.inject({
      method: 'GET',
      url: '/api/protected',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(protectedResponse.statusCode).toBe(401);
  });

  it('access protected endpoint without token returns 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/protected',
    });

    expect(response.statusCode).toBe(401);
  });
});
