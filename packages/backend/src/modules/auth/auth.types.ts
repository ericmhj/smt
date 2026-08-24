export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    tenantId: string;
    tenantSlug: string;
  };
}

export interface JWTPayload {
  sub: string;
  role: string;
  tenantId: string;
  tenantSlug: string;
  iat: number;
  exp: number;
  jti: string;
  formSessionScope?: string; // When set, restricts access to only this form's endpoints
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface RefreshDTO {
  refreshToken: string;
}

export enum AuthErrorCode {
  INVALID_CREDENTIALS = 'AUTH_001',
  TOKEN_EXPIRED = 'AUTH_002',
  TOKEN_INVALID = 'AUTH_003',
  SESSION_REVOKED = 'AUTH_004',
  INSUFFICIENT_PERMISSIONS = 'AUTH_005',
}
