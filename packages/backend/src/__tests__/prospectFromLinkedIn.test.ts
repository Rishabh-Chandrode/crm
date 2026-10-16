import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app.js';
import { CONFIG } from '../config.js';
import { pool } from '../db/index.js';
import { ApolloProvider } from '../services/enrichment/providers/apollo.js';
import { ProspeoProvider } from '../services/enrichment/providers/prospeo.js';

const PROFILE = 'https://www.linkedin.com/in/jane-doe';
const NORMALIZED = 'https://www.linkedin.com/in/jane-doe';

describe('POST /api/prospects/from-linkedin', () => {
  const userToken = jwt.sign(
    { id: 'user-123', username: 'testuser', role: 'user' },
    CONFIG.jwtSecret,
  );

  beforeEach(() => {
    vi.restoreAllMocks();
    (CONFIG as { prospeoApiKey: string }).prospeoApiKey = 'test-prospeo-key';
    (CONFIG as { apolloApiKey: string }).apolloApiKey = 'test-apollo-key';
    (CONFIG as { activeEnrichmentProvider: string }).activeEnrichmentProvider = 'prospeo';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns 401 when request is not authenticated', async () => {
    const res = await request(app)
      .post('/api/prospects/from-linkedin')
      .send({ linkedin_url: PROFILE });

    expect(res.status).toBe(401);
  });

  it('returns 400 for a LinkedIn job URL', async () => {
    const res = await request(app)
      .post('/api/prospects/from-linkedin')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ linkedin_url: 'https://www.linkedin.com/jobs/view/1' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'A LinkedIn profile URL is required');
  });

  it('returns an existing prospect without calling enrichment', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(pool, 'query').mockResolvedValueOnce({
      rows: [{
        id: 'p-existing',
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@acme.com',
        job_title: 'Recruiter',
        company_name: 'Acme',
        linkedin_url: NORMALIZED,
      }],
      rowCount: 1,
    } as never);

    const res = await request(app)
      .post('/api/prospects/from-linkedin')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ linkedin_url: `${PROFILE}?trk=public` });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(res.body.data.id).toBe('p-existing');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enriches a profile and creates a prospect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        error: false,
        person: {
          first_name: 'Jane',
          last_name: 'Doe',
          email: { email: 'jane@acme.com' },
          current_job_title: 'Technical Recruiter',
          company: { name: 'Acme' },
        },
      }),
    }));

    const query = vi.spyOn(pool, 'query')
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [{ id: 'comp-1' }], rowCount: 1 } as never)
      .mockResolvedValueOnce({
        rows: [{
          id: 'p-new',
          first_name: 'Jane',
          last_name: 'Doe',
          email: 'jane@acme.com',
          job_title: 'Technical Recruiter',
          company_id: 'comp-1',
          linkedin_url: NORMALIZED,
        }],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never); // UPDATE pending_prospects

    const res = await request(app)
      .post('/api/prospects/from-linkedin')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ linkedin_url: PROFILE });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    expect(res.body.data).toMatchObject({
      id: 'p-new',
      first_name: 'Jane',
      company_name: 'Acme',
      email: 'jane@acme.com',
    });

    const insert = query.mock.calls[2];
    expect(insert?.[0]).toEqual(expect.stringContaining('INSERT INTO prospects'));
    expect(insert?.[1]).toEqual(expect.arrayContaining([
      'comp-1',
      'Jane',
      'Doe',
      'jane@acme.com',
      'Technical Recruiter',
      'hr',
      NORMALIZED,
    ]));
  });

  it('returns 400 when enrichment has no first name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        error: false,
        person: { email: { email: 'jane@acme.com' }, company: { name: 'Acme' } },
      }),
    }));
    vi.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const res = await request(app)
      .post('/api/prospects/from-linkedin')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ linkedin_url: PROFILE });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Enrichment did not return a name for this profile');
  });

  it('returns 409 when the enriched email already exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        error: false,
        response: {
          full_name: 'Jane Doe',
          email: { email: 'jane@acme.com' },
          current_job_title: 'Recruiter',
          company: { name: 'Acme' },
        },
      }),
    }));
    const duplicate = Object.assign(new Error('duplicate'), { code: '23505' });
    vi.spyOn(pool, 'query')
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [{ id: 'comp-1' }], rowCount: 1 } as never)
      .mockRejectedValueOnce(duplicate);

    const res = await request(app)
      .post('/api/prospects/from-linkedin')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ linkedin_url: PROFILE });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error', 'A prospect with this email already exists');
  });

  it('falls back to Apollo when Prospeo returns no email, and creates the prospect with Apollo email', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('prospeo')) {
        return {
          ok: true,
          json: async () => ({
            error: false,
            person: {
              first_name: 'Jane',
              last_name: 'Doe',
              current_job_title: 'Recruiter',
              company: { name: 'Acme' },
            },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          person: {
            first_name: 'Jane',
            last_name: 'Doe',
            email: 'jane.apollo@acme.com',
            title: 'Recruiter',
            organization: { name: 'Acme' },
          },
        }),
      };
    }));

    const query = vi.spyOn(pool, 'query')
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never) // findByLinkedIn
      .mockResolvedValueOnce({ rows: [{ id: 'comp-1' }], rowCount: 1 } as never) // resolveCompanyId
      .mockResolvedValueOnce({
        rows: [{
          id: 'p-apollo',
          first_name: 'Jane',
          last_name: 'Doe',
          email: 'jane.apollo@acme.com',
          job_title: 'Recruiter',
          company_id: 'comp-1',
          linkedin_url: NORMALIZED,
        }],
        rowCount: 1,
      } as never) // INSERT INTO prospects
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never); // UPDATE pending_prospects

    const res = await request(app)
      .post('/api/prospects/from-linkedin')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ linkedin_url: PROFILE });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    expect(res.body.data.email).toBe('jane.apollo@acme.com');

    const insertProspect = query.mock.calls[2];
    expect(String(insertProspect?.[0])).toContain('INSERT INTO prospects');
    expect(insertProspect?.[1]).toContain('jane.apollo@acme.com');
  });

  it('does NOT create prospect and does NOT add dummy email when neither API yields an email, creating pending_prospects entry instead', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('prospeo')) {
        return {
          ok: true,
          json: async () => ({
            error: false,
            person: {
              first_name: 'Jane',
              last_name: 'Doe',
              current_job_title: 'Recruiter',
              company: { name: 'Acme' },
            },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          person: {
            first_name: 'Jane',
            last_name: 'Doe',
            email: null,
            title: 'Recruiter',
            organization: { name: 'Acme' },
          },
        }),
      };
    }));

    const query = vi.spyOn(pool, 'query')
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never) // findByLinkedIn
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never) // existing pending_prospects
      .mockResolvedValueOnce({
        rows: [{
          id: 'pending-1',
          user_id: 'user-123',
          linkedin_url: NORMALIZED,
          first_name: 'Jane',
          last_name: 'Doe',
          company_name: 'Acme',
          job_title: 'Recruiter',
          dismissed_at: null,
          created_at: new Date().toISOString(),
        }],
        rowCount: 1,
      } as never); // INSERT INTO pending_prospects

    const res = await request(app)
      .post('/api/prospects/from-linkedin')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ linkedin_url: PROFILE });

    expect(res.status).toBe(201);
    expect(res.body.manual_required).toBe(true);
    expect(res.body.created).toBe(true);
    expect(res.body.pendingProspect).toMatchObject({
      id: 'pending-1',
      first_name: 'Jane',
      company_name: 'Acme',
      linkedin_url: NORMALIZED,
    });
    expect(res.body.data).toBeUndefined();

    // Verify no insert into prospects occurred and no dummy crm.local email was created
    const sqlCalls = query.mock.calls.map((c) => String(c[0]));
    expect(sqlCalls.some((sql) => sql.includes('INSERT INTO prospects'))).toBe(false);
    expect(JSON.stringify(query.mock.calls)).not.toContain('.crm.local');
  });

  it('returns existing pending_prospect when neither API gives email and one already exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ error: false }),
    })));

    const query = vi.spyOn(pool, 'query')
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never) // findByLinkedIn
      .mockResolvedValueOnce({
        rows: [{
          id: 'pending-existing',
          user_id: 'user-123',
          linkedin_url: NORMALIZED,
          first_name: 'Jane',
          last_name: 'Doe',
          company_name: 'Acme',
          job_title: 'Recruiter',
          dismissed_at: null,
          created_at: new Date().toISOString(),
        }],
        rowCount: 1,
      } as never); // SELECT existing pending_prospects

    const res = await request(app)
      .post('/api/prospects/from-linkedin')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ linkedin_url: PROFILE });

    expect(res.status).toBe(200);
    expect(res.body.manual_required).toBe(true);
    expect(res.body.created).toBe(false);
    expect(res.body.pendingProspect.id).toBe('pending-existing');

    const sqlCalls = query.mock.calls.map((c) => String(c[0]));
    expect(sqlCalls.some((sql) => sql.includes('INSERT INTO prospects'))).toBe(false);
  });
});

