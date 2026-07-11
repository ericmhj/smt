# Implementation Tasks

## Task 1: Backend — Submit endpoint
- [x] 1.1 Add `submit` method to `ReactivoService` that validates role, ownership, state, schema, persists responses, transitions state, creates state_transition record, and syncs ticket
- [x] 1.2 Add `submitReactivoSchema` Zod schema in `reactivo.schemas.ts` for request body validation (`{ responses: z.record(z.unknown()) }`)
- [x] 1.3 Add POST `/api/reactivos/:id/submit` route in `reactivo.routes.ts` with `requireRole(['tecnico'])` preHandler
- [x] 1.4 Add new error codes in `reactivo.errors.ts`: `UNAUTHORIZED_ROLE`, `NOT_OWNER`, `INVALID_STATE_FOR_SUBMIT`
- [x] 1.5 Add `GET /api/reactivos/:id/form` route that returns `{ sanitizedHtml, jsonSchema, fieldsMetadata }` from the associated form_version

## Task 2: Backend — Property-based tests for submit
- [x] 2.1 Set up fast-check dependency in backend package.json (if not already present)
- [x] 2.2 Write property test: schema validation correctness (generate random schemas + responses, verify validateResponses accepts valid and rejects invalid with field-specific errors)
- [ ] 2.3 Write property test: submit persists responses round-trip (generate valid responses, submit, query, compare)
- [ ] 2.4 Write property test: submit transitions state to en_revision
- [ ] 2.5 Write property test: access control rejects unauthorized users (generate users with wrong role or wrong ID)
- [ ] 2.6 Write property test: state guard rejects non-pendiente reactivos
- [ ] 2.7 Write property test: reapply preserves lineage and metadata (generate rejected reactivos, reapply, verify parent link + attemptNumber + copied fields)
- [ ] 2.8 Write property test: submit creates audit trail in state_transitions

## Task 3: Frontend — EnsayoFormModal component
- [x] 3.1 Create `EnsayoFormModal` component that renders sanitized HTML inside a form wrapper, injects initial values, and collects FormData on submit
- [x] 3.2 Add loading state, submit button, and cancel button to the modal
- [x] 3.3 Implement POST /api/reactivos/:id/submit call and handle success (close modal, trigger onSubmitSuccess callback)
- [x] 3.4 Implement error handling: display field-specific validation errors from 400 response, show toast for 403/404/network errors

## Task 4: Frontend — RejectionInfoModal component
- [x] 4.1 Create `RejectionInfoModal` component that displays the rejection reason and a "Re-enviar ensayo" button
- [x] 4.2 Implement reapply flow: call POST /api/reactivos/:id/reapply, then open EnsayoFormModal pre-filled with parent's responses

## Task 5: Frontend — Update MyKanbanPage card click behavior
- [x] 5.1 Refactor `handleCardClick` to branch by card state: pendiente → fetch form data + open EnsayoFormModal, rechazado → fetch detail + open RejectionInfoModal, others → existing PDF viewer behavior
- [x] 5.2 Add state management for active modal (ensayo form, rejection info, or PDF viewer) and the associated reactivo data
- [x] 5.3 Add kanban refresh after successful submit (re-fetch board data so card moves columns)
- [x] 5.4 Add success toast notification after successful submit

## Task 6: Backend — Unit and integration tests
- [ ] 6.1 Write unit tests for submit endpoint: successful submit returns 200 with updated reactivo, 404 for missing reactivo, 400 for invalid body
- [ ] 6.2 Write integration test: full flow ticket → reactivo → submit → verify ticket state synced
- [ ] 6.3 Write integration test: submit → GET /api/reactivos/:id/pdf returns valid PDF buffer
