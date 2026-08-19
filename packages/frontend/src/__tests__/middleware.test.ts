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
});
