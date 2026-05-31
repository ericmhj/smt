import { randomBytes, createHmac } from 'node:crypto';

// --- Helmet Configuration ---

export const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for Swagger UI
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' as const },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' as const },
};

// --- Rate Limit Configuration ---

export const globalRateLimitConfig = {
  max: 100,
  timeWindow: '1 minute',
};

export const authRateLimitConfig = {
  max: 5,
  timeWindow: '1 minute',
};

// --- CSRF Helpers ---

const CSRF_SECRET = process.env.CSRF_SECRET || 'sgr-csrf-default-secret';

/**
 * Generate a CSRF token.
 */
export function generateCsrfToken(): string {
  const salt = randomBytes(16).toString('hex');
  const hmac = createHmac('sha256', CSRF_SECRET).update(salt).digest('hex');
  return `${salt}.${hmac}`;
}

/**
 * Validate a CSRF token.
 */
export function validateCsrfToken(token: string): boolean {
  if (!token || !token.includes('.')) {
    return false;
  }

  const [salt, hmac] = token.split('.');
  if (!salt || !hmac) {
    return false;
  }

  const expectedHmac = createHmac('sha256', CSRF_SECRET).update(salt).digest('hex');
  return hmac === expectedHmac;
}
