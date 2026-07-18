import { describe, expect, it } from 'vitest';
import { extractSubdomainSlug, resolveTenantSlug } from './tenant-resolver.js';

describe('extractSubdomainSlug', () => {
  it('returns slug from {slug}.localhost', () => {
    expect(extractSubdomainSlug('acme.localhost')).toBe('acme');
  });

  it('returns slug from {slug}.localhost with port', () => {
    expect(extractSubdomainSlug('acme.localhost:3001')).toBe('acme');
  });

  it('returns slug from {slug}.domain.tld (3+ parts)', () => {
    expect(extractSubdomainSlug('acme.example.com')).toBe('acme');
  });

  it('returns slug from {slug}.domain.tld with port', () => {
    expect(extractSubdomainSlug('acme.example.com:443')).toBe('acme');
  });

  it('returns null for bare localhost', () => {
    expect(extractSubdomainSlug('localhost')).toBeNull();
  });

  it('returns null for localhost with port', () => {
    expect(extractSubdomainSlug('localhost:3001')).toBeNull();
  });

  it('returns null for 127.0.0.1', () => {
    expect(extractSubdomainSlug('127.0.0.1')).toBeNull();
  });

  it('returns null for 127.0.0.1 with port', () => {
    expect(extractSubdomainSlug('127.0.0.1:3001')).toBeNull();
  });

  it('returns null for two-segment domain without localhost (e.g. example.com)', () => {
    expect(extractSubdomainSlug('example.com')).toBeNull();
  });
});

describe('resolveTenantSlug', () => {
  function mockRequest(headers: Record<string, string | undefined>) {
    return { headers } as any;
  }

  it('returns X-Tenant-Slug header when present', () => {
    const req = mockRequest({
      'x-tenant-slug': 'custom-tenant',
      host: 'acme.localhost:3001',
    });
    expect(resolveTenantSlug(req)).toBe('custom-tenant');
  });

  it('trims whitespace from X-Tenant-Slug header', () => {
    const req = mockRequest({
      'x-tenant-slug': '  my-org  ',
      host: 'localhost',
    });
    expect(resolveTenantSlug(req)).toBe('my-org');
  });

  it('ignores empty X-Tenant-Slug and falls back to Host subdomain', () => {
    const req = mockRequest({
      'x-tenant-slug': '',
      host: 'acme.localhost:3001',
    });
    expect(resolveTenantSlug(req)).toBe('acme');
  });

  it('ignores whitespace-only X-Tenant-Slug and falls back to Host subdomain', () => {
    const req = mockRequest({
      'x-tenant-slug': '   ',
      host: 'acme.example.com',
    });
    expect(resolveTenantSlug(req)).toBe('acme');
  });

  it('extracts subdomain from Host when no X-Tenant-Slug header', () => {
    const req = mockRequest({
      host: 'tenant1.localhost:3001',
    });
    expect(resolveTenantSlug(req)).toBe('tenant1');
  });

  it('extracts subdomain from Host with full domain', () => {
    const req = mockRequest({
      host: 'clinic.sgr.example.com',
    });
    expect(resolveTenantSlug(req)).toBe('clinic');
  });

  it('returns "default" when Host is bare localhost', () => {
    const req = mockRequest({
      host: 'localhost:3001',
    });
    expect(resolveTenantSlug(req)).toBe('default');
  });

  it('returns "default" when no relevant headers are present', () => {
    const req = mockRequest({});
    expect(resolveTenantSlug(req)).toBe('default');
  });

  it('X-Tenant-Slug takes priority over Host subdomain', () => {
    const req = mockRequest({
      'x-tenant-slug': 'header-tenant',
      host: 'host-tenant.example.com',
    });
    expect(resolveTenantSlug(req)).toBe('header-tenant');
  });
});
