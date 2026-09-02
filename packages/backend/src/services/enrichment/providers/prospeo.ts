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

export class ProspeoProvider implements EnrichmentProvider {
  async enrich(request: EnrichmentRequest): Promise<EnrichmentResult> {
    if (!CONFIG.prospeoApiKey) {
      throw new Error('Prospeo API key not configured');
    }

    if (!request.linkedin_url) {
      throw new Error('LinkedIn URL is required for Prospeo enrichment');
    }

    const payloadData: Record<string, string> = {};
    if (request.first_name) payloadData.first_name = request.first_name;
    if (request.last_name) payloadData.last_name = request.last_name;
    if (request.company_name) payloadData.company_name = request.company_name;
    if (request.linkedin_url) payloadData.linkedin_url = request.linkedin_url;

    const response = await fetch('https://api.prospeo.io/enrich-person', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-KEY': CONFIG.prospeoApiKey,
      },
      body: JSON.stringify({
        data: payloadData,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Prospeo API Error:", errorText);
      throw new Error(`Prospeo API Error: ${response.status}`);
    }

    const data = await response.json() as { error?: boolean, error_code?: string, person?: { email?: { email?: string }, current_job_title?: string, company?: { name?: string } } };
    
    if (data.error) {
      console.error("Prospeo API Match Error:", data.error_code);
      throw new Error(`Prospeo API returned error code: ${data.error_code}`);
    }

    if (!data.error && data.person?.email?.email) {
      return {
        email: data.person.email.email,
        job_title: data.person.current_job_title,
        company_name: data.person.company?.name,
      };
    }

    throw new Error('No email found for this prospect in Prospeo');
  }

  async discoverPeople(request: DiscoverPeopleRequest): Promise<DiscoverPeopleResult> {
    if (!CONFIG.prospeoApiKey) {
      throw new Error('Prospeo API key not configured');
    }

    const company = request.company_name?.trim() || request.company_domain?.trim();
    if (!company) {
      throw new Error('Company name or domain is required for discovering people');
    }

    const titles = getTargetTitles(request.role_category, request.job_titles);
    
    const filters: Record<string, unknown> = {
      person_search: { include: [company] },
    };

    if (titles.length > 0) {
      filters['person_job_title'] = { include: titles };
    }

    const response = await fetch('https://api.prospeo.io/search-person', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-KEY': CONFIG.prospeoApiKey,
      },
      body: JSON.stringify({
        filters,
        page: request.page || 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Prospeo Search API Error:", errorText);
      throw new Error(`Prospeo Search API Error: ${response.status}`);
    }

    const data = await response.json() as {
      error?: boolean;
      error_code?: string;
      message?: string;
      free?: boolean;
      total_results?: number;
      results?: Array<{
        person?: {
          person_id?: string;
          first_name?: string;
          last_name?: string;
          full_name?: string;
          current_job_title?: string;
          linkedin_url?: string;
        };
        company?: {
          name?: string;
          domain?: string;
        };
        person_id?: string;
        first_name?: string;
        last_name?: string;
        full_name?: string;
        current_job_title?: string;
        linkedin_url?: string;
      }>;
      response?: {
        free?: boolean;
        total_results?: number;
        results?: Array<any>;
      };
    };

    if (data.error) {
      throw new Error(`Prospeo API Error: ${data.message || data.error_code || 'Unknown error'}`);
    }

    const rawResults = data.results || data.response?.results || [];
    const people: DiscoveredPerson[] = rawResults.map((raw) => {
      const p = raw.person || raw;
      const c = raw.company || {};
      const firstName = p.first_name || p.full_name?.split(' ')[0] || '';
      const lastName = p.last_name || p.full_name?.split(' ').slice(1).join(' ') || undefined;
      const jobTitle = p.current_job_title || p.job_title || '';
      const compName = c.name || request.company_name || company;
      return {
        id: p.person_id || p.id,
        first_name: firstName,
        last_name: lastName,
        full_name: p.full_name || [firstName, lastName].filter(Boolean).join(' '),
        job_title: jobTitle,
        role_category: inferRoleCategory(jobTitle) || 'other',
        company_name: compName,
        linkedin_url: p.linkedin_url,
      };
    });

    return {
      people,
      total: data.total_results ?? data.response?.total_results ?? people.length,
      free: data.free ?? data.response?.free ?? false,
    };

  }

  async getCredits(): Promise<number | null> {
    if (!CONFIG.prospeoApiKey) return null;

    try {
      const response = await fetch('https://api.prospeo.io/account-information', {
        method: 'GET',
        headers: {
          'X-KEY': CONFIG.prospeoApiKey,
        },
      });

      if (!response.ok) return null;

      const data = await response.json() as { error?: boolean, response?: { remaining_credits?: number } };
      
      if (!data.error && data.response?.remaining_credits !== undefined) {
        return data.response.remaining_credits;
      }
      return null;
    } catch {
      return null;
    }
  }
}

