import webpush from 'web-push';
import { pool } from '../db/index.js';
import type {
  PushNotificationPayload,
  SubscribePushPayload,
  PushSubscriptionRecord,
} from '../types/index.js';

export class PushNotificationService {
  private vapidInitialized = false;
  private publicKey = '';
  private lastAlertTimestamp = 0;
  private readonly ALERT_COOLDOWN_MS = 60 * 1000; // 1 minute alert throttling

  /**
   * Ensures VAPID keys exist in the database and initializes webpush.
   * Auto-generates standard keys if not yet present, requiring zero manual configuration.
   */
  async ensureVapidKeys(): Promise<string> {
    if (this.vapidInitialized && this.publicKey) {
      return this.publicKey;
    }

    const res = await pool.query<{ key: string; value: string }>(
      `SELECT key, value FROM settings WHERE key IN ('vapid_public_key', 'vapid_private_key')`
    );

    const map = new Map<string, string>();
    for (const row of res.rows) {
      map.set(row.key, row.value);
    }

    let pub = map.get('vapid_public_key');
    let priv = map.get('vapid_private_key');

    if (!pub || !priv) {
      const generated = webpush.generateVAPIDKeys();
      pub = generated.publicKey;
      priv = generated.privateKey;

      await pool.query(
        `INSERT INTO settings (key, value) VALUES
          ('vapid_public_key', $1),
          ('vapid_private_key', $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [pub, priv]
      );
    }

    webpush.setVapidDetails('mailto:admin@crm.local', pub, priv);
    this.publicKey = pub;
    this.vapidInitialized = true;
    return this.publicKey;
  }

  /**
   * Retrieves the public VAPID key for frontend push subscription.
   */
  async getPublicKey(): Promise<string> {
    return this.ensureVapidKeys();
  }

  /**
   * Saves or updates a device push subscription for a user.
   */
  async subscribe(userId: string, payload: SubscribePushPayload): Promise<PushSubscriptionRecord> {
    await this.ensureVapidKeys();

    const res = await pool.query<PushSubscriptionRecord>(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent,
           updated_at = NOW()
       RETURNING *`,
      [
        userId,
        payload.endpoint,
        payload.keys.p256dh,
        payload.keys.auth,
        payload.userAgent || null,
      ]
    );

    return res.rows[0];
  }

  /**
   * Unsubscribes a specific device endpoint.
   */
  async unsubscribe(userId: string, endpoint: string): Promise<boolean> {
    const res = await pool.query(
      `DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`,
      [endpoint, userId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Dispatches a push notification to a specific subscription record.
   * Cleans up expired subscriptions (HTTP 404/410).
   */
  async sendToSubscription(
    sub: { endpoint: string; p256dh: string; auth: string },
    payload: PushNotificationPayload
  ): Promise<boolean> {
    await this.ensureVapidKeys();

    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    try {
      await webpush.sendNotification(pushSubscription, JSON.stringify(payload), {
        TTL: 86400, // 24 hours
      });
      return true;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Device subscription expired or unsubscribed on client
        await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [sub.endpoint]);
      }
      return false;
    }
  }

  /**
   * Sends a notification to all active devices registered by a user.
   */
  async notifyUser(userId: string, payload: PushNotificationPayload): Promise<number> {
    const res = await pool.query<{ endpoint: string; p256dh: string; auth: string }>(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
      [userId]
    );

    let sent = 0;
    for (const sub of res.rows) {
      const ok = await this.sendToSubscription(sub, payload);
      if (ok) sent++;
    }
    return sent;
  }

  /**
   * Sends a notification to all devices registered by administrators.
   */
  async notifyAdmins(payload: PushNotificationPayload): Promise<number> {
    const res = await pool.query<{ endpoint: string; p256dh: string; auth: string }>(
      `SELECT ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps
       JOIN users u ON ps.user_id = u.id
       WHERE u.role = 'admin'`
    );

    let sent = 0;
    for (const sub of res.rows) {
      const ok = await this.sendToSubscription(sub, payload);
      if (ok) sent++;
    }
    return sent;
  }

  /**
   * Dispatches a push notification to a user when their scheduled email fails to send.
   * If failure is due to token expiration, provides CTA to reconnect Gmail.
   * Otherwise, provides CTA to review the schedule and retry.
   */
  async notifyScheduledEmailFailure(
    userId: string,
    details: {
      scheduleId: string;
      reason: string;
      isTokenError: boolean;
    }
  ): Promise<number> {
    const payload: PushNotificationPayload = details.isTokenError
      ? {
          title: '⚠️ Gmail Authorization Expired',
          body: 'Scheduled email failed because your Gmail session expired. Tap to reconnect Gmail.',
          url: '/settings?tab=gmail',
          tag: 'gmail-token-expired',
          actions: [
            { action: 'reconnect_gmail', title: 'Reconnect Gmail' },
          ],
        }
      : {
          title: '⚠️ Scheduled Email Failed',
          body: `Scheduled email failed: ${details.reason.slice(0, 100)}. Tap to review and retry.`,
          url: '/scheduled',
          tag: `schedule-failed-${details.scheduleId}`,
          actions: [
            { action: 'retry', title: 'Review & Retry' },
          ],
        };

    return this.notifyUser(userId, payload);
  }

  /**
   * Dispatches an LLM failure alert to administrators with rate-limiting.
   */
  async notifyLlmFailure(errorDetails: {
    model: string;
    statusCode?: number;
    message: string;
  }): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastAlertTimestamp < this.ALERT_COOLDOWN_MS) {
      return false;
    }
    this.lastAlertTimestamp = now;

    const statusStr = errorDetails.statusCode ? ` (${errorDetails.statusCode})` : '';
    const payload: PushNotificationPayload = {
      title: '⚠️ LLM Call Failed',
      body: `Model ${errorDetails.model}${statusStr}: ${errorDetails.message.slice(0, 120)}`,
      url: '/ai-settings',
      tag: 'llm-failure',
    };

    const sentCount = await this.notifyAdmins(payload);
    return sentCount > 0;
  }
}

export const pushNotificationService = new PushNotificationService();
