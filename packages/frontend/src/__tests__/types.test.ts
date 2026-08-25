import { describe, it, expect } from 'vitest';
import {
  prospectFullName,
  getGmailSearchUrl,
  toVariableLabel,
  buildVariableFromKey,
  type VariablePreset,
} from '../lib/types';

describe('Frontend Types & Utility Functions', () => {
  describe('prospectFullName', () => {
    it('concatenates first and last name correctly', () => {
      expect(prospectFullName({ first_name: 'John', last_name: 'Doe' })).toBe('John Doe');
    });

    it('handles missing last name gracefully', () => {
      expect(prospectFullName({ first_name: 'John', last_name: null })).toBe('John');
    });
  });

  describe('getGmailSearchUrl', () => {
    it('opens direct thread URL (#all/<id>) when messageId is a native Gmail hex ID', () => {
      expect(
        getGmailSearchUrl({
          to: 'recruiter@example.com',
          subject: 'Referral Request',
          messageId: '1953258c7075c328',
        })
      ).toBe('https://mail.google.com/mail/u/0/#all/1953258c7075c328');
    });

    it('targets exact thread with rfc822msgid when messageId contains @', () => {
      expect(
        getGmailSearchUrl({
          to: 'recruiter@example.com',
          subject: 'Referral Request',
          messageId: '<abc123xyz@mail.gmail.com>',
        })
      ).toBe('https://mail.google.com/mail/u/0/#search/rfc822msgid%3Aabc123xyz%40mail.gmail.com');
    });

    it('targets exact thread by combining recipient and subject when both provided', () => {
      expect(
        getGmailSearchUrl({
          to: 'recruiter@example.com',
          subject: 'Referral for Frontend Engineer',
        })
      ).toBe(
        'https://mail.google.com/mail/u/0/#search/to%3Arecruiter%40example.com%20subject%3A(%22Referral%20for%20Frontend%20Engineer%22)'
      );
    });

    it('creates search URL with recipient email when only to is provided', () => {
      expect(getGmailSearchUrl({ to: 'recruiter@example.com' })).toBe(
        'https://mail.google.com/mail/u/0/#search/to%3Arecruiter%40example.com'
      );
    });

    it('targets subject when recipient email is missing', () => {
      expect(getGmailSearchUrl({ subject: 'Referral for Frontend Engineer' })).toBe(
        'https://mail.google.com/mail/u/0/#search/subject%3A(%22Referral%20for%20Frontend%20Engineer%22)'
      );
    });

    it('handles empty / null values cleanly', () => {
      expect(getGmailSearchUrl({})).toBe('https://mail.google.com/mail/u/0/#search/');
      expect(getGmailSearchUrl({ to: null, subject: null, messageId: null })).toBe(
        'https://mail.google.com/mail/u/0/#search/'
      );
    });
  });

  describe('toVariableLabel', () => {
    it('formats camelCase and snake_case keys into Title Case labels', () => {
      expect(toVariableLabel('firstName')).toBe('First Name');
      expect(toVariableLabel('company_name')).toBe('Company Name');
      expect(toVariableLabel('linkedin_url')).toBe('Linkedin Url');
    });
  });

  describe('buildVariableFromKey', () => {
    const mockPresets: VariablePreset[] = [
      {
        id: '1',
        key: 'firstName',
        label: 'First Name',
        source: 'prospect',
        field: 'first_name',
        default_value: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '2',
        key: 'company',
        label: 'Company Name',
        source: 'company',
        field: 'name',
        default_value: 'Acme',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    it('matches configured preset and builds template variable', () => {
      const v = buildVariableFromKey('firstName', mockPresets);
      expect(v).toEqual({
        key: 'firstName',
        label: 'First Name',
        source: 'prospect',
        field: 'first_name',
        defaultValue: '',
      });
    });

    it('falls back to custom source when no preset matches', () => {
      const v = buildVariableFromKey('custom_role', mockPresets);
      expect(v).toEqual({
        key: 'custom_role',
        label: 'Custom Role',
        source: 'custom',
        field: undefined,
        defaultValue: '',
      });
    });
  });

  describe('JOB_FIELDS', () => {
    it('contains expected job schema fields', async () => {
      const { JOB_FIELDS } = await import('../lib/types');
      expect(JOB_FIELDS).toContainEqual({ value: 'title', label: 'Job Title / Role' });
      expect(JOB_FIELDS).toContainEqual({ value: 'job_url', label: 'Job URL' });
    });
  });
});
