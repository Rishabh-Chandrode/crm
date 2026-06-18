import type { EmailProvider } from './types.js';
import { GmailEmailProvider, type GmailCredentials } from './gmail.js';

// Cache providers by credentials key to preserve connection pools
const _userProviders = new Map<string, GmailEmailProvider>();

export function getEmailProviderForUser(creds: GmailCredentials): EmailProvider {
  // Include fromName in key so display name changes get a fresh provider
  const key = `${creds.gmailUser}:${creds.refreshToken}:${creds.fromName}`;
  let provider = _userProviders.get(key);
  if (!provider) {
    provider = new GmailEmailProvider(creds);
    _userProviders.set(key, provider);
  }
  return provider;
}

export type { EmailProvider, SendEmailOptions, SendEmailResult } from './types.js';
