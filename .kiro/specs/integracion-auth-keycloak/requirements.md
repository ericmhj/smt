# Requirements Document

## Introduction

This document specifies the requirements for Phase 1 of the 4-module integration plan: migrating SGR (Sistema de Gestión de Ensayos) from self-issued JWT authentication to Keycloak-based authentication. The scope includes backend JWT validation migration, frontend OIDC login flow, role mapping between Keycloak Organization roles and SGR internal roles, tenant resolution from Keycloak Organization attributes, APISIX gateway configuration, and backward compatibility during the transition period.

## Glossary

- **SGR**: Sistema de Gestión de Ensayos — Fastify/Node.js backend and Next.js frontend application for managing laboratory tests
- **Keycloak**: Open-source identity provider acting as the single source of authentication for all services
- **APISIX**: API Gateway that sits in front of all services, validates JWT tokens, and routes requests
- **License_Service**: Spring Boot service managing contracts, credits, and billing — already validates Keycloak JWT
- **JWKS_Endpoint**: JSON Web Key Set endpoint exposed by Keycloak containing the public keys used to verify JWT signatures
- **KC_Organization**: Keycloak Organization representing a tenant, with attributes (tenantId, tenantSlug) and assigned roles
- **OIDC**: OpenID Connect — protocol used by the frontend to authenticate users via Keycloak
- **Protocol_Mapper**: Keycloak configuration that maps user/organization attributes into JWT claims
- **Auth_Middleware**: Fastify preHandler hook in SGR that extracts and validates JWT from the Authorization header
- **Role_Mapper**: Component responsible for translating Keycloak Organization roles into SGR internal roles
- **Tenant_Context**: SGR request-scoped object containing tenantId, tenantSlug, and schemaName resolved from the JWT
- **Access_Token**: Short-lived JWT issued by Keycloak used to authenticate API requests
- **Refresh_Token**: Long-lived token managed by Keycloak used to obtain new Access_Tokens without re-authentication

## Requirements

### Requirement 1: JWKS-Based Token Verification

**User Story:** As a platform developer, I want SGR to validate JWT tokens against the Keycloak JWKS endpoint, so that a single identity provider controls authentication for all services.

#### Acceptance Criteria

1. WHEN an authenticated request arrives, THE Auth_Middleware SHALL verify the JWT signature using public keys fetched from the Keycloak JWKS_Endpoint
2. THE Auth_Middleware SHALL cache the JWKS public keys in memory and refresh them when a key ID in the token header is not found in the cache
3. THE Auth_Middleware SHALL validate the token issuer claim matches the configured Keycloak realm URL
4. THE Auth_Middleware SHALL validate the token audience claim contains the SGR client identifier
5. THE Auth_Middleware SHALL reject tokens with expired `exp` claims by returning HTTP 401 with code `AUTH_002`
6. THE Auth_Middleware SHALL reject tokens with invalid signatures by returning HTTP 401 with code `AUTH_003`
7. IF the JWKS_Endpoint is unreachable, THEN THE Auth_Middleware SHALL use the last cached keys for validation and log a warning

### Requirement 2: Keycloak Claims Extraction

**User Story:** As a platform developer, I want SGR to extract user identity and tenant information from Keycloak JWT claims, so that the system can resolve user context without querying the database on every request.

#### Acceptance Criteria

1. WHEN a valid token is verified, THE Auth_Middleware SHALL extract the following claims: `sub`, `email`, `name`, `realm_access.roles`, `organization.id`, `organization.attributes.tenantId`, `organization.attributes.tenantSlug`
2. THE Auth_Middleware SHALL populate the `request.user` object with the extracted claims in a format compatible with existing SGR route handlers
3. IF the token is missing the `organization.attributes.tenantId` claim, THEN THE Auth_Middleware SHALL return HTTP 403 with code `TENANT_NOT_RESOLVED`
4. IF the token contains an unrecognized claim structure, THEN THE Auth_Middleware SHALL return HTTP 401 with code `AUTH_003` and a descriptive message

### Requirement 3: Role Mapping

**User Story:** As a platform administrator, I want Keycloak Organization roles to map automatically to SGR internal roles, so that users have correct permissions without manual configuration.

#### Acceptance Criteria

