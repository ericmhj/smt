import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/login', '/api/auth', '/acceso-denegado'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get('host') || '';

  // Allow public paths, static files, and favicon
  if (
    publicPaths.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // Check for sgr-token cookie
  const token = request.cookies.get('sgr-token')?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Tenant isolation: localhost (no subdomain) is only for platform_admin
  const hostWithoutPort = hostname.split(':')[0] || '';
  const isBareDomain = hostWithoutPort === 'localhost' || hostWithoutPort === '127.0.0.1';

  if (isBareDomain && pathname.startsWith('/platform')) {
    // Allow platform routes on bare localhost (requires platform_admin — checked by layout)
    return NextResponse.next();
  }

  if (isBareDomain && pathname.startsWith('/admin')) {
    // Allow admin routes on bare localhost
    return NextResponse.next();
  }

  if (isBareDomain) {
    // Bare localhost with a non-platform/admin path → decode JWT to check role
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        // Check roles in multiple possible locations (Keycloak varies)
        const roles = payload.roles || payload.realm_access?.roles || [];
        const isPlatformAdmin = roles.includes('platform_admin');
        if (!isPlatformAdmin) {
          // Tenant user trying to access bare localhost → deny
          return NextResponse.redirect(new URL('/acceso-denegado', request.url));
        }
      }
    } catch {
      // Can't decode token — let the backend handle auth
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
