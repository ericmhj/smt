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
import { reactivoRoutes } from '../../src/modules/reactivos/reactivo.routes.js';
import { kanbanRoutes } from '../../src/modules/kanban/kanban.routes.js';
import { signatureRoutes } from '../../src/modules/signatures/signature.routes.js';

describe('Reactivo Lifecycle Integration', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedTestContainer;
  let app: FastifyInstance;
  let sql: ReturnType<typeof postgres>;
  let tecnicoToken: string;
  let managerToken: string;
  let tecnicoId: string;
  let managerId: string;
  let formId: string;
  let formVersionId: string;

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
    sql = postgres(connectionString);
    const db = drizzle(sql) as any;

    // Create all required tables
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'tecnico',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS forms (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        current_version INTEGER NOT NULL DEFAULT 1,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS form_versions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        form_id UUID NOT NULL REFERENCES forms(id),
        version_number INTEGER NOT NULL,
        json_schema JSONB NOT NULL,
        html_template TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS form_assignments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        form_id UUID NOT NULL REFERENCES forms(id),
        tecnico_id UUID NOT NULL REFERENCES users(id),
        assigned_by UUID REFERENCES users(id),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS reactivos (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        form_id UUID NOT NULL REFERENCES forms(id),
        form_version_id UUID NOT NULL REFERENCES form_versions(id),
        tecnico_id UUID NOT NULL REFERENCES users(id),
        parent_reactivo_id UUID REFERENCES reactivos(id),
        attempt_number INTEGER NOT NULL DEFAULT 1,
        state VARCHAR(50) NOT NULL DEFAULT 'pendiente',
        responses JSONB NOT NULL DEFAULT '{}',
        rejection_reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS state_transitions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        reactivo_id UUID NOT NULL REFERENCES reactivos(id),
        from_state VARCHAR(50) NOT NULL,
        to_state VARCHAR(50) NOT NULL,
        actor_id UUID NOT NULL REFERENCES users(id),
        signature_id UUID,
        reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS signatures (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id),
        reactivo_id UUID NOT NULL REFERENCES reactivos(id),
        type VARCHAR(50) NOT NULL,
        hash VARCHAR(512) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // Insert test users
    const tecnicoHash = await bcrypt.hash('TecnicoPass1!', 10);
    const managerHash = await bcrypt.hash('ManagerPass1!', 10);

    const [tecnico] = await sql`
      INSERT INTO users (email, password_hash, name, role)
      VALUES ('tecnico@test.com', ${tecnicoHash}, 'Tecnico Test', 'tecnico')
      RETURNING id
    `;
    tecnicoId = tecnico.id;

    const [manager] = await sql`
      INSERT INTO users (email, password_hash, name, role)
      VALUES ('manager@test.com', ${managerHash}, 'Manager Test', 'manager')
      RETURNING id
    `;
    managerId = manager.id;

    // Create form and version
    const [form] = await sql`
      INSERT INTO forms (name, slug, current_version, created_by)
      VALUES ('Test Form', 'test-form', 1, ${managerId})
      RETURNING id
    `;
    formId = form.id;

    const jsonSchema = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] };
    const [version] = await sql`
      INSERT INTO form_versions (form_id, version_number, json_schema)
      VALUES (${formId}, 1, ${JSON.stringify(jsonSchema)})
      RETURNING id
    `;
    formVersionId = version.id;

    // Assign form to tecnico
    await sql`
      INSERT INTO form_assignments (form_id, tecnico_id, assigned_by, is_active)
      VALUES (${formId}, ${tecnicoId}, ${managerId}, true)
    `;

    // Generate RSA key pair
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // Build Fastify app
    app = Fastify({ logger: false });

    const authService = new AuthService(db, {
      privateKey,
      publicKey,
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
      issuer: 'sgr-test',
    });
    await authService.initialize();

    await app.register(authMiddleware, { authService });
    await app.register(authRoutes, { authService });
    await app.register(reactivoRoutes, { db });
    await app.register(kanbanRoutes, { db });
    await app.register(signatureRoutes, { db });

    await app.ready();

    // Get tokens
    const tecnicoLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'tecnico@test.com', password: 'TecnicoPass1!' },
    });
    tecnicoToken = tecnicoLogin.json().accessToken;

    const managerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'manager@test.com', password: 'ManagerPass1!' },
    });
    managerToken = managerLogin.json().accessToken;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await sql?.end();
    await redisContainer?.stop();
    await pgContainer?.stop();
  });

  it('create reactivo → state=pendiente, attempt=1', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/reactivos',
      headers: { authorization: `Bearer ${tecnicoToken}` },
      payload: {
        formId,
        responses: { answer: 'Test answer' },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.state).toBe('pendiente');
    expect(body.attemptNumber).toBe(1);
    expect(body.formId).toBe(formId);
    expect(body.tecnicoId).toBe(tecnicoId);
  });

  it('full lifecycle: pendiente → en_revision → validado → finalizado', async () => {
    // Create reactivo
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/reactivos',
      headers: { authorization: `Bearer ${tecnicoToken}` },
      payload: { formId, responses: { answer: 'Lifecycle test' } },
    });
    const reactivoId = createRes.json().id;

    // Create signature for each transition
    const createSignature = async (actorToken: string) => {
      const [sig] = await sql`
        INSERT INTO signatures (user_id, reactivo_id, type, hash)
        VALUES (${managerId}, ${reactivoId}, 'transition', 'test-hash-${Date.now()}')
        RETURNING id
      `;
      return sig.id;
    };

    // Transition: pendiente → en_revision
    let signatureId = await createSignature(managerToken);
    await sql`
      INSERT INTO state_transitions (reactivo_id, from_state, to_state, actor_id, signature_id)
      VALUES (${reactivoId}, 'pendiente', 'en_revision', ${managerId}, ${signatureId})
    `;
    await sql`UPDATE reactivos SET state = 'en_revision', updated_at = NOW() WHERE id = ${reactivoId}`;

    // Transition: en_revision → validado
    signatureId = await createSignature(managerToken);
    await sql`
      INSERT INTO state_transitions (reactivo_id, from_state, to_state, actor_id, signature_id)
      VALUES (${reactivoId}, 'en_revision', 'validado', ${managerId}, ${signatureId})
    `;
    await sql`UPDATE reactivos SET state = 'validado', updated_at = NOW() WHERE id = ${reactivoId}`;

    // Transition: validado → finalizado
    signatureId = await createSignature(managerToken);
    await sql`
      INSERT INTO state_transitions (reactivo_id, from_state, to_state, actor_id, signature_id)
      VALUES (${reactivoId}, 'validado', 'finalizado', ${managerId}, ${signatureId})
    `;
    await sql`UPDATE reactivos SET state = 'finalizado', updated_at = NOW() WHERE id = ${reactivoId}`;

    // Verify final state
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/reactivos/${reactivoId}`,
      headers: { authorization: `Bearer ${tecnicoToken}` },
    });

    expect(getRes.statusCode).toBe(200);
    const detail = getRes.json();
    expect(detail.state).toBe('finalizado');
    expect(detail.stateTransitions).toHaveLength(3);
  });

  it('rejection flow: pendiente → en_revision → rechazado → re-apply → new reactivo with attempt=2', async () => {
    // Create reactivo
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/reactivos',
      headers: { authorization: `Bearer ${tecnicoToken}` },
      payload: { formId, responses: { answer: 'Rejection test' } },
    });
    const reactivoId = createRes.json().id;

    // Transition: pendiente → en_revision
    const [sig1] = await sql`
      INSERT INTO signatures (user_id, reactivo_id, type, hash)
      VALUES (${managerId}, ${reactivoId}, 'transition', 'hash-1')
      RETURNING id
    `;
    await sql`
      INSERT INTO state_transitions (reactivo_id, from_state, to_state, actor_id, signature_id)
      VALUES (${reactivoId}, 'pendiente', 'en_revision', ${managerId}, ${sig1.id})
    `;
    await sql`UPDATE reactivos SET state = 'en_revision', updated_at = NOW() WHERE id = ${reactivoId}`;

    // Transition: en_revision → rechazado (with reason)
    const [sig2] = await sql`
      INSERT INTO signatures (user_id, reactivo_id, type, hash)
      VALUES (${managerId}, ${reactivoId}, 'transition', 'hash-2')
      RETURNING id
    `;
    await sql`
      INSERT INTO state_transitions (reactivo_id, from_state, to_state, actor_id, signature_id, reason)
      VALUES (${reactivoId}, 'en_revision', 'rechazado', ${managerId}, ${sig2.id}, 'Respuestas incompletas')
    `;
    await sql`UPDATE reactivos SET state = 'rechazado', rejection_reason = 'Respuestas incompletas', updated_at = NOW() WHERE id = ${reactivoId}`;

    // Re-apply
    const reapplyRes = await app.inject({
      method: 'POST',
      url: `/api/reactivos/${reactivoId}/reapply`,
      headers: { authorization: `Bearer ${tecnicoToken}` },
      payload: { responses: { answer: 'Corrected answer' } },
    });

    expect(reapplyRes.statusCode).toBe(201);
    const newReactivo = reapplyRes.json();
    expect(newReactivo.attemptNumber).toBe(2);
    expect(newReactivo.state).toBe('pendiente');
    expect(newReactivo.parentReactivoId).toBe(reactivoId);
  });

  it('invalid transition (pendiente → validado) is rejected by state machine', async () => {
    // The state machine validation is in the service layer.
    // We test it by verifying the canTransition function rejects this.
    const { canTransition } = await import('../../src/modules/reactivos/state-machine.js');
    expect(canTransition('pendiente', 'validado')).toBe(false);
  });

  it('transition without signature is rejected', async () => {
    const { validateTransition } = await import('../../src/modules/reactivos/state-machine.js');
    const result = validateTransition('pendiente', {
      toState: 'en_revision',
      signatureId: '',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('firma digital');
  });

  it('transition to rechazado without reason is rejected', async () => {
    const { validateTransition } = await import('../../src/modules/reactivos/state-machine.js');
    const result = validateTransition('en_revision', {
      toState: 'rechazado',
      signatureId: 'some-signature-id',
      reason: '',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('motivo');
  });
});
