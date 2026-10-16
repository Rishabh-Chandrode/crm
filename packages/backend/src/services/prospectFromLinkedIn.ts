import { pool } from '../db/index.js';
import type { Prospect } from '../types/index.js';
import { getEnrichmentService } from './enrichment/index.js';
import { inferProspectGender } from './genderInference.js';
import { inferRoleCategory } from './roleCategory.js';

export class LinkedInProfileError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'LinkedInProfileError';
  }
}

export type LinkedInProspect = Prospect & { company_name: string | null };

/** LinkedIn person profiles (`/in/{slug}` and `/pub/{slug}`). */
export function isLinkedInProfileUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.toLowerCase().includes('linkedin.com')) return false;
    return /^\/(?:in|pub)\/[^/]+/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/** Strip query and trailing slash, then lowercase, matching prospect lookup. */
export function normalizeLinkedInUrl(url: string): string {
  return url.trim().split('?')[0]!.toLowerCase().replace(/\/+$/, '');
}

function placeholderEmail(firstName: string, lastName: string | undefined, companyName: string | undefined): string {
  const cleanFirst = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanLast = (lastName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanCompany = (companyName || 'contact').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${cleanFirst}${cleanLast ? '.' + cleanLast : ''}@${cleanCompany || 'company'}.crm.local`;
}

async function findByLinkedIn(userId: string, normalizedUrl: string): Promise<LinkedInProspect | null> {
  const result = await pool.query<LinkedInProspect>(
    `SELECT p.*, c.name AS company_name
     FROM prospects p
     LEFT JOIN companies c ON c.id = p.company_id
     WHERE p.created_by = $1 AND LOWER(TRIM(TRAILING '/' FROM p.linkedin_url)) = $2
     LIMIT 1`,
    [userId, normalizedUrl],
  );
  return result.rows[0] ?? null;
}

async function resolveCompanyId(userId: string, companyName: string | undefined): Promise<string | null> {
  const name = companyName?.trim();
  if (!name) return null;

  const existing = await pool.query<{ id: string }>(
    'SELECT id FROM companies WHERE LOWER(name) = LOWER($1) AND created_by = $2 LIMIT 1',
    [name, userId],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const created = await pool.query<{ id: string }>(
    'INSERT INTO companies (name, created_by) VALUES ($1, $2) RETURNING id',
    [name, userId],
  );
  return created.rows[0]?.id ?? null;
}

export async function createProspectFromLinkedIn(
  userId: string,
  linkedinUrl: string,
): Promise<{ data: LinkedInProspect; created: boolean }> {
  const trimmed = linkedinUrl.trim();
  if (!isLinkedInProfileUrl(trimmed)) {
    throw new LinkedInProfileError('A LinkedIn profile URL is required', 400);
  }

  const normalized = normalizeLinkedInUrl(trimmed);
  const existing = await findByLinkedIn(userId, normalized);
  if (existing) {
    return { data: existing, created: false };
  }

  let enriched;
  try {
    enriched = await getEnrichmentService().enrich({ linkedin_url: normalized });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to enrich prospect';
    throw new LinkedInProfileError(message, 400);
  }

  const firstName = enriched.first_name?.trim();
  if (!firstName) {
    throw new LinkedInProfileError('Enrichment did not return a name for this profile', 400);
  }

  const lastName = enriched.last_name?.trim() || null;
  const companyName = enriched.company_name?.trim() || undefined;
  const jobTitle = enriched.job_title?.trim() || null;
  const email = (enriched.email?.trim() || placeholderEmail(firstName, lastName ?? undefined, companyName)).toLowerCase();
  const companyId = await resolveCompanyId(userId, companyName);
  const roleCategory = inferRoleCategory(jobTitle);
  const gender = inferProspectGender({ firstName });

  try {
    const inserted = await pool.query<Prospect>(
      `INSERT INTO prospects (company_id, first_name, last_name, email, job_title, role_category, linkedin_url, phone, notes, gender, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        companyId,
        firstName,
        lastName,
        email,
        jobTitle,
        roleCategory,
        normalized,
        null,
        null,
        gender,
        userId,
      ],
    );
    const row = inserted.rows[0];
    if (!row) {
      throw new LinkedInProfileError('Failed to create prospect', 400);
    }
    return { data: { ...row, company_name: companyName ?? null }, created: true };
  } catch (err) {
    if (err instanceof LinkedInProfileError) throw err;
    if ((err as { code?: string }).code === '23505') {
      throw new LinkedInProfileError('A prospect with this email already exists', 409);
    }
    throw err;
  }
}
