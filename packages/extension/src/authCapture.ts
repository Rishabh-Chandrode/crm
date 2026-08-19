let lastSeenToken: string | null = null;

interface StoredAuth {
  auth?: {
    token?: string;
    username?: string;
    role?: string;
  };
}

function syncTokenFromCookie() {
  const match = document.cookie.match(/(?:^|;\s*)crm_token=([^;]+)/);
  if (match?.[1]) {
    const rawToken = decodeURIComponent(match[1]);
    if (rawToken && rawToken.split('.').length === 3) {
      if (rawToken === lastSeenToken) return;
      lastSeenToken = rawToken;
      chrome.storage.sync.get(['auth'], (stored: StoredAuth) => {
        if (!stored.auth || stored.auth.token !== rawToken) {
          const auth = { token: rawToken, username: 'User', role: 'user' };
          chrome.storage.sync.set({ auth }, () => {
            console.log('CRM Extension: Synced auth token from cookie!');
          });
        }
      });
    }
  }
}
syncTokenFromCookie();
setInterval(syncTokenFromCookie, 1000);
// Also check on URL just in case
const searchMatch = window.location.search.match(/[?&]google_token=([^&#]+)/);
if (searchMatch?.[1]) {
  const rawToken = decodeURIComponent(searchMatch[1]);
  if (rawToken && rawToken.split('.').length === 3) {
    chrome.storage.sync.get(['auth'], (stored: StoredAuth) => {
      if (!stored.auth || stored.auth.token !== rawToken) {
        const auth = { token: rawToken, username: 'User', role: 'user' };
        chrome.storage.sync.set({ auth }, () => {
          console.log('CRM Extension: Captured authentication token from URL!');
        });
      }
    });
  }
}
