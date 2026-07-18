// Feature: ensayo-tecnico, Property 2: Submit persists responses round-trip
// Feature: ensayo-tecnico, Property 3: Submit transitions state to en_revision
// Feature: ensayo-tecnico, Property 4: Access control rejects unauthorized users
// Feature: ensayo-tecnico, Property 5: State guard rejects non-pendiente reactivos
// Feature: ensayo-tecnico, Property 6: Reapply preserves lineage and metadata
// Feature: ensayo-tecnico, Property 7: Submit creates audit trail (syncTicketState)

import fc from 'fast-check';
import { ReactivoService } from './reactivo.service';
import { ReactivoError, ReactivoErrorCode } from './reactivo.errors';
import type { JWTPayload } from '../auth/auth.types';

// --- Arbitraries ---

/** Generate a UUID-like string */
const uuidArb = fc.uuid();

/** Generate a valid tecnico actor */
function tecnicoActorArb(sub?: string): fc.Arbitrary<JWTPayload> {
  return fc.record({
    sub: sub ? fc.constant(sub) : uuidArb,
    role: fc.constant('tecnico'),
    tenantId: uuidArb,
    tenantSlug: fc.string({ minLength: 3, maxLength: 10 }),
    iat: fc.integer({ min: 1_700_000_000, max: 1_800_000_000 }),
    exp: fc.integer({ min: 1_800_000_001, max: 1_900_000_000 }),
    jti: uuidArb,
  });
}

/** Generate a non-tecnico role */
const nonTecnicoRoleArb = fc.constantFrom('admin', 'manager', 'asistente', 'superusuario');

/** Generate a non-tecnico actor */
const nonTecnicoActorArb = fc.record({
  sub: uuidArb,
  role: nonTecnicoRoleArb,
  tenantId: uuidArb,
  tenantSlug: fc.string({ minLength: 3, maxLength: 10 }),
  iat: fc.integer({ min: 1_700_000_000, max: 1_800_000_000 }),
  exp: fc.integer({ min: 1_800_000_001, max: 1_900_000_000 }),
  jti: uuidArb,
});

/** Generate random valid responses (simple key-value pairs) */
const responsesArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 12 }).filter((s) => /^[a-z][a-z0-9_]*$/.test(s)),
  fc.oneof(
    fc.string({ minLength: 1, maxLength: 50 }),
    fc.integer({ min: 0, max: 1000 }),
    fc.boolean(),
  ),
  { minKeys: 1, maxKeys: 8 },
);

/** States that are NOT pendiente */
const nonPendienteStateArb = fc.constantFrom('en_revision', 'validado', 'rechazado', 'finalizado');

/** Generate a positive attempt number */
const attemptNumberArb = fc.integer({ min: 1, max: 10 });

// --- Mock DB Factory ---

