import { describe, it, expect } from 'vitest';
import { normalizeJobUrl } from '../services/jobUrlNormalizer.js';

describe('normalizeJobUrl Service', () => {
  it('strips Greenhouse tracking query params like gh_src and gh_jid', () => {
    const url = 'https://job-boards.greenhouse.io/doordashindia/jobs/5856393?gh_src=5be224ed1us&gh_jid=5856393';
    expect(normalizeJobUrl(url)).toBe('https://job-boards.greenhouse.io/doordashindia/jobs/5856393');
  });

  it('strips Lever and Ashby tracking params', () => {
    const leverUrl = 'https://jobs.lever.co/netflix/123-abc?lever-source=linkedin&lever-origin=applied';
    expect(normalizeJobUrl(leverUrl)).toBe('https://jobs.lever.co/netflix/123-abc');

    const ashbyUrl = 'https://jobs.ashbyhq.com/openai/456?ashby_jid=456';
    expect(normalizeJobUrl(ashbyUrl)).toBe('https://jobs.ashbyhq.com/openai/456');
  });

  it('strips UTM parameters and trailing slashes', () => {
    const url = 'https://stripe.com/jobs/listing/123/?utm_source=google&utm_medium=cpc&utm_campaign=hiring';
    expect(normalizeJobUrl(url)).toBe('https://stripe.com/jobs/listing/123');
  });

  it('normalizes LinkedIn /comm/jobs/view/ URLs to public /jobs/view/ URLs', () => {
    const url = 'https://www.linkedin.com/comm/jobs/view/4012345678?trackingId=abc';
    expect(normalizeJobUrl(url)).toBe('https://www.linkedin.com/jobs/view/4012345678');
  });

  it('handles placeholder and empty URLs without modification', () => {
    expect(normalizeJobUrl('#')).toBe('#');
    expect(normalizeJobUrl('')).toBe('');
    expect(normalizeJobUrl('   ')).toBe('');
  });
});