1. WHEN a token is verified, THE Role_Mapper SHALL translate Keycloak roles to SGR roles using the following mapping: `ADMIN_CUENTA` → `admin`, `SUPERVISOR` → `manager`, `TECNICO` → `tecnico`, `ASISTENTE` → `asistente`
2. WHEN a token contains the Keycloak realm role `PLATFORM_ADMIN`, THE Role_Mapper SHALL assign the SGR role `platform_admin`
3. THE Role_Mapper SHALL read the role mapping configuration from an external configuration source (environment variable or configuration file)
4. IF a token contains only roles that have no mapping entry, THEN THE Role_Mapper SHALL reject the request with HTTP 403 and code `AUTH_005`
5. WHEN a token contains multiple mapped roles, THE Role_Mapper SHALL assign the role with the highest privilege level according to the hierarchy: `platform_admin` > `admin` > `manager` > `tecnico` > `asistente`
6. THE Role_Mapper SHALL parse roles from the `realm_access.roles` claim and from the Organization-scoped roles claim

### Requirement 4: Tenant Resolution from JWT

**User Story:** As a platform developer, I want SGR to resolve tenant context directly from the Keycloak JWT claims, so that multi-tenant schema isolation works seamlessly with Keycloak tokens.

#### Acceptance Criteria

1. WHEN a valid token with organization attributes is verified, THE Tenant_Context SHALL be populated with `tenantId` and `tenantSlug` from the JWT organization attributes
2. THE Tenant_Context SHALL use the resolved `tenantSlug` to set the PostgreSQL `search_path` to `sgr_{tenantSlug}, public`
3. WHEN the JWT `tenantSlug` does not match any existing tenant in the database, THE Auth_Middleware SHALL return HTTP 404 with code `TENANT_NOT_FOUND`
4. THE Tenant_Context resolution SHALL maintain backward compatibility with the existing `X-Tenant-Slug` header fallback for non-JWT routes

### Requirement 5: Frontend OIDC Login Flow

**User Story:** As a user, I want to authenticate through the Keycloak login page, so that I have a single sign-on experience across all platform services.

#### Acceptance Criteria

1. WHEN a user navigates to a protected route without a valid token, THE Frontend SHALL redirect the browser to the Keycloak OIDC authorization endpoint
2. WHEN Keycloak returns an authorization code via redirect, THE Frontend SHALL exchange the code for tokens using the token endpoint
3. THE Frontend SHALL store the Access_Token and Refresh_Token in memory (not localStorage) for improved security
4. THE Frontend SHALL include the Access_Token as a Bearer token in the Authorization header of all API requests
5. WHEN the Access_Token expires, THE Frontend SHALL use the Refresh_Token to obtain a new Access_Token transparently without user interaction
6. WHEN the Refresh_Token expires or refresh fails, THE Frontend SHALL redirect the user to the Keycloak login page
7. WHEN the user clicks logout, THE Frontend SHALL call the Keycloak end-session endpoint and clear all local token state
8. THE Frontend SHALL decode the Access_Token to extract user role, name, email, and tenantSlug for display and route-guard purposes

### Requirement 6: SGR Login Endpoint Deprecation

**User Story:** As a platform developer, I want to remove the SGR custom login endpoint, so that all authentication flows go through Keycloak and we eliminate redundant credential management.

#### Acceptance Criteria

1. WHILE the transition period is active, THE SGR Backend SHALL accept both self-issued tokens (verified with the existing RSA public key) and Keycloak-issued tokens (verified via JWKS)
2. WHEN a dual-verification request fails both verification methods, THE Auth_Middleware SHALL return HTTP 401 with code `AUTH_003`
3. WHEN the transition period ends (configurable via environment variable), THE Auth_Middleware SHALL reject self-issued tokens and only accept Keycloak tokens
4. THE SGR Backend SHALL remove the `POST /api/auth/login` and `POST /api/auth/refresh` endpoints after the transition period
5. WHILE the transition period is active, THE `POST /api/auth/login` endpoint SHALL return HTTP 301 redirecting to the Keycloak login URL with appropriate OIDC parameters

### Requirement 7: Token Refresh via Keycloak

**User Story:** As a user, I want my session to remain active without re-entering credentials, so that I can work without interruption for extended periods.

#### Acceptance Criteria

