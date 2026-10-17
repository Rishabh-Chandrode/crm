import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { llmSettingsService } from '../services/llm/llmSettingsService.js';
import type {
  UpdateLlmConfigPayload,
  TestLlmConnectionPayload,
  LlmProviderType,
} from '../types/index.js';

const router: ReturnType<typeof Router> = Router();

// Restrict entire route to authenticated administrators
router.use(authMiddleware, requireRole('admin'));

/**
 * GET /api/ai-settings
 * Returns current LLM configuration with masked API keys.
 */
router.get('/', async (_req, res, next) => {
  try {
    const data = await llmSettingsService.getSettings();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/ai-settings
 * Updates LLM settings (enabled, provider, model, API keys, temperature, maxTokens).
 */
router.put('/', async (req, res, next) => {
  try {
    const body = req.body as UpdateLlmConfigPayload;

    if (body.provider && !['gemini', 'openai', 'disabled'].includes(body.provider)) {
      res.status(400).json({ error: 'Invalid provider. Must be "gemini", "openai", or "disabled".' });
      return;
    }

    if (body.temperature !== undefined) {
      if (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 1) {
        res.status(400).json({ error: 'Temperature must be a number between 0.0 and 1.0.' });
        return;
      }
    }

    if (body.maxTokens !== undefined) {
      if (typeof body.maxTokens !== 'number' || body.maxTokens <= 0 || body.maxTokens > 32000) {
        res.status(400).json({ error: 'Max tokens must be a number between 1 and 32000.' });
        return;
      }
    }

    const data = await llmSettingsService.updateSettings(body);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai-settings/test
 * Tests LLM API connectivity with specified or saved provider and credentials.
 */
router.post('/test', async (req, res, next) => {
  try {
    const body = req.body as TestLlmConnectionPayload;
    const result = await llmSettingsService.testConnection(body);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
