import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app.js';
import { CONFIG } from '../config.js';
import { pool } from '../db/index.js';
import { ProspeoProvider } from '../services/enrichment/providers/prospeo.js';
import { ApolloProvider } from '../services/enrichment/providers/apollo.js';

describe('Prospect Discovery and Bulk Import', () => {
  const userToken = jwt.sign(
    { id: 'user-123', username: 'testuser', role: 'user' },
    CONFIG.jwtSecret
  );

  beforeEach(() => {
    vi.restoreAllMocks();
    (CONFIG as any).apolloApiKey = 'test-apollo-key';
    (CONFIG as any).prospeoApiKey = 'test-prospeo-key';
  });



  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/prospects/discover', () => {
    it('returns 401 when request is not authenticated', async () => {
      const res = await request(app)
        .post('/api/prospects/discover')
        .send({ company_name: 'Stripe' });

      expect(res.status).toBe(401);
    });

    it('returns 400 when neither company_name nor company_domain is provided', async () => {
      const res = await request(app)
        .post('/api/prospects/discover')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ role_category: 'recruiter' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'company_name or company_domain is required');
    });

    it('returns discovered contacts with CRM deduplication tagging', async () => {
      // Mock global fetch for Prospeo search
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          error: false,
          response: {
            free: true,
            total_results: 2,
            results: [
              {
                person_id: 'p-1',
                first_name: 'Sarah',
                last_name: 'Connor',
                full_name: 'Sarah Connor',
                current_job_title: 'Technical Recruiter',
                linkedin_url: 'https://linkedin.com/in/sarahconnor',
                company: { name: 'Cyberdyne', domain: 'cyberdyne.com' },
              },
              {
                person_id: 'p-2',
                first_name: 'John',
                last_name: 'Doe',
                full_name: 'John Doe',
                current_job_title: 'Engineering Manager',
                linkedin_url: 'https://linkedin.com/in/johndoe',
                company: { name: 'Cyberdyne', domain: 'cyberdyne.com' },
              },
            ],
          },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      // Mock database query for existing prospects: Sarah is already in CRM
      vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [
          {
            id: 'existing-p-1',
            linkedin_url: 'https://linkedin.com/in/sarahconnor',
            first_name: 'Sarah',
            last_name: 'Connor',
          },
        ],
        rowCount: 1,
      } as any);

      const res = await request(app)
        .post('/api/prospects/discover')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          company_name: 'Cyberdyne',
          role_category: 'all',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toMatchObject({
        first_name: 'Sarah',
        last_name: 'Connor',
        job_title: 'Technical Recruiter',
        already_in_crm: true,
        existing_prospect_id: 'existing-p-1',
      });
      expect(res.body.data[1]).toMatchObject({
        first_name: 'John',
        last_name: 'Doe',
        job_title: 'Engineering Manager',
        already_in_crm: false,
      });
    });
  });

  describe('POST /api/prospects/bulk-import', () => {
    it('returns 400 when prospects list is empty', async () => {
      const res = await request(app)
        .post('/api/prospects/bulk-import')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ prospects: [] });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('inserts prospects and auto-links company in transactional flow', async () => {
      // 1. Check existing duplicate: none
      vi.spyOn(pool, 'query')
        // Duplicate check query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        // Company select query (finds company)
        .mockResolvedValueOnce({ rows: [{ id: 'comp-100' }], rowCount: 1 } as any)
        // Insert prospect query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'new-prospect-1',
              company_id: 'comp-100',
              first_name: 'Alex',
              last_name: 'Vance',
              email: 'alex@blackmesa.com',
              job_title: 'Lead Engineer',
              role_category: 'engineer',
              created_by: 'user-123',
            },
          ],
          rowCount: 1,
        } as any);

      const res = await request(app)
        .post('/api/prospects/bulk-import')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          prospects: [
            {
              first_name: 'Alex',
              last_name: 'Vance',
              company_name: 'Black Mesa',
              job_title: 'Lead Engineer',
              email: 'alex@blackmesa.com',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.imported_count).toBe(1);
      expect(res.body.skipped_count).toBe(0);
      expect(res.body.data[0].id).toBe('new-prospect-1');
    });
  });

  describe('Provider Unit Tests', () => {
    it('ProspeoProvider.discoverPeople formats payload and parses results', async () => {
      const provider = new ProspeoProvider();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            error: false,
            response: {
              free: true,
              total_results: 1,
              results: [
                {
                  person_id: 'prospeo-123',
                  first_name: 'Alice',
                  last_name: 'Smith',
                  current_job_title: 'VP of Engineering',
                  company: { name: 'Acme' },
                },
              ],
            },
          }),
        })
      );

      const result = await provider.discoverPeople({
        company_name: 'Acme',
        role_category: 'executive',
      });

      expect(result.people).toHaveLength(1);
      expect(result.people[0].first_name).toBe('Alice');
      expect(result.people[0].role_category).toBe('engineer');
      expect(result.free).toBe(true);
    });

    it('ProspeoProvider.discoverPeople handles nested person and company objects', async () => {
      const provider = new ProspeoProvider();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            error: false,
            free: false,
            total_results: 1,
            results: [
              {
                person: {
                  person_id: 'prospeo-999',
                  first_name: 'Georgina',
                  last_name: 'Tynan',
                  full_name: 'Georgina Tynan',
                  current_job_title: 'Recruiter',
                  linkedin_url: 'https://linkedin.com/in/georginatynan',
                },
                company: {
                  name: 'Stripe',
                },
              },
            ],
          }),
        })
      );

      const result = await provider.discoverPeople({
        company_name: 'Stripe',
        role_category: 'recruiter',
      });

      expect(result.people).toHaveLength(1);
      expect(result.people[0].first_name).toBe('Georgina');
      expect(result.people[0].company_name).toBe('Stripe');
      expect(result.people[0].role_category).toBe('hr');
    });


    it('ApolloProvider.discoverPeople formats payload and parses results', async () => {
      const provider = new ApolloProvider();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            people: [
              {
                id: 'apollo-456',
                first_name: 'Bob',
                last_name: 'Jones',
                title: 'Technical Recruiter',
                organization: { name: 'Globex' },
              },
            ],
            pagination: { total_entries: 1 },
          }),
        })
      );

      const result = await provider.discoverPeople({
        company_name: 'Globex',
        role_category: 'recruiter',
      });

      expect(result.people).toHaveLength(1);
      expect(result.people[0].first_name).toBe('Bob');
      expect(result.people[0].role_category).toBe('hr');
    });
  });
});
