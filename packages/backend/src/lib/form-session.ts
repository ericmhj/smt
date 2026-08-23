/**
 * Form Session Token — Cookie-based authentication for rendered forms.
 *
 * Instead of embedding a full JWT in the HTML, the /render endpoint sets
 * an HttpOnly cookie with a signed, scoped token that can only:
 * - Save responses for the specific form
 * - Submit the specific form
 *
 * The token is a JWT signed with the same RSA key, but with limited claims.
 * TTL: 6 hours (supports long capture sessions in the field).
 */

import { SignJWT, jwtVerify, importPKCS8, importSPKI, type KeyLike } from 'jose';
import { loadConfig } from './config.js';

const FORM_SESSION_EXPIRY = '6h';
const COOKIE_NAME = 'sgr-form-session';
const COOKIE_MAX_AGE = 6 * 60 * 60; // 6 hours in seconds

let privateKey: KeyLike | null = null;
let publicKey: KeyLike | null = null;

async function ensureKeys(): Promise<void> {
  if (privateKey && publicKey) return;
  const config = loadConfig();
  privateKey = await importPKCS8(config.jwt.privateKey, 'RS256');
  publicKey = await importSPKI(config.jwt.publicKey, 'RS256');
}

export interface FormSessionPayload {
  sub: string;        // userId
  formId: string;
  tenantSlug: string;
  scope: 'form-session';
}

/**
 * Creates a signed form session token (JWT with limited scope).
 */
export async function createFormSessionToken(
  userId: string,
  formId: string,
  tenantSlug: string,
): Promise<string> {
  await ensureKeys();

  const token = await new SignJWT({
    formId,
    tenantSlug,
    scope: 'form-session',
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(FORM_SESSION_EXPIRY)
    .setIssuer('sgr-form-session')
    .sign(privateKey!);

  return token;
}

/**
 * Verifies a form session token and returns the payload.
 * Returns null if invalid or expired.
 */
export async function verifyFormSessionToken(token: string): Promise<FormSessionPayload | null> {
  await ensureKeys();

  try {
    const { payload } = await jwtVerify(token, publicKey!, {
      issuer: 'sgr-form-session',
    });

    if (payload.scope !== 'form-session') return null;

    return {
      sub: payload.sub as string,
      formId: payload.formId as string,
      tenantSlug: payload.tenantSlug as string,
      scope: 'form-session',
    };
  } catch {
    return null;
  }
}

/**
 * Returns the Set-Cookie header value for a form session.
 */
export function buildFormSessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/api/reactivos; Max-Age=${COOKIE_MAX_AGE}`;
}

/**
 * Returns a Set-Cookie header that clears the form session cookie.
 */
export function clearFormSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/api/reactivos; Max-Age=0`;
}

/**
 * Extracts the form session token from a Cookie header string.
 */
export function extractFormSessionFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1]! : null;
}

export { COOKIE_NAME };
