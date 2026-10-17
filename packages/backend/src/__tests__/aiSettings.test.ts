import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { pool } from '../db/index.js';
import { CONFIG } from '../config.js';
import { llmSettingsService } from '../services/llm/llmSettingsService.js';
import { LlmProviderFactory } from '../services/llm/factory.js';

describe('AI & LLM Admin Settings & Telemetry API', () => {
  const adminToken = jwt.sign(
    {
      id: '11111111-1111-1111-1111-111111111111',
      username: 'admin_test',
      role: 'admin',
    },
    CONFIG.jwtSecret,
    { expiresIn: '1h' }
  );

  const userToken = jwt.sign(
    {
      id: '22222222-2222-2222-2222-222222222222',
      username: 'user_test',
      role: 'user',
    },
    CONFIG.jwtSecret,
    { expiresIn: '1h' }
  );

  beforeEach(async () => {
    vi.restoreAllMocks();
    LlmProviderFactory.reset();
  });

  describe('Authentication & Authorization', () => {
    it('returns 401 when token is missing', async () => {
      const res = await request(app).get('/api/ai-settings');
      expect(res.status).toBe(401);
    });

    it('returns 403 when user is not an administrator', async () => {
      const res = await request(app)
        .get('/api/ai-settings')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    it('returns 200 and settings when user is admin', async () => {
      const res = await request(app)
        .get('/api/ai-settings')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(typeof res.body.data.enabled).toBe('boolean');
      expect(['gemini', 'openai', 'disabled']).toContain(res.body.data.provider);
      expect(typeof res.body.data.model).toBe('string');
      expect(typeof res.body.data.temperature).toBe('number');
      expect(typeof res.body.data.maxTokens).toBe('number');
    });
  });

  describe('PUT /api/ai-settings (Update Settings)', () => {
    it('rejects invalid provider type with 400', async () => {
      const res = await request(app)
        .put('/api/ai-settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'invalid-ai' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid provider');
    });

    it('rejects invalid temperature with 400', async () => {
      const res = await request(app)
        .put('/api/ai-settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ temperature: 1.5 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Temperature');
    });

    it('rejects invalid maxTokens with 400', async () => {
      const res = await request(app)
        .put('/api/ai-settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ maxTokens: -50 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Max tokens');
    });

    it('persists updated settings and masks API keys in response', async () => {
      vi.spyOn(pool, 'query').mockImplementation(async (text: any, params?: any) => {
        if (typeof text === 'string' && text.includes('INSERT INTO settings')) {
          return { rows: [], rowCount: 1 } as any;
        }
        if (typeof text === 'string' && text.includes('SELECT key, value FROM settings')) {
          return {
            rows: [
              { key: 'llm_enabled', value: 'true' },
              { key: 'llm_provider', value: 'openai' },
              { key: 'llm_model', value: 'gpt-4o-mini' },
              { key: 'llm_temperature', value: '0.1' },
              { key: 'llm_max_tokens', value: '1024' },
              { key: 'openai_api_key', value: 'sk-proj-test1234567890' },
            ],
            rowCount: 6,
          } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      });

      const res = await request(app)
        .put('/api/ai-settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          enabled: true,
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.1,
          maxTokens: 1024,
          openaiApiKey: 'sk-proj-test1234567890',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.provider).toBe('openai');
      expect(res.body.data.model).toBe('gpt-4o-mini');
      expect(res.body.data.hasOpenAiKey).toBe(true);
      expect(res.body.data.openaiApiKeyMasked).toBe('••••••••7890');
    });
  });

  describe('POST /api/ai-settings/test (Diagnostics)', () => {
    it('returns error when provider is set to disabled', async () => {
      vi.spyOn(llmSettingsService, 'getRawSettings').mockResolvedValueOnce({
        enabled: false,
        provider: 'disabled',
        model: 'gemini-3.8-flash',
        temperature: 0.2,
        maxTokens: 2048,
        geminiApiKey: '',
        openaiApiKey: '',
      });

      const res = await request(app)
        .post('/api/ai-settings/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'disabled' });

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(false);
      expect(res.body.data.error).toContain('disabled');
    });

    it('returns success when test completion call succeeds', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: 'LLM connection successful.' }] },
            },
          ],
        }),
      } as unknown as Response);

      const res = await request(app)
        .post('/api/ai-settings/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          provider: 'gemini',
          apiKey: 'test-api-key',
          model: 'gemini-3.8-flash',
        });

      globalThis.fetch = originalFetch;

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
      expect(res.body.data.message).toBe('LLM connection successful.');
      expect(typeof res.body.data.latencyMs).toBe('number');
    });
  });

  describe('LlmSettingsService Unit Tests', () => {
    it('correctly handles raw settings fallback to CONFIG', async () => {
      vi.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const raw = await llmSettingsService.getRawSettings();
      expect(raw.model).toBeDefined();
      expect(raw.temperature).toBe(0.2);
      expect(raw.maxTokens).toBe(2048);
    });
  });
});
