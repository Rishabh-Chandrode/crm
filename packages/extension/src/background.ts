// Open the sidebar when the extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

function notifyTabUrl(url: string): void {
  chrome.runtime.sendMessage({ action: 'tabUrlChanged', url }).catch(() => {});
}

chrome.runtime.onMessage.addListener((message: { action: string }, _sender, _sendResponse) => {
  if (message.action === 'triggerScrape') {
    chrome.tabs.query({ active: true }, (tabs) => {
      const linkedinTab = tabs.find((t) => t.url?.includes('linkedin.com/in/'));
      if (!linkedinTab?.id) {
        chrome.runtime.sendMessage({ action: 'scrapeError', error: 'Navigate to a LinkedIn profile page first' }).catch(() => {});
        return;
      }
      chrome.scripting.executeScript({
        target: { tabId: linkedinTab.id },
        files: ['dist/contentScript.js'],
      }).catch((err: unknown) => {
        chrome.runtime.sendMessage({ action: 'scrapeError', error: `Could not inject script: ${String(err)}` }).catch(() => {});
      });
    });
    return;
  }

  if (message.action === 'getActiveTabUrl') {
    chrome.tabs.query({ active: true }, (tabs) => {
      const tab = tabs.find((t) => t.url) ?? tabs[0];
      if (tab?.url) notifyTabUrl(tab.url);
    });
    return;
  }

  // Forward scrape results and application detection from content script to the sidebar
  chrome.runtime.sendMessage(message).catch(() => {});
});

// Notify sidebar when user switches tabs or navigates
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (tab.url) notifyTabUrl(tab.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const url = tab.url ?? '';

  // Notify sidebar of navigation
  notifyTabUrl(url);

  // Handle Google OAuth redirect
  const match = url.match(/[?&]google_token=([^&]+)/);
  if (!match) return;

  try {
    const rawToken = decodeURIComponent(match[1]!);
    const parts = rawToken.split('.');
    if (parts.length !== 3) return;

    const padded = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(padded)) as {
      id?: string; username?: string; role?: string;
    };

    const auth = {
      token: rawToken,
      username: payload.username ?? 'user',
      role: payload.role ?? 'user',
    };

    chrome.storage.sync.set({ auth }, () => {
      chrome.tabs.remove(tabId).catch(() => {});
    });
  } catch {
    // malformed token — ignore
  }
});
