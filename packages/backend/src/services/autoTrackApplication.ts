import { pool } from '../db/index.js';

function formatSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Parses job metadata (company name, role, platform) from a job board or career page URL.
 */
export function inferJobMetadataFromUrl(rawUrl: string): {
  company_name?: string;
  job_title?: string;
  platform: string;
} {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;

    let company: string | undefined;
    let title: string | undefined;
    let platform = 'Email';

    if (host.includes('lever.co')) {
      platform = 'Lever';
      const parts = path.split('/').filter(Boolean);
      if (parts.length > 0) company = formatSlug(parts[0]!);
      if (parts.length > 1 && !/^[0-9a-f-]+$/i.test(parts[1]!)) title = formatSlug(parts[1]!);
    } else if (host.includes('greenhouse.io')) {
      platform = 'Greenhouse';
      const parts = path.split('/').filter(Boolean);
      if (parts.length > 0 && parts[0] !== 'embed') {
        company = formatSlug(parts[0]!);
      }
    } else if (host.includes('myworkdayjobs.com') || host.includes('workday.com')) {
      platform = 'Workday';
      const subdomain = host.split('.')[0];
      if (subdomain && subdomain !== 'www') company = formatSlug(subdomain);
    } else if (host.includes('ashbyhq.com')) {
      platform = 'Ashby';
      const parts = path.split('/').filter(Boolean);
      if (parts.length > 0) company = formatSlug(parts[0]!);
    } else if (host.includes('smartrecruiters.com')) {
      platform = 'SmartRecruiters';
      const parts = path.split('/').filter(Boolean);
      if (parts.length > 0) company = formatSlug(parts[0]!);
    } else if (host.includes('linkedin.com')) {
      platform = 'LinkedIn';
    } else {
      // General domain heuristic: strip subdomains like careers., jobs., www.
      const domainParts = host.split('.');
      const mainDomain = domainParts.length >= 2 ? domainParts[domainParts.length - 2] : host;
      if (mainDomain && !['jobs', 'careers', 'apply', 'app', 'hire', 'work'].includes(mainDomain)) {
        company = formatSlug(mainDomain);
      }
    }

    // Try extracting role/title from trailing url slug if it looks like words
    if (!title) {
      const segments = path.split('/').filter(Boolean);
      const last = segments[segments.length - 1];
      if (last && last.includes('-') && !/^[0-9a-f-]{10,}$/i.test(last) && !/^\d+$/.test(last)) {
        title = formatSlug(last);
      }
    }

    return { company_name: company, job_title: title, platform };
  } catch {
    return { platform: 'Email' };
  }
}

/**
 * When an email is sent with a `jobUrl` custom variable, automatically create
 * or enrich a job_application record with status "not_applied".
 *
 * Intelligently resolves company name and job title from:
 *   1. Custom values in the email
 *   2. Prospect / company fallback context
 *   3. Inferred metadata from the job URL
 *
 * Recognised custom variable keys (case-insensitive lookup):
 *   - jobUrl        → job_url   (required – without this, nothing happens)
 *   - companyName   → company_name
 *   - jobTitle      → job_title
 *   - platform      → platform
 *   - notes         → notes
 */
export async function maybeCreateApplicationFromEmail(
  userId: string,
  customValues: Record<string, string>,
  fallbackContext?: {
    companyName?: string | null;
    jobTitle?: string | null;
    platform?: string | null;
  },
): Promise<void> {
  // Resolve the job URL – the trigger for auto-tracking
  const jobUrl = customValues['jobUrl'] ?? customValues['job_url'];
  if (!jobUrl) return;

  const inferred = inferJobMetadataFromUrl(jobUrl);

  const customCompany =
    customValues['companyName'] ??
    customValues['company_name'] ??
    customValues['company'] ??
    '';

  const customTitle =
    customValues['jobTitle'] ??
    customValues['job_title'] ??
    customValues['role'] ??
    customValues['position'] ??
    '';

  const customPlatform = customValues['platform'] ?? '';
  const notes = customValues['notes'] ?? null;

  const resolvedCompanyName =
    customCompany.trim() ||
    fallbackContext?.companyName?.trim() ||
    inferred.company_name ||
    'Unknown';

  const resolvedJobTitle =
    customTitle.trim() ||
    fallbackContext?.jobTitle?.trim() ||
    inferred.job_title ||
    'Job Application';

  const resolvedPlatform =
    customPlatform.trim() ||
    fallbackContext?.platform?.trim() ||
    inferred.platform ||
    'Email';

  // Check if an application already exists
  const existing = await pool.query(
    `SELECT id, company_name, job_title FROM job_applications WHERE user_id = $1 AND job_url = $2 LIMIT 1`,
    [userId, jobUrl],
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0] as { id: string; company_name: string; job_title: string };
    const needCompanyUpdate =
      (row.company_name === 'Unknown' || !row.company_name) && resolvedCompanyName !== 'Unknown';
    const needTitleUpdate =
      (row.job_title === 'Unknown' || row.job_title === 'Job Application' || !row.job_title) &&
      resolvedJobTitle !== 'Job Application' &&
      resolvedJobTitle !== 'Unknown';

    if (needCompanyUpdate || needTitleUpdate) {
      await pool.query(
        `UPDATE job_applications
         SET company_name = CASE WHEN $1 != 'Unknown' THEN $1 ELSE company_name END,
             job_title    = CASE WHEN $2 NOT IN ('Unknown', 'Job Application') THEN $2 ELSE job_title END,
             updated_at   = NOW()
         WHERE id = $3 AND user_id = $4`,
        [resolvedCompanyName, resolvedJobTitle, row.id, userId],
      );
    }
    return;
  }

  // Upsert company if a name was resolved
  if (resolvedCompanyName && resolvedCompanyName !== 'Unknown') {
    const companyExists = await pool.query(
      `SELECT id FROM companies WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [resolvedCompanyName],
    );
    if (companyExists.rows.length === 0) {
      try {
        await pool.query(
          `INSERT INTO companies (name, created_by) VALUES ($1, $2)`,
          [resolvedCompanyName, userId],
        );
      } catch (err) {
        // Ignore duplicate key error (race condition)
        if ((err as { code?: string }).code !== '23505') throw err;
      }
    }
  }

  // Create the application
  await pool.query(
    `INSERT INTO job_applications (user_id, company_name, job_title, job_url, platform, status, notes)
     VALUES ($1, $2, $3, $4, $5, 'not_applied', $6)`,
    [userId, resolvedCompanyName, resolvedJobTitle, jobUrl, resolvedPlatform, notes],
  );
}
