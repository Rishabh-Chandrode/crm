import { describe, it, expect } from 'vitest';
import type {
  DiscoverRoleCategory,
  DiscoverPeopleRequest,
  DiscoveredPerson,
  DiscoverPeopleResponse,
  BulkImportProspectItem,
  BulkImportProspectsRequest,
  BulkImportProspectsResponse,
} from '../types';

describe('Extension Discover People Contracts', () => {
  it('validates DiscoverRoleCategory contract', () => {
    const roles: DiscoverRoleCategory[] = ['recruiter', 'hiring_manager', 'executive', 'all', 'custom'];
    expect(roles).toHaveLength(5);
  });

  it('validates DiscoverPeopleRequest and Response contracts', () => {
    const req: DiscoverPeopleRequest = {
      company_name: 'Stripe',
      company_domain: 'stripe.com',
      role_category: 'recruiter',
      job_titles: ['Technical Recruiter'],
      limit: 25,
      page: 1,
    };

    const person: DiscoveredPerson = {
      id: 'p-1',
      first_name: 'Sarah',
      last_name: 'Connor',
      full_name: 'Sarah Connor',
      job_title: 'Head of Talent',
      role_category: 'hr',
      company_name: 'Stripe',
      linkedin_url: 'https://linkedin.com/in/sarahconnor',
      email: 'sarah@stripe.com',
      already_in_crm: true,
      existing_prospect_id: 'crm-123',
    };

    const res: DiscoverPeopleResponse = {
      data: [person],
      total: 1,
      free: true,
      provider: 'prospeo',
    };

    expect(req.company_name).toBe('Stripe');
    expect(res.data[0]!.already_in_crm).toBe(true);
    expect(res.data[0]!.existing_prospect_id).toBe('crm-123');
  });

  it('validates BulkImportProspects Request and Response contracts', () => {
    const item: BulkImportProspectItem = {
      first_name: 'John',
      last_name: 'Doe',
      company_name: 'OpenAI',
      job_title: 'Engineering Manager',
      linkedin_url: 'https://linkedin.com/in/johndoe',
      auto_enrich_email: true,
    };

    const importReq: BulkImportProspectsRequest = {
      prospects: [item],
      default_company_id: 'comp-openai',
    };

    const importRes: BulkImportProspectsResponse = {
      data: [] as any,
      imported_count: 1,
      skipped_count: 0,
      total: 1,
    };

    expect(importReq.prospects[0]!.auto_enrich_email).toBe(true);
    expect(importRes.imported_count).toBe(1);
  });
});

