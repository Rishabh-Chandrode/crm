import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

describe('Next.js Route Protection & Session Middleware', () => {
  it('redirects unauthenticated user accessing protected route (/dashboard) to /login', () => {
    const req = new NextRequest('http://localhost:3000/dashboard');
    const res = middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/login');
  });

  it('allows unauthenticated user accessing public route (/login)', () => {
    const req = new NextRequest('http://localhost:3000/login');
    const res = middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects authenticated user on /login to /dashboard', () => {
    const req = new NextRequest('http://localhost:3000/login');
    req.cookies.set('crm_token', 'valid-jwt-token');
    const res = middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/dashboard');
  });

  it('allows authenticated user accessing protected route (/prospects)', () => {
    const req = new NextRequest('http://localhost:3000/prospects');
    req.cookies.set('crm_token', 'valid-jwt-token');
    const res = middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('lets anonymous requests load the web manifest and service worker', () => {
    for (const path of ['/manifest.webmanifest', '/sw.js']) {
      const res = middleware(new NextRequest(`http://localhost:3000${path}`));
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    }
  });

  it('keeps the shared query when sending an anonymous /share visit to login', () => {
    const req = new NextRequest('http://localhost:3000/share?url=https%3A%2F%2Fexample.com%2Fjob&title=Engineer');
    const res = middleware(req);
    const location = new URL(res.headers.get('location') ?? '');

    expect(res.status).toBe(307);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/share?url=https%3A%2F%2Fexample.com%2Fjob&title=Engineer');
  });

  it('keeps ampersands inside a shared job url when redirecting to login', () => {
    const req = new NextRequest('http://localhost:3000/share?url=https%3A%2F%2Fexample.com%2Fjob%3Fsrc%3D1%26ref%3D2');
    const res = middleware(req);
    const location = new URL(res.headers.get('location') ?? '');

    expect(location.searchParams.get('next')).toBe('/share?url=https%3A%2F%2Fexample.com%2Fjob%3Fsrc%3D1%26ref%3D2');
  });

  it('sends an authenticated login with a safe next path back to that path', () => {
    const req = new NextRequest('http://localhost:3000/login?next=%2Fshare%3Furl%3Dhttps%3A%2F%2Fjobs.example%2F1');
    req.cookies.set('crm_token', 'valid-jwt-token');
    const res = middleware(req);
    const location = new URL(res.headers.get('location') ?? '');

    expect(res.status).toBe(307);
    expect(`${location.pathname}${location.search}`).toBe('/share?url=https://jobs.example/1');
  });

  it('ignores an external next path on an authenticated login', () => {
    const req = new NextRequest('http://localhost:3000/login?next=https%3A%2F%2Fevil.example');
    req.cookies.set('crm_token', 'valid-jwt-token');
    const res = middleware(req);

    expect(res.headers.get('location')).toBe('http://localhost:3000/dashboard');
  });
});
