import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('Backend API Endpoints', () => {
  it('GET /health returns status ok with timestamp', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('Protected /api routes reject unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/prospects');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Unauthorized');
  });

  it('Protected /api/companies rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/companies');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Unauthorized');
  });
});
