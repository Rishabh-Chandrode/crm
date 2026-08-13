import { CONFIG } from '../../../config.js';
import type { EnrichmentProvider, EnrichmentRequest, EnrichmentResult } from '../types.js';

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