interface MockReactivoRow {
  id: string;
  formId: string;
  formVersionId: string;
  tecnicoId: string;
  parentReactivoId: string | null;
  attemptNumber: number;
  state: string;
  responses: unknown;
  rejectionReason: string | null;
  fechaProgramada: Date | null;
  clienteNombre: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockDbConfig {
  reactivo: MockReactivoRow | null;
  formVersion: { id: string; jsonSchema: unknown } | null;
  ticket: { id: string; estado: string; reactivoId: string } | null;
  /** Captures calls to update for assertion */
  onUpdate?: (table: unknown, data: unknown) => void;
  /** Captures calls to insert for assertion */
  onInsert?: (table: unknown, values: unknown) => void;
  /** Override for formAssignments query */
  formAssignment?: { formId: string; tecnicoId: string; isActive: boolean } | null;
}

function createMockDb(config: MockDbConfig) {
  const { reactivo, formVersion, ticket } = config;

  // Track update calls for spy assertions
  let lastUpdateSetData: unknown = null;
  let syncTicketCalled = false;
  let syncTicketNewState: string | null = null;
  let insertedReactivo: MockReactivoRow | null = null;

  const mockDb = {
    _test: {
      get lastUpdateSetData() { return lastUpdateSetData; },
      get syncTicketCalled() { return syncTicketCalled; },
      get syncTicketNewState() { return syncTicketNewState; },
      get insertedReactivo() { return insertedReactivo; },
    },
    select: (..._args: unknown[]) => ({
      from: (table: unknown) => ({
        where: (..._whereArgs: unknown[]) => ({
          limit: (_n: number) => {
            // Determine which table is being queried based on the table reference
            // We use duck-typing: if the config has a reactivo, return it for the first select,
            // etc. In practice, the service queries reactivos first, then formVersions, then tickets.
            // Since we can't easily distinguish tables in a mock, we use the call order.
            return Promise.resolve([]);
          },
        }),
        innerJoin: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
            offset: () => ({ orderBy: () => Promise.resolve([]) }),
          }),
        }),
      }),
    }),
    update: (_table: unknown) => ({
      set: (data: unknown) => ({
        where: (..._whereArgs: unknown[]) => ({
          returning: () => {
            lastUpdateSetData = data;
            if (reactivo) {
              const updated = { ...reactivo, ...(data as object) };
              return Promise.resolve([updated]);
            }
            return Promise.resolve([]);
          },
        }),
      }),
    }),
    insert: (_table: unknown) => ({
      values: (values: unknown) => ({
        returning: () => {
          const now = new Date();
          const newRow = {
            id: 'new-reactivo-id',
            parentReactivoId: null,
            attemptNumber: 1,
            state: 'pendiente',
            responses: {},
            rejectionReason: null,
            fechaProgramada: null,
            clienteNombre: null,
            createdAt: now,
            updatedAt: now,
            ...(values as object),
          } as MockReactivoRow;
          insertedReactivo = newRow;
          config.onInsert?.(_table, values);
          return Promise.resolve([newRow]);
        },
      }),
    }),
  };

  // We need a more sophisticated mock that handles sequential calls to different tables.
  // The submit method does:
  //   1. db.select().from(reactivos).where(...).limit(1)  → return reactivo
  //   2. db.select().from(formVersions).where(...).limit(1) → return formVersion
  //   3. db.update(reactivos).set(...).where(...).returning() → return updated reactivo
  //   4. syncTicketState → db.select().from(tickets).where(...).limit(1) → return ticket
  //                        db.update(tickets).set(...).where(...)
  // The reapply method does:
  //   1. db.select().from(reactivos).where(...).limit(1) → return parent reactivo
  //   2. db.select().from(formAssignments).where(...).limit(1) → return assignment
  //   3. db.select().from(formVersions).where(...).limit(1) → return formVersion
  //   4. db.insert(reactivos).values(...).returning() → return new reactivo

  let selectCallIndex = 0;

  // Override select to track call sequence
  mockDb.select = (..._args: unknown[]) => ({
    from: (_table: unknown) => ({
      where: (..._whereArgs: unknown[]) => ({
        limit: (_n: number) => {
          const callIdx = selectCallIndex++;
          // For submit: call 0 = reactivo, call 1 = formVersion, call 2 = ticket (in syncTicketState)
          // For reapply: call 0 = parent reactivo, call 1 = formAssignment, call 2 = formVersion
          if (callIdx === 0) {
            return Promise.resolve(reactivo ? [reactivo] : []);
          }
          if (callIdx === 1) {
            // Could be formVersion (submit) or formAssignment (reapply)
            if (config.formAssignment !== undefined) {
              // reapply path
              return Promise.resolve(config.formAssignment ? [config.formAssignment] : []);
            }
            return Promise.resolve(formVersion ? [formVersion] : []);
          }
          if (callIdx === 2) {
            // Could be ticket (submit syncTicketState) or formVersion (reapply)
            if (config.formAssignment !== undefined) {
              // reapply path: this is the formVersion query
              return Promise.resolve(formVersion ? [formVersion] : []);
            }
            // submit path: this is the ticket query in syncTicketState
            syncTicketCalled = true;
            if (ticket) {
              syncTicketNewState = 'en_revision';
            }
            return Promise.resolve(ticket ? [ticket] : []);
          }
          return Promise.resolve([]);
        },
      }),
      innerJoin: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    }),
  }) as any;

  // Override update to handle both reactivo update and ticket update
  let updateCallIndex = 0;
  mockDb.update = (_table: unknown) => ({
    set: (data: unknown) => ({
      where: (..._whereArgs: unknown[]) => ({
        returning: () => {
          const callIdx = updateCallIndex++;
          lastUpdateSetData = data;
          config.onUpdate?.(_table, data);
          if (callIdx === 0 && reactivo) {
            // First update is the reactivo
            const updated = { ...reactivo, ...(data as object) };
            return Promise.resolve([updated]);
          }
          return Promise.resolve([]);
        },
        // For ticket update (no returning())
        then: (resolve: (v: unknown) => void) => resolve(undefined),
      }),
    }),
  }) as any;

  // Handle the ticket update in syncTicketState which doesn't use .returning()
  // The syncTicketState calls: db.update(tickets).set({...}).where(...)
  // without .returning(). We handle this by the fact that our where() returns
  // an object that can be used as a promise (thenable) or has returning().

  return mockDb;
}

