/**
 * Route utilities for post-login redirect and role-based navigation.
 * Re-exports from guards.ts for convenience.
 *
 * Validates: Requirements 4.3
 */
export { getDefaultRoute, canAccessRoute } from './guards';
export type { Role } from './guards';
