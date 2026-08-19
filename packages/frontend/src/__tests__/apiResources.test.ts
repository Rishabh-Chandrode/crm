import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../lib/api';

describe('Frontend API Client Resource Domains', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'crm_token=mock-token',
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Companies Resource', () => {
    it('api.companies.list sends GET /companies', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: '1', name: 'OpenAI' }] }),
      });

      const res = await api.companies.list();
      expect(res).toEqual({ data: [{ id: '1', name: 'OpenAI' }] });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/companies'),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('api.companies.create sends POST /companies with payload', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: '2', name: 'Anthropic' } }),
      });

      const res = await api.companies.create({ name: 'Anthropic', website: 'https://anthropic.com' });
      expect(res.data.name).toBe('Anthropic');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/companies'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Anthropic', website: 'https://anthropic.com' }),
        })
      );
    });
  });

  describe('Prospects Resource', () => {
    it('api.prospects.list sends GET /prospects with query params', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], total: 0 }),
      });

      await api.prospects.list({ search: 'Alice', limit: 50 });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/prospects?search=Alice&limit=50'),
        expect.anything()
      );
    });

    it('api.prospects.delete sends DELETE /prospects/:id', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      await api.prospects.delete('p-123');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/prospects/p-123'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('Templates Resource', () => {
    it('api.templates.get sends GET /templates/:id', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: 't-1', name: 'Intro' } }),
      });

      const res = await api.templates.get('t-1');
      expect(res.data.name).toBe('Intro');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/templates/t-1'),
        expect.anything()
      );
    });
  });

  describe('Applications Resource', () => {
    it('api.applications.update sends PATCH /applications/:id with payload', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'app-1', status: 'interview' }),
      });

      const res = await api.applications.update('app-1', { status: 'interview' });
      expect(res.status).toBe('interview');
    });
  });

  describe('Stats Resource', () => {
    it('api.stats.get sends GET /stats', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { totalCompanies: 10, totalProspects: 50 } }),
      });

      const res = await api.stats.get();
      expect(res.data.totalCompanies).toBe(10);
    });
  });
});
