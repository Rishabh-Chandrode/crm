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
  const url = changeInfo.url || tab.url || '';
  
  // Debug log
  chrome.storage.local.get({ debug_logs: [] }, (res) => {
    const logs = res.debug_logs;
    logs.push({ t: new Date().toISOString(), url, hasToken: url.includes('google_token') });
    if (logs.length > 50) logs.shift();
    chrome.storage.local.set({ debug_logs: logs });
  });

  const match = url.match(/[?&]google_token=([^&#]+)/);
  if (match) {
    try {
      const rawToken = decodeURIComponent(match[1]!);
      
      chrome.storage.local.get({ debug_logs: [] }, (res) => {
        const logs = res.debug_logs;
        logs.push({ t: new Date().toISOString(), msg: 'Found token match', tokenLen: rawToken.length });
        chrome.storage.local.set({ debug_logs: logs });
      });

      if (rawToken && rawToken.split('.').length === 3) {
        const auth = { token: rawToken, username: 'User', role: 'user' };
        chrome.storage.sync.set({ auth }, () => {
          chrome.storage.local.get({ debug_logs: [] }, (res) => {
            const logs = res.debug_logs;
            logs.push({ t: new Date().toISOString(), msg: 'Saved auth to sync storage' });
            chrome.storage.local.set({ debug_logs: logs });
          });
        });
      }
    } catch (e) {
      console.error('Failed to save Google token:', e);
    }
  }

  if (changeInfo.status !== 'complete') return;
  notifyTabUrl(url);
});
