self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'CRM Notification',
    body: 'You have a new update in your CRM.',
    url: '/',
    tag: 'crm-general',
  };

  try {
    if (event.data) {
      data = Object.assign(data, event.data.json());
    }
  } catch (_err) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || 'crm-alert',
    data: {
      url: data.url || '/',
    },
    actions: Array.isArray(data.actions) ? data.actions : [],
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  let targetUrl = event.notification.data?.url || '/';
  if (event.action === 'reconnect_gmail') {
    targetUrl = '/settings?tab=gmail';
  } else if (event.action === 'retry') {
    targetUrl = '/scheduled';
  } else if (event.action === 'view_jobs') {
    targetUrl = '/jobs';
  } else if (event.action === 'view_applications') {
    targetUrl = '/applications';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
