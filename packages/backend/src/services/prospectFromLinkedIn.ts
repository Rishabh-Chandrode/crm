import { pool } from '../db/index.js';
import type { Prospect, PendingProspect } from '../types/index.js';
import { ProspeoProvider } from './enrichment/providers/prospeo.js';
import { ApolloProvider } from './enrichment/providers/apollo.js';
import type { EnrichmentResult } from './enrichment/types.js';
import { inferProspectGender } from './genderInference.js';
import { inferRoleCategory } from './roleCategory.js';

export class LinkedInProfileError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'LinkedInProfileError';
  }
}

export type LinkedInProspect = Prospect & { company_name: string | null };

export type CreateProspectFromLinkedInResult = {
  data?: LinkedInProspect;
  pendingProspect?: PendingProspect;
  created: boolean;
  manual_required?: boolean;
  message?: string;
};

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

export function extractNameFromSlug(url: string): { first_name?: string; last_name?: string } {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/(?:in|pub)\/([^/]+)/i);
    if (match?.[1]) {
      const parts = match[1]
        .replace(/[-_.]/g, ' ')
        .replace(/\d+/g, '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (parts.length > 0 && parts[0]) {
        const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        return {
          first_name: cap(parts[0]),
          last_name: parts.slice(1).map(cap).join(' ') || undefined,
        };
      }
    }
  } catch {
    // Ignore invalid url
  }
  return {};
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
): Promise<CreateProspectFromLinkedInResult> {
  const trimmed = linkedinUrl.trim();
  if (!isLinkedInProfileUrl(trimmed)) {
    throw new LinkedInProfileError('A LinkedIn profile URL is required', 400);
  }

  const normalized = normalizeLinkedInUrl(trimmed);
  const existing = await findByLinkedIn(userId, normalized);
  if (existing) {
    return { data: existing, created: false };
  }

  let enriched: EnrichmentResult | null = null;

  // 1. First try with Prospeo
  try {
    const prospeo = new ProspeoProvider();
    const res = await prospeo.enrich({ linkedin_url: normalized });
    if (res && (res.first_name || res.email || res.company_name || res.job_title)) {
      enriched = res;
    }
  } catch {
    // Prospeo enrichment failed or threw, fall through to Apollo
  }

  // 2. If Prospeo did not give an email, try with Apollo
  if (!enriched?.email?.trim()) {
    try {
      const apollo = new ApolloProvider();
      const apolloRes = await apollo.enrich({
        linkedin_url: normalized,
        first_name: enriched?.first_name,
        last_name: enriched?.last_name,
        company_name: enriched?.company_name,
      });

      if (apolloRes) {
        if (apolloRes.email?.trim()) {
          enriched = {
            email: apolloRes.email.trim(),
            first_name: apolloRes.first_name?.trim() || enriched?.first_name,
            last_name: apolloRes.last_name?.trim() || enriched?.last_name,
            job_title: apolloRes.job_title?.trim() || enriched?.job_title,
            company_name: apolloRes.company_name?.trim() || enriched?.company_name,
            linkedin_url: apolloRes.linkedin_url?.trim() || enriched?.linkedin_url || normalized,
          };
        } else if (!enriched) {
          enriched = apolloRes;
        }
      }
    } catch {
      // Apollo enrichment failed or threw
    }
  }

  const email = enriched?.email?.trim()?.toLowerCase();

  // 3. If both APIs don't give the email:
  // "if both api don't give the email of the person then don't add it to prospect instead make a entry in priority section to manually enter the prospect. don't add the dummy email if email not found in all the apis"
  if (!enriched || !email) {
    let firstName = enriched?.first_name?.trim() || null;
    let lastName = enriched?.last_name?.trim() || null;
    if (!firstName) {
      const fromSlug = extractNameFromSlug(normalized);
      firstName = fromSlug.first_name || null;
      lastName = lastName || fromSlug.last_name || null;
    }
    const companyName = enriched?.company_name?.trim() || null;
    const jobTitle = enriched?.job_title?.trim() || null;

    // Check if already in pending_prospects
    const existingPending = await pool.query<PendingProspect>(
      `SELECT * FROM pending_prospects
       WHERE user_id = $1 AND LOWER(TRIM(TRAILING '/' FROM linkedin_url)) = $2 AND dismissed_at IS NULL
       LIMIT 1`,
      [userId, normalized],
    );

    if (existingPending.rows[0]) {
      return {
        pendingProspect: existingPending.rows[0],
        created: false,
        manual_required: true,
        message: 'Email not found via Prospeo or Apollo. An entry is already in your Priority Action Center for manual entry.',
      };
    }

    const insertedPending = await pool.query<PendingProspect>(
      `INSERT INTO pending_prospects (user_id, linkedin_url, first_name, last_name, company_name, job_title)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, normalized, firstName, lastName, companyName, jobTitle],
    );

    return {
      pendingProspect: insertedPending.rows[0],
      created: true,
      manual_required: true,
      message: 'Email not found via Prospeo or Apollo. Added to Priority Action Center to manually enter prospect.',
    };
  }

  // 4. Email was found by one of the APIs! Add to prospects
  const firstName = enriched.first_name?.trim();
  if (!firstName) {
    throw new LinkedInProfileError('Enrichment did not return a name for this profile', 400);
  }

  const lastName = enriched.last_name?.trim() || null;
  const companyName = enriched.company_name?.trim() || undefined;
  const jobTitle = enriched.job_title?.trim() || null;
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

    // Dismiss any active pending prospect entry for this url if one existed
    await pool.query(
      `UPDATE pending_prospects SET dismissed_at = NOW()
       WHERE user_id = $1 AND LOWER(TRIM(TRAILING '/' FROM linkedin_url)) = $2 AND dismissed_at IS NULL`,
      [userId, normalized],
    );

    return { data: { ...row, company_name: companyName ?? null }, created: true };
  } catch (err) {
    if (err instanceof LinkedInProfileError) throw err;
    if ((err as { code?: string }).code === '23505') {
      throw new LinkedInProfileError('A prospect with this email already exists', 409);
    }
    throw err;
  }
}
