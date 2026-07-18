import { describe, expect, it } from 'vitest';
import { extractTenantSlug } from './tenant';

describe('extractTenantSlug', () => {
  it('returns slug from {slug}.localhost', () => {
    expect(extractTenantSlug('acme.localhost')).toBe('acme');
  });

  it('returns slug from {slug}.localhost with port', () => {
    expect(extractTenantSlug('acme.localhost:3000')).toBe('acme');
  });

  it('returns slug from {slug}.domain.tld (3+ parts)', () => {
    expect(extractTenantSlug('acme.example.com')).toBe('acme');
  });

  it('returns slug from {slug}.domain.tld with port', () => {
    expect(extractTenantSlug('clinic.sgr.io:443')).toBe('clinic');
  });

  it('returns "default" for bare localhost', () => {
    expect(extractTenantSlug('localhost')).toBe('default');
  });

  it('returns "default" for localhost with port', () => {
    expect(extractTenantSlug('localhost:3000')).toBe('default');
  });

  it('returns "default" for 127.0.0.1', () => {
    expect(extractTenantSlug('127.0.0.1')).toBe('default');
  });

  it('returns "default" for 127.0.0.1 with port', () => {
    expect(extractTenantSlug('127.0.0.1:3000')).toBe('default');
  });

  it('returns "default" for two-segment domain without localhost (e.g. example.com)', () => {
    expect(extractTenantSlug('example.com')).toBe('default');
  });

  it('returns "default" when hostname is undefined (SSR)', () => {
    // Simulates SSR where window is not available and no hostname passed
    expect(extractTenantSlug(undefined)).toBe('default');
  });

  it('returns "default" for empty string', () => {
    expect(extractTenantSlug('')).toBe('default');
  });

  it('handles deeply nested subdomains and returns first segment', () => {
    expect(extractTenantSlug('tenant.app.sgr.example.com')).toBe('tenant');
  });
});
