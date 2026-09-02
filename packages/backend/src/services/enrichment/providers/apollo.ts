import { CONFIG } from '../../../config.js';
import type { EnrichmentProvider, EnrichmentRequest, EnrichmentResult, DiscoverPeopleResult } from '../types.js';
import type { DiscoverPeopleRequest, DiscoveredPerson } from '../../../types/index.js';
import { inferRoleCategory } from '../../roleCategory.js';

function getTargetTitles(roleCategory?: string, customTitles?: string[]): string[] {
  if (customTitles && customTitles.length > 0) return customTitles;
  switch (roleCategory) {
    case 'recruiter':
      return ['Recruiter', 'Talent Acquisition', 'Sourcer', 'Head of Talent', 'Technical Recruiter', 'Recruitment Specialist'];
    case 'hiring_manager':
      return ['Engineering Manager', 'Tech Lead', 'Director of Engineering', 'Head of Engineering', 'Software Engineering Manager', 'Engineering Lead'];
    case 'executive':
      return ['CTO', 'VP of Engineering', 'Chief Technology Officer', 'Co-Founder', 'Founder', 'CEO', 'Vice President of Engineering'];
    case 'all':
    default:
      return ['Recruiter', 'Talent Acquisition', 'Engineering Manager', 'Tech Lead', 'Director of Engineering', 'CTO', 'VP of Engineering', 'Founder'];
  }
}

function getTargetSeniorities(roleCategory?: string): string[] | undefined {
  switch (roleCategory) {
    case 'recruiter':
      return undefined;
    case 'hiring_manager':
      return ['manager', 'director', 'head'];
    case 'executive':
      return ['c_suite', 'vp', 'founder', 'owner', 'partner'];
    default:
      return undefined;
  }
}

export class ApolloProvider implements EnrichmentProvider {
  async enrich(request: EnrichmentRequest): Promise<EnrichmentResult> {
    if (!CONFIG.apolloApiKey) {
      throw new Error('Apollo API key not configured');
    }

    if (!request.first_name) {
      throw new Error('First name is required for Apollo enrichment');
    }

    const payload: Record<string, string> = {
      first_name: request.first_name.trim(),
    };

    if (request.last_name?.trim()) payload.last_name = request.last_name.trim();
    if (request.company_name?.trim()) payload.organization_name = request.company_name.trim();
    if (request.linkedin_url?.trim()) payload.linkedin_url = request.linkedin_url.trim();

    const response = await fetch('https://api.apollo.io/v1/people/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': CONFIG.apolloApiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Apollo API Error:", errorText);
      throw new Error(`Apollo API Error: ${response.status}`);
    }

    const data = await response.json() as { person?: { email?: string; title?: string; linkedin_url?: string; organization?: { name?: string } } };
    
    if (data.person && data.person.email) {
      return {
        email: data.person.email,
        job_title: data.person.title,
        linkedin_url: data.person.linkedin_url,
        company_name: data.person.organization?.name,
      };
    }

    throw new Error('No email found for this prospect in Apollo');
  }

  async discoverPeople(request: DiscoverPeopleRequest): Promise<DiscoverPeopleResult> {
    if (!CONFIG.apolloApiKey) {
      throw new Error('Apollo API key not configured');
    }

    const company = request.company_name?.trim() || request.company_domain?.trim();
    if (!company) {
      throw new Error('Company name or domain is required for discovering people');
    }

    const titles = getTargetTitles(request.role_category, request.job_titles);
    const seniorities = request.seniorities || getTargetSeniorities(request.role_category);

    const payload: Record<string, unknown> = {
      page: request.page || 1,
      per_page: request.limit || 25,
    };

    if (request.company_domain?.trim()) {
      payload['q_organization_domains'] = request.company_domain.trim();
    } else {
      payload['q_organization_name'] = company;
    }

    if (titles.length > 0) {
      payload['person_titles'] = titles;
    }

    if (seniorities && seniorities.length > 0) {
      payload['person_seniorities'] = seniorities;
    }

    const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': CONFIG.apolloApiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Apollo Search API Error:", errorText);
      throw new Error(`Apollo Search API Error: ${response.status}`);
    }

    const data = await response.json() as {
      people?: Array<{
        id?: string;
        first_name?: string;
        last_name?: string;
        name?: string;
        title?: string;
        linkedin_url?: string;
        email?: string;
        organization?: {
          name?: string;
        };
      }>;
      pagination?: {
        total_entries?: number;
      };
    };

    const results = data.people || [];
    const people: DiscoveredPerson[] = results.map((item) => {
      const firstName = item.first_name || item.name?.split(' ')[0] || '';
      const lastName = item.last_name || item.name?.split(' ').slice(1).join(' ') || undefined;
      const jobTitle = item.title || '';
      return {
        id: item.id,
        first_name: firstName,
        last_name: lastName,
        full_name: item.name || [firstName, lastName].filter(Boolean).join(' '),
        job_title: jobTitle,
        role_category: inferRoleCategory(jobTitle) || 'other',
        company_name: item.organization?.name || request.company_name || company,
        linkedin_url: item.linkedin_url,
        email: item.email || undefined,
      };
    });

    return {
      people,
      total: data.pagination?.total_entries ?? people.length,
      free: false,
    };
  }

  async getCredits(): Promise<number | null> {
    // Apollo does not expose an API endpoint for checking credit balance
    return null;
  }
}

