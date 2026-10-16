import { pool } from '../db/index.js';
import type { PendingProspect } from '../types/index.js';

export function extractLinkedInSlug(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/(?:in|pub)\/([a-zA-Z0-9_\-%]+)/i);
  return match ? match[1].toLowerCase() : null;
}

export function normalizeLinkedInUrl(url: string): string {
  return url.trim().split('?')[0]!.toLowerCase().replace(/\/+$/, '');
}

export interface MatchPendingCriteria {
  linkedin_url?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
}

export async function findMatchingPendingProspect(
  userId: string,
  criteria: MatchPendingCriteria,
): Promise<PendingProspect | null> {
  const normUrl = criteria.linkedin_url ? normalizeLinkedInUrl(criteria.linkedin_url) : null;
  const slug = extractLinkedInSlug(criteria.linkedin_url);
  const firstName = criteria.first_name?.trim() ? criteria.first_name.trim().toLowerCase() : null;
  const lastName = criteria.last_name?.trim() ? criteria.last_name.trim().toLowerCase() : null;
  const companyName = criteria.company_name?.trim() ? criteria.company_name.trim().toLowerCase() : null;

  if (!normUrl && !slug && !firstName) {
    return null;
  }

  try {
    const result = await pool.query<PendingProspect>(
      `SELECT * FROM pending_prospects
       WHERE user_id = $1
         AND dismissed_at IS NULL
         AND (
           ($2::text IS NOT NULL AND LOWER(TRIM(TRAILING '/' FROM linkedin_url)) = $2)
           OR ($3::text IS NOT NULL AND SUBSTRING(LOWER(linkedin_url) FROM '/(?:in|pub)/([^/?#]+)') = $3)
           OR (
             $4::text IS NOT NULL 
             AND LOWER(TRIM(first_name)) = $4
             AND (
               ($5::text IS NULL AND (last_name IS NULL OR TRIM(last_name) = ''))
               OR ($5::text IS NOT NULL AND LOWER(TRIM(last_name)) = $5)
             )
             AND (
               $6::text IS NULL 
               OR company_name IS NULL 
               OR LOWER(TRIM(company_name)) = $6
             )
           )
         )
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, normUrl, slug, firstName, lastName, companyName],
    );

    return result.rows[0] ?? null;
  } catch (err: any) {
    if (err?.code === '42P01') {
      return null;
    }
    console.error('Error finding matching pending prospect:', err);
    return null;
  }
}

export async function dismissPendingProspect(userId: string, pendingId: string): Promise<boolean> {
  try {
    const res = await pool.query(
      `UPDATE pending_prospects
       SET dismissed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND dismissed_at IS NULL`,
      [pendingId, userId],
    );
    return (res.rowCount ?? 0) > 0;
  } catch (err: any) {
    if (err?.code === '42P01') {
      return false;
    }
    console.error('Error dismissing pending prospect:', err);
    return false;
  }
}

export async function dismissMatchingPendingProspects(
  userId: string,
  criteria: MatchPendingCriteria,
): Promise<number> {
  try {
    const match = await findMatchingPendingProspect(userId, criteria);
    if (!match) return 0;
    const res = await pool.query(
      `UPDATE pending_prospects
       SET dismissed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND dismissed_at IS NULL`,
      [match.id, userId],
    );
    return res.rowCount ?? 0;
  } catch (err: any) {
    if (err?.code === '42P01') {
      return 0;
    }
    console.error('Error dismissing matching pending prospects:', err);
    return 0;
  }
}