describe('Enrichment provider name mapping', () => {
  beforeEach(() => {
    (CONFIG as { prospeoApiKey: string }).prospeoApiKey = 'test-prospeo-key';
    (CONFIG as { apolloApiKey: string }).apolloApiKey = 'test-apollo-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Prospeo returns a person when no email is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        error: false,
        person: {
          first_name: 'Jane',
          last_name: 'Doe',
          current_job_title: 'Recruiter',
          company: { name: 'Acme' },
        },
      }),
    }));

    const result = await new ProspeoProvider().enrich({ linkedin_url: PROFILE });
    expect(result).toMatchObject({
      first_name: 'Jane',
      last_name: 'Doe',
      job_title: 'Recruiter',
      company_name: 'Acme',
    });
    expect(result.email).toBeUndefined();
  });

  it('Prospeo throws when no person is returned', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: false }),
    }));

    await expect(new ProspeoProvider().enrich({ linkedin_url: PROFILE }))
      .rejects.toThrow('No person found for this prospect in Prospeo');
  });

  it('Apollo matches on a LinkedIn URL without a first name', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        person: {
          first_name: 'Jane',
          last_name: 'Doe',
          email: 'jane@acme.com',
          title: 'Recruiter',
          linkedin_url: PROFILE,
          organization: { name: 'Acme' },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new ApolloProvider().enrich({ linkedin_url: PROFILE });
    expect(result).toEqual({
      email: 'jane@acme.com',
      first_name: 'Jane',
      last_name: 'Doe',
      job_title: 'Recruiter',
      linkedin_url: PROFILE,
      company_name: 'Acme',
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ linkedin_url: PROFILE });
  });

  it('Apollo still requires a first name when no LinkedIn URL is given', async () => {
    await expect(new ApolloProvider().enrich({}))
      .rejects.toThrow('First name or LinkedIn URL is required for Apollo enrichment');
  });
});
