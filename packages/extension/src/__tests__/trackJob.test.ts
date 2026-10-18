import { describe, it, expect } from 'vitest';
import { extractJobInfoFromTab, formatJobTrackError } from '../jobTracker';

function createMockTab(overrides: Partial<chrome.tabs.Tab>): chrome.tabs.Tab {
  return {
    id: 1,
    index: 0,
    pinned: false,
    highlighted: false,
    windowId: 1,
    active: true,
    incognito: false,
    selected: true,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
    url: '',
    title: '',
    ...overrides,
  } as unknown as chrome.tabs.Tab;
}

describe('Extension Job Tracker Module', () => {
  describe('extractJobInfoFromTab', () => {
    it('correctly extracts company, platform, and title from Greenhouse URLs', () => {
      const tab = createMockTab({
        id: 1,
        url: 'https://boards.greenhouse.io/airbnb/jobs/123456',
        title: 'Senior Software Engineer - Airbnb Careers',
      });

      const info = extractJobInfoFromTab(tab);
      expect(info.platform).toBe('Greenhouse');
      expect(info.company_name).toBe('airbnb');
      expect(info.job_title).toBe('Senior Software Engineer');
      expect(info.job_url).toBe('https://boards.greenhouse.io/airbnb/jobs/123456');
    });

    it('correctly extracts company, platform, and title from Lever URLs', () => {
      const tab = createMockTab({
        id: 2,
        url: 'https://jobs.lever.co/netflix/abcdef',
        title: 'Backend Engineer | Netflix',
      });

      const info = extractJobInfoFromTab(tab);
      expect(info.platform).toBe('Lever');
      expect(info.company_name).toBe('netflix');
      expect(info.job_title).toBe('Backend Engineer');
    });

    it('correctly identifies LinkedIn job postings', () => {
      const tab = createMockTab({
        id: 3,
        url: 'https://www.linkedin.com/jobs/view/4012345678',
        title: 'Staff Engineer · Google',
      });

      const info = extractJobInfoFromTab(tab);
      expect(info.platform).toBe('LinkedIn');
      expect(info.job_title).toBe('Staff Engineer');
    });

    it('correctly extracts company from Ashby URLs', () => {
      const tab = createMockTab({
        id: 5,
        url: 'https://jobs.ashbyhq.com/openai/123-abc',
        title: 'Research Scientist - OpenAI',
      });

      const info = extractJobInfoFromTab(tab);
      expect(info.platform).toBe('Ashby');
      expect(info.company_name).toBe('openai');
      expect(info.job_title).toBe('Research Scientist');
    });

    it('falls back to domain parsing for generic career sites', () => {
      const tab = createMockTab({
        id: 4,
        url: 'https://stripe.com/jobs/listing/123',
        title: 'Fullstack Engineer — Stripe',
      });

      const info = extractJobInfoFromTab(tab);
      expect(info.platform).toBe('Generic');
      expect(info.company_name).toBe('Stripe');
      expect(info.job_title).toBe('Fullstack Engineer');
    });
  });

  describe('formatJobTrackError', () => {
    it('formats 401 session expiration message clearly', () => {
      const msg = formatJobTrackError(401);
      expect(msg).toBe('Session expired — please log in again.');
    });

    it('formats 403 permission denied message', () => {
      const msg = formatJobTrackError(403);
      expect(msg).toBe('Permission denied — unable to track application.');
    });

    it('prefers server error payload message when present', () => {
      const msg = formatJobTrackError(500, { error: 'Job URL already tracked for this company' });
      expect(msg).toBe('Job URL already tracked for this company');
    });

    it('formats 500 error mentioning system logs', () => {
      const msg = formatJobTrackError(500);
      expect(msg).toBe('Server error (HTTP 500) — error recorded in system logs.');
    });

    it('falls back to provided fallback when no status or error body', () => {
      const msg = formatJobTrackError(undefined, null, 'Custom fallback error');
      expect(msg).toBe('Custom fallback error');
    });
  });
});
