import { pool } from '../db/index.js';
import { getEnrichmentService } from './enrichment/index.js';
import { CONFIG } from '../config.js';
import type { DiscoverPeopleRequest, DiscoveredPerson, DiscoverPeopleResponse } from '../types/index.js';

export async function discoverPeople(
  userId: string,
  request: DiscoverPeopleRequest
): Promise<DiscoverPeopleResponse> {
  const service = getEnrichmentService();
  if (!service.discoverPeople) {
    throw new Error(`Active enrichment provider (${CONFIG.activeEnrichmentProvider}) does not support discovering people`);
  }

  const result = await service.discoverPeople(request);
  const people = result.people;

  if (people.length === 0) {
    return {
      data: [],
      total: 0,
      free: result.free,
      provider: CONFIG.activeEnrichmentProvider,
    };
  }

  // Cross-reference with database to flag contacts already in CRM
  const linkedinUrls: string[] = [];
  const names: Array<{ first: string; last?: string }> = [];

  for (const p of people) {
    if (p.linkedin_url?.trim()) {
      const normalized = p.linkedin_url.trim().split('?')[0]!.toLowerCase().replace(/\/+$/, '');
      linkedinUrls.push(normalized);
    }
    if (p.first_name?.trim()) {
      names.push({ first: p.first_name.trim().toLowerCase(), last: p.last_name?.trim()?.toLowerCase() });
    }
  }

  // Query existing prospects for this user
  const conditions: string[] = ['created_by = $1'];
  const values: unknown[] = [userId];

  const orClauses: string[] = [];
  if (linkedinUrls.length > 0) {
    orClauses.push(`LOWER(TRIM(TRAILING '/' FROM linkedin_url)) = ANY($${values.length + 1})`);
    values.push(linkedinUrls);
  }

  if (orClauses.length > 0) {
    conditions.push(`(${orClauses.join(' OR ')})`);
  }

  const existingProspects = await pool.query<{ id: string; linkedin_url: string | null; first_name: string; last_name: string | null }>(
    `SELECT id, linkedin_url, first_name, last_name FROM prospects WHERE ${conditions.join(' AND ')}`,
    values
  );

  const existingUrlMap = new Map<string, string>();
  for (const row of existingProspects.rows) {
    if (row.linkedin_url) {
      const norm = row.linkedin_url.trim().split('?')[0]!.toLowerCase().replace(/\/+$/, '');
      existingUrlMap.set(norm, row.id);
    }
  }

  const markedPeople: DiscoveredPerson[] = people.map((p) => {
    let existingId: string | undefined = undefined;
    if (p.linkedin_url) {
      const norm = p.linkedin_url.trim().split('?')[0]!.toLowerCase().replace(/\/+$/, '');
      existingId = existingUrlMap.get(norm);
    }

    return {
      ...p,
      already_in_crm: Boolean(existingId),
      existing_prospect_id: existingId,
    };
  });

  return {
    data: markedPeople,
    total: result.total,
    free: result.free,
    provider: CONFIG.activeEnrichmentProvider,
  };
}
