import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { pushNotificationService } from '../services/pushNotificationService.js';

const router: ReturnType<typeof Router> = Router();

const subscribeSchema = z.object({
  endpoint: z.string().url('Invalid push endpoint URL'),
  keys: z.object({
    p256dh: z.string().min(1, 'Missing p256dh key'),
    auth: z.string().min(1, 'Missing auth secret'),
  }),
  userAgent: z.string().optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().min(1, 'Endpoint is required'),
});

/**
 * GET /api/notifications/vapid-key
 * Returns the public VAPID key required for the browser to register pushManager subscription.
 */
router.get('/vapid-key', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const publicKey = await pushNotificationService.getPublicKey();
    res.json({ publicKey });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to retrieve VAPID public key',
    });
  }
});

/**
 * POST /api/notifications/subscribe
 * Registers or updates a device push subscription for the authenticated user.
 */
router.post('/subscribe', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid subscription data' });
      return;
    }

    const subscription = await pushNotificationService.subscribe(req.user.id, parsed.data);
    res.status(201).json({
      message: 'Push subscription registered successfully',
      data: subscription,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to register push subscription',
    });
  }
});

/**
 * POST /api/notifications/unsubscribe
 * Removes a device push subscription for the authenticated user.
 */
router.post('/unsubscribe', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parsed = unsubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request' });
      return;
    }

    const removed = await pushNotificationService.unsubscribe(req.user.id, parsed.data.endpoint);
    res.json({
      success: removed,
      message: removed ? 'Unsubscribed successfully' : 'Subscription not found',
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to unsubscribe',
    });
  }
});

/**
 * POST /api/notifications/test
 * Sends a test push notification to all active devices registered by the authenticated user.
 */
router.post('/test', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const sent = await pushNotificationService.notifyUser(req.user.id, {
      title: '🎉 Notification Test',
      body: 'Push notifications are successfully working on this device!',
      url: '/ai-settings',
      tag: 'test-notification',
    });

    res.json({
      success: sent > 0,
      sentCount: sent,
      message:
        sent > 0
          ? `Test notification sent to ${sent} active device(s)`
          : 'No active device subscriptions found. Please enable notifications on this device first.',
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to send test push notification',
    });
  }
});

export default router;
