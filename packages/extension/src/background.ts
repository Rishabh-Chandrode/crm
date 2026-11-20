declare const BACKEND_URL: string;

// Open the sidebar when the extension icon is clicked
if (typeof chrome !== 'undefined' && chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

export function isLinkedInProfileUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.toLowerCase().includes('linkedin.com')) return false;
    return /^\/(?:in|pub)\/[^/]+/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function extractLinkedInUrlAndName(
  info: chrome.contextMenus.OnClickData,
  tabUrl?: string
): { url: string | null; name: string } {
  let url: string | null = null;
  const name = info.selectionText?.trim() || '';

  if (isLinkedInProfileUrl(info.linkUrl)) {
    url = info.linkUrl!;
  } else if (isLinkedInProfileUrl(info.pageUrl)) {
    url = info.pageUrl!;
  } else if (isLinkedInProfileUrl(tabUrl)) {
    url = tabUrl!;
  } else if (info.selectionText && isLinkedInProfileUrl(info.selectionText.trim())) {
    url = info.selectionText.trim();
  } else if (info.selectionText) {
    const match = info.selectionText.match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:in|pub)\/[^\s/?#]+/i);
    if (match) url = match[0];
  }

  return { url, name };
}

export async function handleContextMenuAddProspect(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<{ success: boolean; message: string }> {
  let { url, name } = extractLinkedInUrlAndName(info, tab?.url);

  // If user clicked an <a> link without selecting text, try fetching anchor innerText
  if (!name && tab?.id && info.linkUrl && typeof chrome.scripting?.executeScript === 'function') {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (targetUrl: string) => {
          const anchor = document.querySelector(`a[href="${targetUrl}"], a[href^="${targetUrl}"]`);
          return anchor?.textContent?.trim() || '';
        },
        args: [info.linkUrl],
      });
      name = results[0]?.result || '';
    } catch {
      // execution failed or permissions restricted
    }
  }

  if (!url) {
    const msg = 'Please right-click on a LinkedIn profile link or profile page.';
    if (chrome.notifications?.create) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'image.png',
        title: 'Outreach CRM',
        message: msg,
      });
    }
    return { success: false, message: msg };
  }

  // Retrieve auth token
  const stored = await chrome.storage.sync.get('auth');
  const auth = stored['auth'] as { token?: string } | undefined;

  if (!auth?.token) {
    const msg = 'Please log in to the Outreach CRM extension first.';
    if (chrome.notifications?.create) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'image.png',
        title: 'Outreach CRM',
        message: msg,
      });
    }
    return { success: false, message: msg };
  }

  const base = typeof BACKEND_URL !== 'undefined' ? BACKEND_URL : 'http://localhost:3001';

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/prospects/from-linkedin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({
        linkedin_url: url,
        name: name || undefined,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      const errMsg = json.error || `Server responded with HTTP ${res.status}`;
      if (chrome.notifications?.create) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'image.png',
          title: 'Outreach CRM — Error',
          message: errMsg,
        });
      }
      return { success: false, message: errMsg };
    }

    let notifyTitle = 'Outreach CRM';
    let notifyMsg = '';

    if (json.manual_required || json.pendingProspect) {
      notifyTitle = 'Outreach CRM — Priority Center';
      notifyMsg = `Email not found. Added ${name || 'contact'} to Priority Action Center for manual review.`;
    } else {
      const personName = json.data
        ? [json.data.first_name, json.data.last_name].filter(Boolean).join(' ')
        : (name || 'contact');
      notifyMsg = json.created
        ? `✓ Added ${personName} to CRM Prospects!`
        : `${personName} is already in CRM Prospects.`;
    }

    if (chrome.notifications?.create) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'image.png',
        title: notifyTitle,
        message: notifyMsg,
      });
    }

    // Broadcast update so sidebar/popup if open can refresh
    chrome.runtime.sendMessage({ action: 'prospectAddedFromContextMenu', result: json }).catch(() => {});

    return { success: true, message: notifyMsg };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (chrome.notifications?.create) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'image.png',
        title: 'Outreach CRM — Network Error',
        message: `Failed to connect to backend: ${errMsg}`,
      });
    }
    return { success: false, message: errMsg };
  }
}

// Register Right-Click Context Menu
if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    if (chrome.contextMenus?.create) {
      chrome.contextMenus.create({
        id: 'add-linkedin-prospect',
        title: 'Add to CRM Prospects',
        contexts: ['link', 'selection', 'page'],
      });
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'add-linkedin-prospect') {
      void handleContextMenuAddProspect(info, tab);
    }
  });
}

function notifyTabUrl(url: string): void {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ action: 'tabUrlChanged', url }).catch(() => {});
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
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
        }).then(() => {
          if (linkedinTab.id) {
            chrome.tabs.sendMessage(linkedinTab.id, { type: 'SCRAPE_PAGE' }).catch(() => {});
          }
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
}

// Notify sidebar when user switches tabs or navigates
if (typeof chrome !== 'undefined' && chrome.tabs?.onActivated) {
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs.get(tabId, (tab) => {
      if (tab.url) notifyTabUrl(tab.url);
    });
  });
}

if (typeof chrome !== 'undefined' && chrome.tabs?.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return;
    const url = changeInfo.url || tab.url || '';
    notifyTabUrl(url);
  });
}

if (typeof chrome !== 'undefined' && chrome.cookies?.onChanged) {
  chrome.cookies.onChanged.addListener((changeInfo) => {
    if (changeInfo.cookie.name === 'crm_token') {
      if (changeInfo.removed || !changeInfo.cookie.value) {
        chrome.storage.sync.remove('auth');
      } else {
        const rawToken = decodeURIComponent(changeInfo.cookie.value);
        if (rawToken && rawToken.split('.').length === 3) {
          const auth = { token: rawToken, username: 'User', role: 'user' };
          chrome.storage.sync.set({ auth });
        }
      }
    }
  });
}
