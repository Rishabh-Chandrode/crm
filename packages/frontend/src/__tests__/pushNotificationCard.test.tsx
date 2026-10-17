import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { PushNotificationCard } from '../components/PushNotificationCard';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    notifications: {
      getVapidKey: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      test: vi.fn(),
    },
  },
}));

describe('PushNotificationCard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Push Not Supported when PushManager is absent', () => {
    // Delete PushManager or serviceWorker from window
    const originalPushManager = (window as any).PushManager;
    delete (window as any).PushManager;

    render(<PushNotificationCard />);

    expect(screen.getByText('Push Notifications (Email Failure & Token Alerts)')).toBeInTheDocument();
    expect(screen.getByText('Not Subscribed')).toBeInTheDocument();
    expect(screen.getByText('Push Not Supported')).toBeDisabled();

    (window as any).PushManager = originalPushManager;
  });

  it('detects existing push subscription on mount', async () => {
    const mockSub = {
      endpoint: 'https://push.example.com/sub-1',
      getKey: vi.fn().mockReturnValue(new ArrayBuffer(8)),
      unsubscribe: vi.fn(),
    };

    (window as any).PushManager = {};
    (navigator as any).serviceWorker = {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(mockSub),
          subscribe: vi.fn(),
        },
      }),
    };
    (window as any).Notification = {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    };

    render(<PushNotificationCard />);

    await waitFor(() => {
      expect(screen.getByText('Active on this Device')).toBeInTheDocument();
    });

    expect(screen.getByText('Disable on this Device')).toBeInTheDocument();
    expect(screen.getByText('Send Test Alert')).toBeInTheDocument();
  });

  it('handles unsubscribing when already subscribed', async () => {
    const mockUnsubscribe = vi.fn().mockResolvedValue(true);
    const mockSub = {
      endpoint: 'https://push.example.com/sub-1',
      getKey: vi.fn().mockReturnValue(new ArrayBuffer(8)),
      unsubscribe: mockUnsubscribe,
    };

    (window as any).PushManager = {};
    (navigator as any).serviceWorker = {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(mockSub),
          subscribe: vi.fn(),
        },
      }),
    };
    (window as any).Notification = {
      permission: 'granted',
      requestPermission: vi.fn(),
    };

    vi.mocked(api.notifications.unsubscribe).mockResolvedValueOnce({
      success: true,
      message: 'Unsubscribed',
    });

    render(<PushNotificationCard />);

    await waitFor(() => {
      expect(screen.getByText('Disable on this Device')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Disable on this Device'));

    await waitFor(() => {
      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(api.notifications.unsubscribe).toHaveBeenCalledWith('https://push.example.com/sub-1');
      expect(screen.getByText('Push notifications disabled on this device.')).toBeInTheDocument();
      expect(screen.getByText('Not Subscribed')).toBeInTheDocument();
    });
  });

  it('handles subscribing when not yet subscribed', async () => {
    const mockSubscribe = vi.fn().mockResolvedValue({
      endpoint: 'https://push.example.com/sub-new',
      getKey: vi.fn((name: string) => {
        return new Uint8Array([1, 2, 3, 4]).buffer;
      }),
    });

    (window as any).PushManager = {};
    (navigator as any).serviceWorker = {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(null),
          subscribe: mockSubscribe,
        },
      }),
    };
    (window as any).Notification = {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    };

    vi.mocked(api.notifications.getVapidKey).mockResolvedValueOnce({
      publicKey: 'BMockPublicKey1234567890',
    });
    vi.mocked(api.notifications.subscribe).mockResolvedValueOnce({
      message: 'Subscribed successfully',
      data: {
        id: 'sub-1',
        user_id: 'user-1',
        endpoint: 'https://push.example.com/sub-new',
        p256dh: 'p256',
        auth: 'auth',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    render(<PushNotificationCard />);

    await waitFor(() => {
      expect(screen.getByText('Enable Push Notifications')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Enable Push Notifications'));

    await waitFor(() => {
      expect(Notification.requestPermission).toHaveBeenCalled();
      expect(api.notifications.getVapidKey).toHaveBeenCalled();
      expect(api.notifications.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'https://push.example.com/sub-new',
        })
      );
      expect(screen.getByText(/Push notifications enabled!/i)).toBeInTheDocument();
      expect(screen.getByText('Active on this Device')).toBeInTheDocument();
    });
  });

  it('dispatches test notification when Send Test Alert is clicked', async () => {
    const mockSub = {
      endpoint: 'https://push.example.com/sub-1',
      getKey: vi.fn().mockReturnValue(new ArrayBuffer(8)),
      unsubscribe: vi.fn(),
    };

    (window as any).PushManager = {};
    (navigator as any).serviceWorker = {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(mockSub),
          subscribe: vi.fn(),
        },
      }),
    };
    (window as any).Notification = {
      permission: 'granted',
      requestPermission: vi.fn(),
    };

    vi.mocked(api.notifications.test).mockResolvedValueOnce({
      success: true,
      sentCount: 1,
      message: 'Test notification sent to 1 device(s)',
    });

    render(<PushNotificationCard />);

    await waitFor(() => {
      expect(screen.getByText('Send Test Alert')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Send Test Alert'));

    await waitFor(() => {
      expect(api.notifications.test).toHaveBeenCalled();
      expect(screen.getByText(/Test push notification dispatched!/i)).toBeInTheDocument();
    });
  });

  it('renders blocked notice when Notification.permission is denied', () => {
    (window as any).PushManager = {};
    (navigator as any).serviceWorker = {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(null),
        },
      }),
    };
    (window as any).Notification = {
      permission: 'denied',
      requestPermission: vi.fn(),
    };

    render(<PushNotificationCard />);

    expect(screen.getByText(/Notifications are blocked:/i)).toBeInTheDocument();
  });

  it('displays Brave-specific guidance when push service error occurs', async () => {
    (window as any).PushManager = {};
    (navigator as any).serviceWorker = {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(null),
          subscribe: vi.fn().mockRejectedValue(new Error('Registration failed - push service error')),
        },
      }),
    };
    (window as any).Notification = {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    };
    vi.mocked(api.notifications.getVapidKey).mockResolvedValueOnce({
      publicKey: 'BMhQ_sF6Y1-M5_u9y23-8V0U234567890123456789012345678901234567890123456789012345678901234',
    });

    render(<PushNotificationCard />);

    await waitFor(() => {
      expect(screen.getByText('Enable Push Notifications')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Enable Push Notifications'));

    await waitFor(() => {
      expect(screen.getByText(/In Brave, enable "Use Google services for push messaging"/i)).toBeInTheDocument();
    });
  });
});

