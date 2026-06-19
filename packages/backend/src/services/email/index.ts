import type { EmailProvider } from './types.js';
import {
  GmailEmailProvider, type GmailCredentials,
  GmailAppPasswordProvider, type GmailAppPasswordCredentials,
} from './gmail.js';

export type GmailSendMethod = 'oauth' | 'app_password';

export type UserEmailCredentials =
  | { method: 'oauth';        creds: GmailCredentials }
  | { method: 'app_password'; creds: GmailAppPasswordCredentials };

// Cache providers by key to preserve connection pools across requests
const _cache = new Map<string, EmailProvider>();

export function getEmailProviderForUser(input: UserEmailCredentials): EmailProvider {
  let key: string;
  let provider: EmailProvider;

  if (input.method === 'oauth') {
    const { gmailUser, refreshToken, fromName } = input.creds;
    key = `oauth:${gmailUser}:${refreshToken}:${fromName}`;
    if (!_cache.has(key)) _cache.set(key, new GmailEmailProvider(input.creds));
  } else {
    const { gmailUser, appPassword, fromName } = input.creds;
    key = `app:${gmailUser}:${appPassword}:${fromName}`;
    if (!_cache.has(key)) _cache.set(key, new GmailAppPasswordProvider(input.creds));
  }

  provider = _cache.get(key)!;
  return provider;
}

export type { EmailProvider, SendEmailOptions, SendEmailResult } from './types.js';
