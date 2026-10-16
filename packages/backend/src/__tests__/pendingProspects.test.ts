import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app.js';
import { CONFIG } from '../config.js';
import { pool } from '../db/index.js';
import {
  extractLinkedInSlug,
  normalizeLinkedInUrl,
  findMatchingPendingProspect,
  dismissPendingProspect,
  dismissMatchingPendingProspects,
} from '../services/pendingProspects.js';

describe('Pending Prospects Service & Integration', () => {
  const userToken = jwt.sign(
    { id: 'user-123', username: 'testuser', role: 'user' },
    CONFIG.jwtSecret,
  );

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Utility functions', () => {
    it('extracts LinkedIn slug correctly across various URL shapes', () => {
      expect(extractLinkedInSlug('https://www.linkedin.com/in/jane-doe')).toBe('jane-doe');
      expect(extractLinkedInSlug('https://linkedin.com/in/jane-doe/')).toBe('jane-doe');
      expect(extractLinkedInSlug('https://in.linkedin.com/in/jane-doe?trk=public')).toBe('jane-doe');
      expect(extractLinkedInSlug('https://www.linkedin.com/pub/alex-smith/1/2/3')).toBe('alex-smith');
      expect(extractLinkedInSlug('https://github.com/someone')).toBeNull();
      expect(extractLinkedInSlug(null)).toBeNull();
    });

    it('normalizes LinkedIn URL correctly', () => {
      expect(normalizeLinkedInUrl('  https://www.linkedin.com/in/jane-doe/?trk=123  ')).toBe(
        'https://www.linkedin.com/in/jane-doe',
      );
    });
  });

  describe('findMatchingPendingProspect', () => {
    it('returns null when criteria are empty', async () => {
      const match = await findMatchingPendingProspect('user-123', {});
      expect(match).toBeNull();
    });

    it('queries by slug and name when criteria are provided', async () => {
      const mockRow = {
        id: 'pend-1',
        user_id: 'user-123',
        linkedin_url: 'https://www.linkedin.com/in/jane-doe',
        first_name: 'Jane',
        last_name: 'Doe',
        company_name: 'Acme',
        job_title: 'Recruiter',
        notes: null,
        dismissed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

      const match = await findMatchingPendingProspect('user-123', {
        linkedin_url: 'https://linkedin.com/in/jane-doe?trk=public',
      });

      expect(match).toEqual(mockRow);
      const call = vi.mocked(pool.query).mock.calls[0];
      expect(String(call?.[0])).toContain('FROM pending_prospects');
      expect(call?.[1]).toContain('user-123');
      expect(call?.[1]).toContain('jane-doe');
    });
  });

  describe('POST /api/prospects/quick-add with pending prospects', () => {
    it('dismisses matching pending prospect and inserts into prospects table', async () => {
      const mockPending = {
        id: 'pending-abc',
        user_id: 'user-123',
        linkedin_url: 'https://www.linkedin.com/in/jane-doe',
        first_name: 'Jane',
        last_name: 'Doe',
        company_name: 'Acme Corp',
        job_title: 'Head of Talent',
        notes: 'Met at conf',
        dismissed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const query = vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [mockPending], rowCount: 1 } as never) // findMatchingPendingProspect
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never) // check existing email
        .mockResolvedValueOnce({ rows: [{ id: 'comp-1' }], rowCount: 1 } as never) // resolve company
        .mockResolvedValueOnce({
          rows: [{
            id: 'p-new',
            first_name: 'Jane',
            last_name: 'Doe',
            email: 'jane@acme.com',
            company_id: 'comp-1',
            job_title: 'Head of Talent',
            linkedin_url: 'https://www.linkedin.com/in/jane-doe',
            notes: 'Met at conf',
          }],
          rowCount: 1,
        } as never) // INSERT INTO prospects
        .mockResolvedValueOnce({ rowCount: 1 } as never) // dismissPendingProspect (by id)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never); // dismissMatchingPendingProspects (by url)

      const res = await request(app)
        .post('/api/prospects/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          first_name: 'Jane',
          last_name: 'Doe',
          email: 'jane@acme.com',
          company_name: 'Acme Corp',
          linkedin_url: 'https://www.linkedin.com/in/jane-doe',
        });

      expect(res.status).toBe(201);
      expect(res.body.pending_dismissed).toBe(true);
      expect(res.body.data.id).toBe('p-new');

      // Verify pending prospect was dismissed
      const updateCalls = query.mock.calls.filter((c) =>
        String(c[0]).includes('UPDATE pending_prospects'),
      );
      expect(updateCalls.length).toBeGreaterThanOrEqual(1);
      expect(String(updateCalls[0]?.[0])).toContain('dismissed_at = NOW()');
    });

    it('dismisses matching pending prospect even if prospect email already exists in CRM', async () => {
      const mockPending = {
        id: 'pending-123',
        user_id: 'user-123',
        linkedin_url: 'https://www.linkedin.com/in/jane-doe',
        first_name: 'Jane',
        last_name: 'Doe',
        company_name: 'Acme',
        job_title: null,
        notes: null,
        dismissed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [mockPending], rowCount: 1 } as never) // findMatchingPendingProspect
        .mockResolvedValueOnce({ rows: [{ id: 'p-existing' }], rowCount: 1 } as never) // existing email
        .mockResolvedValueOnce({ rowCount: 1 } as never); // dismissPendingProspect

      const res = await request(app)
        .post('/api/prospects/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          first_name: 'Jane',
          email: 'jane@acme.com',
          linkedin_url: 'https://www.linkedin.com/in/jane-doe',
        });

      expect(res.status).toBe(200);
      expect(res.body.existed).toBe(true);
      expect(res.body.pending_dismissed).toBe(true);
      expect(res.body.data.id).toBe('p-existing');
    });
  });

  describe('GET /api/prospects/lookup with pending prospects', () => {
    it('returns pending prospect info when not yet in prospects table', async () => {
      const mockPending = {
        id: 'pending-lookup-1',
        user_id: 'user-123',
        linkedin_url: 'https://www.linkedin.com/in/jane-doe',
        first_name: 'Jane',
        last_name: 'Doe',
        company_name: 'Acme',
        job_title: 'Sourcer',
        notes: null,
        dismissed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never) // SELECT prospects
        .mockResolvedValueOnce({ rows: [mockPending], rowCount: 1 } as never); // findMatchingPendingProspect

      const res = await request(app)
        .get('/api/prospects/lookup?linkedin_url=https://www.linkedin.com/in/jane-doe')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
      expect(res.body.pending).toMatchObject({
        id: 'pending-lookup-1',
        first_name: 'Jane',
        job_title: 'Sourcer',
      });
    });

    it('returns data when prospect already exists in prospects table and pending is null', async () => {
      const mockProspect = {
        id: 'p-in-db',
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@acme.com',
        company_name: 'Acme',
      };

      vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [mockProspect], rowCount: 1 } as never);

      const res = await request(app)
        .get('/api/prospects/lookup?linkedin_url=https://www.linkedin.com/in/jane-doe')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: 'p-in-db',
        email: 'jane@acme.com',
      });
      expect(res.body.pending).toBeNull();
    });
  });
});
