import { describe, expect, it } from 'vitest';
import { companyOptionsFromShare, inferJobFromUrl, postLoginPath, resolveSharedLink, safeNextPath } from '../lib/shareTarget';

describe('resolveSharedLink', () => {
  it('prefers an http url field over text', () => {
    expect(resolveSharedLink(
      'https://boards.greenhouse.io/acme/jobs/1',
      'see https://jobs.lever.co/other/1',
    )).toBe('https://boards.greenhouse.io/acme/jobs/1');
  });

  it('reads the first http link from text when url is empty', () => {
    expect(resolveSharedLink(null, 'Check this https://jobs.lever.co/acme/123.')).toBe(
      'https://jobs.lever.co/acme/123',
    );
  });

  it('reads a link embedded in the url field', () => {
    expect(resolveSharedLink('Job: https://jobs.ashbyhq.com/acme/role', '')).toBe(
      'https://jobs.ashbyhq.com/acme/role',
    );
  });

  it('returns an empty string when neither field has a link', () => {
    expect(resolveSharedLink('not a link', 'still not')).toBe('');
  });
});

describe('inferJobFromUrl', () => {
  it('reads Greenhouse company and strips a shared title suffix', () => {
    expect(inferJobFromUrl(
      'https://boards.greenhouse.io/acme-corp/jobs/1',
      'Staff Engineer - Acme',
    )).toMatchObject({
      company_name: 'acme corp',
      platform: 'Greenhouse',
      job_title: 'Staff Engineer',
    });
  });

  it('reads Lever, Workday, Ashby, and LinkedIn hosts', () => {
    expect(inferJobFromUrl('https://jobs.lever.co/stripe/abc').platform).toBe('Lever');
    expect(inferJobFromUrl('https://jobs.lever.co/stripe/abc').company_name).toBe('stripe');
    expect(inferJobFromUrl('https://acme.wd5.myworkdayjobs.com/en-US/job/1').platform).toBe('Workday');
    expect(inferJobFromUrl('https://acme.wd5.myworkdayjobs.com/en-US/job/1').company_name).toBe('acme');
    expect(inferJobFromUrl('https://jobs.ashbyhq.com/notion/role').platform).toBe('Ashby');
    expect(inferJobFromUrl('https://jobs.ashbyhq.com/notion/role').company_name).toBe('notion');
    expect(inferJobFromUrl('https://www.linkedin.com/jobs/view/1').platform).toBe('LinkedIn');
  });

  it('uses the registrable host label for a generic careers site', () => {
    expect(inferJobFromUrl('https://careers.example.com/jobs/1')).toMatchObject({
      platform: 'Generic',
      company_name: 'Example',
    });
  });
});

describe('companyOptionsFromShare', () => {
  it('title-cases a Greenhouse board slug', () => {
    expect(companyOptionsFromShare('https://boards.greenhouse.io/acme-corp/jobs/1')).toEqual(['Acme Corp']);
  });

  it('reads the company after at and skips a board name', () => {
    expect(companyOptionsFromShare(
      'https://www.linkedin.com/jobs/view/1',
      'Engineer at Stripe | LinkedIn',
    )).toEqual(['Stripe']);
  });

  it('uses the registrable host label for a generic careers site', () => {
    expect(companyOptionsFromShare('https://careers.example.com/jobs/1')).toEqual(['Example']);
  });

  it('includes the company subdomain ahead of the site name', () => {
    expect(companyOptionsFromShare(
      'https://travclan.turbohire.co/job/publicjobs/f8b1cd9a-cfa0-4254-8f4c-81dd3ce53cb9?utm_source=CareerPage',
    )).toEqual(['Travclan', 'Turbohire']);
  });
});

describe('safeNextPath', () => {
  it('allows an internal share path and query', () => {
    expect(safeNextPath('/share?url=https://jobs.example/1')).toBe('/share?url=https://jobs.example/1');
  });

  it('rejects external and protocol-relative targets', () => {
    expect(safeNextPath('https://evil.example')).toBeNull();
    expect(safeNextPath('//evil.example')).toBeNull();
    expect(postLoginPath('https://evil.example')).toBe('/dashboard');
    expect(postLoginPath('/share?url=https://jobs.example/1')).toBe('/share?url=https://jobs.example/1');
  });
});
