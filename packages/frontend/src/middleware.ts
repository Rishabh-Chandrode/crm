import { NextRequest, NextResponse } from 'next/server';
import { postLoginPath } from './lib/shareTarget';

const PUBLIC_PATHS = ['/login', '/signup', '/manifest.webmanifest', '/sw.js'];

export function middleware(request: NextRequest): NextResponse {
  const token = request.cookies.get('crm_token')?.value;
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!token && !isPublic) {
    const loginUrl = new URL('/login', request.url);
    if (pathname === '/share') {
      loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (token && (pathname === '/login' || pathname === '/signup')) {
    const next = pathname === '/login' ? request.nextUrl.searchParams.get('next') : null;
    return NextResponse.redirect(new URL(postLoginPath(next), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
