import { CONFIG } from '../../../config.js';
import type { EnrichmentProvider, EnrichmentRequest, EnrichmentResult } from '../types.js';

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

  async getCredits(): Promise<number | null> {
    // Apollo does not expose an API endpoint for checking credit balance
    return null;
  }
}
