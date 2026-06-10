import type { EmailProvider } from './types.js';
import { GmailEmailProvider } from './gmail.js';
import { ResendEmailProvider } from './resend.js';
import { CONFIG } from '../../config.js';

let _provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (!_provider) {
    if (CONFIG.gmailUser && CONFIG.gmailAppPassword) {
      _provider = new GmailEmailProvider();
    } else {
      _provider = new ResendEmailProvider();
    }
  }
  return _provider;
}

export type { EmailProvider, SendEmailOptions, SendEmailResult } from './types.js';
