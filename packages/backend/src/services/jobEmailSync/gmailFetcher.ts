import { ensureFreshGmailToken } from '../email/gmailToken.js';

export interface FetchedEmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: Date;
  snippet: string;
  bodyText: string;
  bodyHtml: string;
}

function decodeBase64Url(data: string): string {
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function extractBodies(payload: any): { text: string; html: string } {
  let text = '';
  let html = '';

  if (!payload) return { text, html };

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === 'text/html') {
      html += decoded;
    } else {
      text += decoded;
    }
  }

  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      const nested = extractBodies(part);
      if (nested.text) text += (text ? '\n' : '') + nested.text;
      if (nested.html) html += (html ? '\n' : '') + nested.html;
    }
  }

  return { text, html };
}

export async function fetchJobAndStatusEmails(
  userId: string,
  lastSyncedAt?: Date | null
): Promise<FetchedEmailMessage[]> {
  const token = await ensureFreshGmailToken(userId);
  if (!token?.accessToken) {
    return [];
  }

  const queryTerms = '(job OR career OR opening OR vacancy OR opportunity OR application OR interview OR assessment OR "status update" OR "applied to" OR "thank you for applying")';
  const query = lastSyncedAt
    ? `after:${Math.floor(lastSyncedAt.getTime() / 1000)} ${queryTerms}`
    : `newer_than:2d ${queryTerms}`;

  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=25`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });

  if (!listRes.ok) {
    console.warn(`[GmailFetcher] Failed to list messages: HTTP ${listRes.status}`);
    return [];
  }

  const listData = await listRes.json() as {
    messages?: Array<{ id: string; threadId: string }>;
  };

  const messagesList = listData.messages || [];
  if (messagesList.length === 0) {
    return [];
  }

  const results: FetchedEmailMessage[] = [];

  for (const item of messagesList.slice(0, 15)) {
    try {
      const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`;
      const msgRes = await fetch(msgUrl, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });

      if (!msgRes.ok) continue;

      const msgData = await msgRes.json() as any;
      const headers = msgData.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

      const subject = getHeader('Subject');
      const from = getHeader('From');
      const dateHeader = getHeader('Date');
      const date = dateHeader ? new Date(dateHeader) : new Date();
      const snippet = msgData.snippet || '';

      const { text, html } = extractBodies(msgData.payload);

      results.push({
        id: item.id,
        threadId: item.threadId,
        subject,
        from,
        date: isNaN(date.getTime()) ? new Date() : date,
        snippet,
        bodyText: text || snippet,
        bodyHtml: html || text || snippet,
      });
    } catch (err) {
      console.warn(`[GmailFetcher] Error fetching message ${item.id}:`, err);
    }
  }

  return results;
}
