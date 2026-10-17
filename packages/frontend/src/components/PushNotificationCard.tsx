'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushNotificationCard() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Check support and active subscription on mount
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    ) {
      setSupported(true);
      setPermission(Notification.permission);

      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => {
          setSubscribed(Boolean(sub));
        })
        .catch(() => {
          setSupported(false);
        });
    }
  }, []);

  async function handleToggle() {
    if (!supported) return;
    setLoading(true);
    setStatusMsg(null);

    try {
      const reg = await navigator.serviceWorker.ready;
      const existingSub = await reg.pushManager.getSubscription();

      if (existingSub) {
        // Unsubscribe
        const endpoint = existingSub.endpoint;
        await existingSub.unsubscribe();
        await api.notifications.unsubscribe(endpoint);
        setSubscribed(false);
        setStatusMsg({ type: 'success', text: 'Push notifications disabled on this device.' });
      } else {
        // Request browser permission if not yet granted
        const perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm !== 'granted') {
          setStatusMsg({
            type: 'error',
            text:
              perm === 'denied'
                ? 'Notifications are blocked in your browser settings. Please allow notifications for this site to receive alerts.'
                : 'Notification permission was not granted.',
          });
          setLoading(false);
          return;
        }

        // Fetch public VAPID key
        const { publicKey } = await api.notifications.getVapidKey();
        const convertedKey = urlBase64ToUint8Array(publicKey);

        // Subscribe with PushManager
        const newSub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey as unknown as BufferSource,
        });

        const p256dh = newSub.getKey('p256dh');
        const auth = newSub.getKey('auth');

        if (!p256dh || !auth) {
          throw new Error('Unable to generate push subscription encryption keys.');
        }

        const toBase64 = (buf: ArrayBuffer) =>
          window.btoa(String.fromCharCode(...new Uint8Array(buf)));

        await api.notifications.subscribe({
          endpoint: newSub.endpoint,
          keys: {
            p256dh: toBase64(p256dh),
            auth: toBase64(auth),
          },
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        });

        setSubscribed(true);
        setStatusMsg({
          type: 'success',
          text: 'Push notifications enabled! You will receive alerts when scheduled emails fail or tokens expire.',
        });
      }
    } catch (err) {
      console.error('[PushNotificationCard] Toggle error:', err);
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update push notification subscription.',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSendTest() {
    setTesting(true);
    setStatusMsg(null);
    try {
      const res = await api.notifications.test();
      if (res.sentCount > 0) {
        setStatusMsg({
          type: 'success',
          text: 'Test push notification dispatched! Check your phone lock-screen or notification tray.',
        });
      } else {
        setStatusMsg({
          type: 'error',
          text: 'No registered devices were reached. Please enable push notifications on this device first.',
        });
      }
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to send test push notification.',
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Push Notifications (Email Failure & Token Alerts)
            </h3>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                subscribed
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
              }`}
            >
              {subscribed ? 'Active on this Device' : 'Not Subscribed'}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xl">
            Receive instant lock-screen alerts on your phone whenever a scheduled email fails to send,
            with direct buttons to retry the send or reconnect expired Gmail credentials.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {subscribed && (
            <button
              type="button"
              onClick={handleSendTest}
              disabled={testing || loading}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors shadow-2xs disabled:opacity-50"
            >
              {testing ? 'Sending…' : 'Send Test Alert'}
            </button>
          )}

          <button
            type="button"
            onClick={handleToggle}
            disabled={loading || !supported}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all shadow-2xs disabled:opacity-50 ${
              subscribed
                ? 'border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40'
                : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200'
            }`}
          >
            {loading
              ? 'Updating…'
              : !supported
              ? 'Push Not Supported'
              : subscribed
              ? 'Disable on this Device'
              : 'Enable Push Notifications'}
          </button>
        </div>
      </div>

      {permission === 'denied' && (
        <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs">
          <strong>Notifications are blocked:</strong> To receive alerts, tap the lock or site settings icon in your browser address bar and change Notifications to &quot;Allow&quot;.
        </div>
      )}

      {statusMsg && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
          }`}
        >
          <span>{statusMsg.text}</span>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
