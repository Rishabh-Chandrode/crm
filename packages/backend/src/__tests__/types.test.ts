import { describe, it, expect } from 'vitest';
import { getGmailSearchUrl } from '../types/index.js';

describe('Backend Types & Utilities', () => {
  describe('getGmailSearchUrl', () => {
    it('targets exact thread with rfc822msgid when messageId contains @', () => {
      expect(
        getGmailSearchUrl({
          to: 'recruiter@example.com',
          subject: 'Referral for Backend Role',
          messageId: '<abc123xyz@mail.gmail.com>',
        })
      ).toBe('https://mail.google.com/mail/u/0/#search/rfc822msgid%3Aabc123xyz%40mail.gmail.com');
    });

    it('targets exact thread by combining recipient and subject', () => {
      expect(
        getGmailSearchUrl({
          to: 'recruiter@example.com',
          subject: 'Referral for Backend Role',
        })
      ).toBe(
        'https://mail.google.com/mail/u/0/#search/to%3Arecruiter%40example.com%20subject%3A(%22Referral%20for%20Backend%20Role%22)'
      );
    });

    it('falls back to subject when recipient email is missing', () => {
      expect(getGmailSearchUrl({ subject: 'Referral for Backend Role' })).toBe(
        'https://mail.google.com/mail/u/0/#search/subject%3A(%22Referral%20for%20Backend%20Role%22)'
      );
    });

    it('handles empty parameters gracefully', () => {
      expect(getGmailSearchUrl({})).toBe('https://mail.google.com/mail/u/0/#search/');
    });
  });
});
