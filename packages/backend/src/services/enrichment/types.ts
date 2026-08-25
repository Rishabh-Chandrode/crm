import type { DiscoverPeopleRequest, DiscoveredPerson } from '../../types/index.js';

export interface EnrichmentRequest {
  first_name?: string;
  last_name?: string;
  company_name?: string;
  linkedin_url?: string;
}

export interface EnrichmentResult {
  email?: string;
  job_title?: string;
  company_name?: string;
  linkedin_url?: string;
}

export interface DiscoverPeopleResult {
  people: DiscoveredPerson[];
  total: number;
  free?: boolean;
}

export interface EnrichmentProvider {
  enrich(request: EnrichmentRequest): Promise<EnrichmentResult>;
  discoverPeople?(request: DiscoverPeopleRequest): Promise<DiscoverPeopleResult>;
  getCredits?(): Promise<number | null>;
}

