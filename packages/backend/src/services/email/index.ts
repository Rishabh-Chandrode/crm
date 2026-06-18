import type { EmailProvider } from './types.js';
import { GmailEmailProvider, type GmailCredentials } from './gmail.js';
import { ResendEmailProvider } from './resend.js';
import { CONFIG } from '../../config.js';

// Cache providers by credentials key to preserve connection pools
const _userProviders = new Map<string, GmailEmailProvider>();

export function getEmailProviderForUser(creds: GmailCredentials): EmailProvider {
  const key = `${creds.gmailUser}:${creds.gmailAppPassword}`;
  let provider = _userProviders.get(key);
  if (!provider) {
    provider = new GmailEmailProvider(creds);
    _userProviders.set(key, provider);
  }
  return provider;
}

// Fallback env-level provider for users who haven't configured their own credentials
let _envProvider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (!_envProvider) {
    if (CONFIG.gmailUser && CONFIG.gmailAppPassword) {
      _envProvider = new GmailEmailProvider({
        gmailUser: CONFIG.gmailUser,
        gmailAppPassword: CONFIG.gmailAppPassword,
        fromName: CONFIG.fromName,
      });
    } else {
      _envProvider = new ResendEmailProvider();
    }
  }
  return _envProvider;
}

export type { EmailProvider, SendEmailOptions, SendEmailResult } from './types.js';
