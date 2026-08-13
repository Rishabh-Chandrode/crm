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

export interface EnrichmentProvider {
  enrich(request: EnrichmentRequest): Promise<EnrichmentResult>;
}