1. THE Frontend SHALL refresh the Access_Token using the Keycloak token endpoint before the token `exp` claim minus a configurable buffer (default 30 seconds)
2. WHEN a refresh request fails with HTTP 400 or 401, THE Frontend SHALL clear the session and redirect to Keycloak login
3. THE SGR Backend SHALL NOT implement any token refresh logic — it SHALL only validate Access_Tokens
4. THE Frontend SHALL handle concurrent requests during token refresh by queuing API calls until the new token is available

### Requirement 8: APISIX Gateway Configuration

**User Story:** As a platform operator, I want APISIX to route and protect all services behind a single domain, so that clients access a unified API surface with centralized authentication.

#### Acceptance Criteria

1. THE APISIX Gateway SHALL route requests with path `/api/sgr/*` to the SGR Backend service on port 3001
2. THE APISIX Gateway SHALL route requests with path `/api/license/*` to the License_Service on port 8080
3. THE APISIX Gateway SHALL route requests with path `/auth/*` to Keycloak on port 8180
4. THE APISIX Gateway SHALL validate the JWT signature on all routes except those matching `/auth/*` and configured public paths
5. THE APISIX Gateway SHALL use the Keycloak JWKS_Endpoint to obtain validation keys
6. THE APISIX Gateway SHALL pass the validated JWT through to upstream services in the Authorization header
7. THE APISIX Gateway SHALL extract the `tenantSlug` from the JWT claims and inject it as the `X-Tenant-Slug` header to upstream services
8. IF a request to a protected route lacks a valid JWT, THEN THE APISIX Gateway SHALL return HTTP 401 before the request reaches any upstream service

### Requirement 9: Keycloak Realm Configuration

**User Story:** As a platform administrator, I want a Keycloak realm configured with Organizations and proper role definitions, so that tenant isolation and role-based access work across all services.

#### Acceptance Criteria

1. THE Keycloak Realm SHALL have the Organizations feature enabled
2. THE Keycloak Realm SHALL define the following realm-level roles: `PLATFORM_ADMIN`
3. THE Keycloak Realm SHALL define the following Organization-level roles: `ADMIN_CUENTA`, `SUPERVISOR`, `TECNICO`, `ASISTENTE`
4. THE Keycloak Realm SHALL have a client configured for SGR with the following settings: confidential access type, authorization code flow enabled, valid redirect URIs matching the SGR frontend domain
5. THE Keycloak Realm SHALL have a client configured for the License_Service with service-account access for admin API calls

### Requirement 10: Protocol Mappers for JWT Claims

**User Story:** As a platform developer, I want the Keycloak JWT to include tenantId and tenantSlug claims, so that downstream services can resolve tenant context without additional database lookups.

#### Acceptance Criteria

1. THE Keycloak Realm SHALL include a Protocol_Mapper that adds the Organization `tenantId` attribute to the Access_Token as the `tenantId` claim
2. THE Keycloak Realm SHALL include a Protocol_Mapper that adds the Organization `tenantSlug` attribute to the Access_Token as the `tenantSlug` claim
3. THE Keycloak Realm SHALL include a Protocol_Mapper that adds the user's Organization roles to the Access_Token as the `org_roles` claim
4. THE Keycloak Realm SHALL include a Protocol_Mapper that adds the user's email as the `email` claim in the Access_Token
5. WHEN a user belongs to multiple Organizations, THE Protocol_Mapper SHALL include claims only for the Organization matching the requested audience or login context

### Requirement 11: Backward Compatibility During Transition

**User Story:** As a platform developer, I want existing SGR tokens to remain valid during the migration period, so that active users are not disrupted.

#### Acceptance Criteria

1. WHILE the transition period is active, THE Auth_Middleware SHALL first attempt to verify the token against the Keycloak JWKS_Endpoint
2. IF JWKS verification fails, THEN THE Auth_Middleware SHALL attempt to verify the token using the existing SGR RSA public key
3. WHEN a legacy SGR token is verified successfully, THE Auth_Middleware SHALL populate `request.user` with the same structure as a Keycloak-verified token (sub, role, tenantId, tenantSlug)
4. THE transition period SHALL be controlled by the environment variable `AUTH_LEGACY_ENABLED` (default: `true`)
5. WHEN `AUTH_LEGACY_ENABLED` is set to `false`, THE Auth_Middleware SHALL only verify tokens against the Keycloak JWKS_Endpoint
