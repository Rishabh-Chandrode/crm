import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import webpush from 'web-push';
import app from '../app.js';
import { pool } from '../db/index.js';
import { CONFIG } from '../config.js';
import { pushNotificationService } from '../services/pushNotificationService.js';

describe('Web Push Notifications API & Service', () => {
  const userToken = jwt.sign(
    {
      id: '22222222-2222-2222-2222-222222222222',
      username: 'test_user',
      role: 'user',
    },
    CONFIG.jwtSecret,
    { expiresIn: '1h' }
  );

  const adminToken = jwt.sign(
    {
      id: '11111111-1111-1111-1111-111111111111',
      username: 'test_admin',
      role: 'admin',
    },
    CONFIG.jwtSecret,
    { expiresIn: '1h' }
  );

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/notifications/vapid-key', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/notifications/vapid-key');
      expect(res.status).toBe(401);
    });

    it('returns 200 and a public key string for authenticated user', async () => {
      vi.spyOn(pushNotificationService, 'getPublicKey').mockResolvedValue('test-vapid-public-key');

      const res = await request(app)
        .get('/api/notifications/vapid-key')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ publicKey: 'test-vapid-public-key' });
    });
  });

  describe('POST /api/notifications/subscribe', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/notifications/subscribe')
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: { p256dh: 'key1', auth: 'auth1' },
        });

      expect(res.status).toBe(401);
    });

    it('validates endpoint and keys rejecting malformed payload with 400', async () => {
      const res = await request(app)
        .post('/api/notifications/subscribe')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          endpoint: 'invalid-url',
          keys: { p256dh: '' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('saves subscription and returns 201', async () => {
      vi.spyOn(pushNotificationService, 'ensureVapidKeys').mockResolvedValue('test-vapid-key');
      vi.spyOn(pool, 'query').mockImplementation(async (text: any) => {
        if (typeof text === 'string' && text.includes('INSERT INTO push_subscriptions')) {
          return {
            rows: [
              {
                id: 'sub-1',
                user_id: '22222222-2222-2222-2222-222222222222',
                endpoint: 'https://fcm.googleapis.com/fcm/send/test-sub',
                p256dh: 'test-p256dh',
                auth: 'test-auth',
                user_agent: 'Mobile Safari',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ],
            rowCount: 1,
          } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      });

      const res = await request(app)
        .post('/api/notifications/subscribe')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-sub',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
          userAgent: 'Mobile Safari',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.endpoint).toBe('https://fcm.googleapis.com/fcm/send/test-sub');
    });
  });

  describe('POST /api/notifications/unsubscribe', () => {
    it('removes subscription and returns success', async () => {
      vi.spyOn(pool, 'query').mockResolvedValueOnce({ rowCount: 1, rows: [] } as any);

      const res = await request(app)
        .post('/api/notifications/unsubscribe')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ endpoint: 'https://fcm.googleapis.com/fcm/send/test-sub' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/notifications/test', () => {
    it('sends test notification and returns sent count', async () => {
      vi.spyOn(pushNotificationService, 'notifyUser').mockResolvedValueOnce(1);

      const res = await request(app)
        .post('/api/notifications/test')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sentCount).toBe(1);
    });
  });

  describe('PushNotificationService logic', () => {
    it('automatically generates and saves VAPID keys if none exist', async () => {
      let insertCalled = false;
      vi.spyOn(pool, 'query').mockImplementation(async (text: any, params?: any) => {
        if (typeof text === 'string' && text.includes('SELECT key, value FROM settings')) {
          return { rows: [], rowCount: 0 } as any;
        }
        if (typeof text === 'string' && text.includes('INSERT INTO settings')) {
          insertCalled = true;
          return { rows: [], rowCount: 2 } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      });

      const key = await pushNotificationService.ensureVapidKeys();
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(10);
      expect(insertCalled).toBe(true);
    });

    it('cleans up dead subscription when webpush returns 410 Gone', async () => {
      vi.spyOn(pushNotificationService, 'ensureVapidKeys').mockResolvedValue('pub');
      vi.spyOn(webpush, 'sendNotification').mockRejectedValueOnce({ statusCode: 410 });

      let deleteEndpoint = '';
      vi.spyOn(pool, 'query').mockImplementation(async (text: any, params?: any) => {
        if (typeof text === 'string' && text.includes('DELETE FROM push_subscriptions')) {
          deleteEndpoint = params?.[0];
          return { rowCount: 1, rows: [] } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      });

      const success = await pushNotificationService.sendToSubscription(
        { endpoint: 'https://dead-endpoint.com', p256dh: 'p', auth: 'a' },
        { title: 'Test', body: 'Test' }
      );

      expect(success).toBe(false);
      expect(deleteEndpoint).toBe('https://dead-endpoint.com');
    });

    it('throttles consecutive LLM failure alerts within 60s cooldown window', async () => {
      vi.spyOn(pushNotificationService, 'notifyAdmins').mockResolvedValue(1);

      const firstAlert = await pushNotificationService.notifyLlmFailure({
        model: 'gemini-3.8-flash',
        statusCode: 404,
        message: 'Model not found',
      });
      expect(firstAlert).toBe(true);

      // Immediate second alert should be throttled
      const secondAlert = await pushNotificationService.notifyLlmFailure({
        model: 'gemini-3.8-flash',
        statusCode: 404,
        message: 'Model not found again',
      });
      expect(secondAlert).toBe(false);
    });

    it('dispatches scheduled email failure notification with retry CTA for general errors', async () => {
      let sentPayload: any;
      vi.spyOn(pushNotificationService, 'notifyUser').mockImplementation(async (_userId, payload) => {
        sentPayload = payload;
        return 1;
      });

      const count = await pushNotificationService.notifyScheduledEmailFailure('user-1', {
        scheduleId: 'sched-101',
        reason: 'SMTP connection timeout',
        isTokenError: false,
      });

      expect(count).toBe(1);
      expect(sentPayload.title).toBe('⚠️ Scheduled Email Failed');
      expect(sentPayload.body).toContain('SMTP connection timeout');
      expect(sentPayload.url).toBe('/scheduled');
      expect(sentPayload.actions).toEqual([{ action: 'retry', title: 'Review & Retry' }]);
    });

    it('dispatches token expiration notification with reconnect CTA when token error occurs', async () => {
      let sentPayload: any;
      vi.spyOn(pushNotificationService, 'notifyUser').mockImplementation(async (_userId, payload) => {
        sentPayload = payload;
        return 1;
      });

      const count = await pushNotificationService.notifyScheduledEmailFailure('user-1', {
        scheduleId: 'sched-102',
        reason: 'invalid_grant: Token has been expired or revoked',
        isTokenError: true,
      });

      expect(count).toBe(1);
      expect(sentPayload.title).toBe('⚠️ Gmail Authorization Expired');
      expect(sentPayload.body).toContain('Gmail session expired');
      expect(sentPayload.url).toBe('/settings?tab=gmail');
      expect(sentPayload.actions).toEqual([{ action: 'reconnect_gmail', title: 'Reconnect Gmail' }]);
    });
  });
});

