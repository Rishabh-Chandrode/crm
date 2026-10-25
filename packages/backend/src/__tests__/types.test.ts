import { describe, it, expect } from 'vitest';
import { getGmailSearchUrl } from '../types/index.js';

describe('Backend Types & Utilities', () => {
  describe('getGmailSearchUrl', () => {
    it('opens direct thread URL (#all/<id>) when messageId is a native Gmail hex ID', () => {
      expect(
        getGmailSearchUrl({
          to: 'recruiter@example.com',
          subject: 'Referral for Backend Role',
          messageId: '1953258c7075c328',
        })
      ).toBe('https://mail.google.com/mail/u/0/#all/1953258c7075c328');
    });

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

  describe('Prospect Contracts', () => {
    it('validates ProspectLookupResult and QuickAddProspectResult structures', () => {
      const lookup: import('../types/index.js').ProspectLookupResult = {
        data: null,
        pending: {
          id: 'pend-1',
          user_id: 'u-1',
          linkedin_url: 'https://linkedin.com/in/jane',
          first_name: 'Jane',
          last_name: 'Doe',
          company_name: 'Acme',
          job_title: 'Recruiter',
          notes: null,
          dismissed_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      };
      expect(lookup.pending?.id).toBe('pend-1');

      const quickAdd: import('../types/index.js').QuickAddProspectResult = {
        data: {
          id: 'p-1',
          first_name: 'Jane',
          email: 'jane@acme.com',
          created_at: new Date(),
          updated_at: new Date(),
        },
        pending_dismissed: true,
      };
      expect(quickAdd.pending_dismissed).toBe(true);
    });

    it('validates JobAddedNotificationDetails and ApplicationUpdatedNotificationDetails structures', () => {
      const jobDetails: import('../types/index.js').JobAddedNotificationDetails = {
        jobId: 'j-1',
        title: 'Backend Engineer',
        companyName: 'Acme',
        jobUrl: 'https://acme.com',
      };
      expect(jobDetails.title).toBe('Backend Engineer');

      const appDetails: import('../types/index.js').ApplicationUpdatedNotificationDetails = {
        applicationId: 'a-1',
        jobTitle: 'Backend Engineer',
        companyName: 'Acme',
        status: 'applied',
        notes: 'Submitted resume',
      };
      expect(appDetails.status).toBe('applied');
    });
  });
});
