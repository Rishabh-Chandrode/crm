import { Router } from 'express';
import { aiAutofillService } from '../services/aiAutofillService.js';
import type { AiAutofillRequest } from '../types/index.js';

const router: ReturnType<typeof Router> = Router();

/**
 * POST /api/autofill/ai-fill
 * Resolves unknown / screening questions and select options using AI & candidate profile.
 */
router.post('/ai-fill', async (req, res, next) => {
  try {
    const body = req.body as AiAutofillRequest;

    if (!body || !Array.isArray(body.fields)) {
      res.status(400).json({ error: 'Request body must include a "fields" array.' });
      return;
    }

    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await aiAutofillService.resolveFormFields(userId, body);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