// --- Helper to build a valid mock config for successful submit ---

function buildSubmitMockConfig(overrides: {
  reactivoId?: string;
  tecnicoId?: string;
  state?: string;
  responses?: unknown;
  formVersionId?: string;
  attemptNumber?: number;
  jsonSchema?: unknown;
} = {}): MockDbConfig {
  const reactivoId = overrides.reactivoId ?? 'reactivo-1';
  const tecnicoId = overrides.tecnicoId ?? 'tecnico-1';
  const formVersionId = overrides.formVersionId ?? 'fv-1';

  return {
    reactivo: {
      id: reactivoId,
      formId: 'form-1',
      formVersionId,
      tecnicoId,
      parentReactivoId: null,
      attemptNumber: overrides.attemptNumber ?? 1,
      state: overrides.state ?? 'pendiente',
      responses: overrides.responses ?? {},
      rejectionReason: null,
      fechaProgramada: null,
      clienteNombre: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    formVersion: {
      id: formVersionId,
      // Accept any object by default (no constraints)
      jsonSchema: overrides.jsonSchema ?? { type: 'object', properties: {}, required: [] },
    },
    ticket: {
      id: 'ticket-1',
      estado: 'pendiente',
      reactivoId,
    },
  };
}

// --- Property Tests ---

describe('ReactivoService.submit — Property-based tests', () => {
  // Feature: ensayo-tecnico, Property 2: Submit persists responses round-trip
  // Validates: Requirements 4.1
  describe('Property 2: Submit persists responses round-trip', () => {
    it('after submit, returned reactivo has responses identical to what was submitted', () => {
      fc.assert(
        fc.property(
          uuidArb,
          responsesArb,
          async (tecnicoId, responses) => {
            const mockConfig = buildSubmitMockConfig({ tecnicoId });
            const mockDb = createMockDb(mockConfig);
            const service = new ReactivoService(mockDb as any);

            const actor: JWTPayload = {
              sub: tecnicoId,
              role: 'tecnico',
              tenantId: 'tenant-1',
              tenantSlug: 'test',
              iat: 1700000000,
              exp: 1800000000,
              jti: 'jti-1',
            };

            const result = await service.submit('reactivo-1', responses, actor);

            // The returned reactivo must have the exact same responses
            expect(result.responses).toEqual(responses);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // Feature: ensayo-tecnico, Property 3: Submit transitions state to en_revision
  // Validates: Requirements 4.2
  describe('Property 3: Submit transitions state to en_revision', () => {
    it('after submit, returned state is en_revision', () => {
      fc.assert(
        fc.property(
          uuidArb,
          responsesArb,
          async (tecnicoId, responses) => {
            const mockConfig = buildSubmitMockConfig({ tecnicoId });
            const mockDb = createMockDb(mockConfig);
            const service = new ReactivoService(mockDb as any);

            const actor: JWTPayload = {
              sub: tecnicoId,
              role: 'tecnico',
              tenantId: 'tenant-1',
              tenantSlug: 'test',
              iat: 1700000000,
              exp: 1800000000,
              jti: 'jti-1',
            };

            const result = await service.submit('reactivo-1', responses, actor);

            expect(result.state).toBe('en_revision');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // Feature: ensayo-tecnico, Property 4: Access control rejects unauthorized users
  // Validates: Requirements 5.1, 5.2, 5.3
  describe('Property 4: Access control rejects unauthorized users', () => {
    it('non-tecnico roles get UNAUTHORIZED_ROLE error', () => {
      fc.assert(
        fc.property(
          nonTecnicoActorArb,
          responsesArb,
          async (actor, responses) => {
            const mockConfig = buildSubmitMockConfig({ tecnicoId: 'someone-else' });
            const mockDb = createMockDb(mockConfig);
            const service = new ReactivoService(mockDb as any);

            try {
              await service.submit('reactivo-1', responses, actor);
              // Should not reach here
              expect.fail('Expected ReactivoError to be thrown');
            } catch (err) {
              expect(err).toBeInstanceOf(ReactivoError);
              const error = err as ReactivoError;
              expect(error.statusCode).toBe(403);
              expect(error.code).toBe(ReactivoErrorCode.UNAUTHORIZED_ROLE);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('tecnico with wrong ID gets NOT_OWNER error', () => {
      fc.assert(
        fc.property(
          uuidArb,
          uuidArb,
          responsesArb,
          async (ownerTecnicoId, differentTecnicoId, responses) => {
            // Ensure the IDs are actually different
            fc.pre(ownerTecnicoId !== differentTecnicoId);

            const mockConfig = buildSubmitMockConfig({ tecnicoId: ownerTecnicoId });
            const mockDb = createMockDb(mockConfig);
            const service = new ReactivoService(mockDb as any);

            const actor: JWTPayload = {
              sub: differentTecnicoId,
              role: 'tecnico',
              tenantId: 'tenant-1',
              tenantSlug: 'test',
              iat: 1700000000,
              exp: 1800000000,
              jti: 'jti-1',
            };

            try {
              await service.submit('reactivo-1', responses, actor);
              expect.fail('Expected ReactivoError to be thrown');
            } catch (err) {
              expect(err).toBeInstanceOf(ReactivoError);
              const error = err as ReactivoError;
              expect(error.statusCode).toBe(403);
              expect(error.code).toBe(ReactivoErrorCode.NOT_OWNER);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // Feature: ensayo-tecnico, Property 5: State guard rejects non-pendiente reactivos
  // Validates: Requirements 5.4
  describe('Property 5: State guard rejects non-pendiente reactivos', () => {
    it('reactivos in states other than pendiente get INVALID_STATE_FOR_SUBMIT', () => {
      fc.assert(
        fc.property(
          uuidArb,
          nonPendienteStateArb,
          responsesArb,
          async (tecnicoId, state, responses) => {
            const mockConfig = buildSubmitMockConfig({ tecnicoId, state });
            const mockDb = createMockDb(mockConfig);
            const service = new ReactivoService(mockDb as any);

            const actor: JWTPayload = {
              sub: tecnicoId,
              role: 'tecnico',
              tenantId: 'tenant-1',
              tenantSlug: 'test',
              iat: 1700000000,
              exp: 1800000000,
              jti: 'jti-1',
            };

            try {
              await service.submit('reactivo-1', responses, actor);
              expect.fail('Expected ReactivoError to be thrown');
            } catch (err) {
              expect(err).toBeInstanceOf(ReactivoError);
              const error = err as ReactivoError;
              expect(error.statusCode).toBe(403);
              expect(error.code).toBe(ReactivoErrorCode.INVALID_STATE_FOR_SUBMIT);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// Feature: ensayo-tecnico, Property 6: Reapply preserves lineage and metadata
// Validates: Requirements 7.1, 7.2
describe('ReactivoService.reapply — Property-based tests', () => {
  describe('Property 6: Reapply preserves lineage and metadata', () => {
    it('new reactivo has parentReactivoId set, attemptNumber incremented, state=pendiente', () => {
      fc.assert(
        fc.property(
          uuidArb,
          uuidArb,
          attemptNumberArb,
          responsesArb,
          async (tecnicoId, parentId, attemptNumber, responses) => {
            // Mock a rejected parent reactivo
            const parentReactivo: MockReactivoRow = {
              id: parentId,
              formId: 'form-1',
              formVersionId: 'fv-1',
              tecnicoId,
              parentReactivoId: null,
              attemptNumber,
              state: 'rechazado',
              responses: { old: 'data' },
              rejectionReason: 'Datos incompletos',
              fechaProgramada: null,
              clienteNombre: 'Cliente Test',
              createdAt: new Date('2024-01-01'),
              updatedAt: new Date('2024-01-01'),
            };

            const mockConfig: MockDbConfig = {
              reactivo: parentReactivo,
              formVersion: {
                id: 'fv-1',
                jsonSchema: { type: 'object', properties: {}, required: [] },
              },
              ticket: null,
              formAssignment: { formId: 'form-1', tecnicoId, isActive: true },
            };

            const mockDb = createMockDb(mockConfig);
            const service = new ReactivoService(mockDb as any);

            const actor: JWTPayload = {
              sub: tecnicoId,
              role: 'tecnico',
              tenantId: 'tenant-1',
              tenantSlug: 'test',
              iat: 1700000000,
              exp: 1800000000,
              jti: 'jti-1',
            };

            const result = await service.reapply(parentId, responses, actor);

            // Verify lineage
            expect(result.parentReactivoId).toBe(parentId);
            expect(result.attemptNumber).toBe(attemptNumber + 1);
            expect(result.state).toBe('pendiente');
            // Verify copied fields
            expect(result.formId).toBe(parentReactivo.formId);
            expect(result.formVersionId).toBe(parentReactivo.formVersionId);
            expect(result.tecnicoId).toBe(tecnicoId);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// Feature: ensayo-tecnico, Property 7: Submit creates audit trail (syncTicketState)
// Validates: Requirements 8.5
describe('ReactivoService.submit — Audit trail', () => {
  describe('Property 7: Submit triggers syncTicketState', () => {
    it('after a successful submit, syncTicketState is called with en_revision state', () => {
      fc.assert(
        fc.property(
          uuidArb,
          responsesArb,
          async (tecnicoId, responses) => {
            let ticketUpdateCalled = false;
            let ticketUpdateData: unknown = null;

            const mockConfig = buildSubmitMockConfig({ tecnicoId });

            // Create a custom mock that tracks the ticket sync
            const mockDb = createMockDb(mockConfig);

            // Override update to track ticket state sync
            let updateCallCount = 0;
            const originalUpdate = mockDb.update.bind(mockDb);
            (mockDb as any).update = (_table: unknown) => ({
              set: (data: unknown) => ({
                where: (..._whereArgs: unknown[]) => {
                  const callIdx = updateCallCount++;
                  if (callIdx === 0) {
                    // First update: reactivo state/responses update
                    const reactivo = mockConfig.reactivo!;
                    return {
                      returning: () => Promise.resolve([{ ...reactivo, ...(data as object) }]),
                    };
                  }
                  // Second update: ticket state sync
                  ticketUpdateCalled = true;
                  ticketUpdateData = data;
                  return {
                    returning: () => Promise.resolve([]),
                    then: (resolve: (v: unknown) => void) => resolve(undefined),
                  };
                },
              }),
            });

            const service = new ReactivoService(mockDb as any);

            const actor: JWTPayload = {
              sub: tecnicoId,
              role: 'tecnico',
              tenantId: 'tenant-1',
              tenantSlug: 'test',
              iat: 1700000000,
              exp: 1800000000,
              jti: 'jti-1',
            };

            await service.submit('reactivo-1', responses, actor);

            // Verify that the ticket state was synced
            expect(ticketUpdateCalled).toBe(true);
            expect(ticketUpdateData).toMatchObject({
              estado: 'en_revision',
            });
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
