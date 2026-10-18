import { pool } from '../../db/index.js';
import type { CandidatePreferences, JobEmailSyncResult, JobApplication } from '../../types/index.js';
import { fetchJobAndStatusEmails } from './gmailFetcher.js';
import { extractJobsFromEmail } from './jobExtractor.js';
import { scrapeJobDetails } from './jobScraper.js';
import {
  classifyEmail,
  scoreJobAgainstPreferences,
  extractApplicationUpdateDetails,
  extractJobOpportunitiesWithAi,
} from './jobClassifierAndScorer.js';

interface UserRow {
  id: string;
  candidate_preferences: CandidatePreferences | null;
  target_roles?: string[] | string | null;
  skills?: string[] | string | null;
  years_of_experience?: string | null;
  expected_ctc?: string | null;
  location?: string | null;
  last_job_email_synced_at: Date | null;
  job_email_sync_enabled: boolean;
}

export async function syncJobEmailsForUser(userId: string): Promise<JobEmailSyncResult> {
  const result: JobEmailSyncResult = {
    discovered: 0,
    updated: 0,
    scanned: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const userRes = await pool.query<UserRow>(
      `SELECT id, candidate_preferences, target_roles, skills, years_of_experience, expected_ctc, location, last_job_email_synced_at, job_email_sync_enabled
       FROM users WHERE id = $1`,
      [userId]
    );

    const user = userRes.rows[0];
    if (!user || user.job_email_sync_enabled === false) {
      return result;
    }

    const rawPrefs: Partial<CandidatePreferences> = user.candidate_preferences || {};
    const userTargetRoles = Array.isArray(user.target_roles)
      ? user.target_roles
      : typeof user.target_roles === 'string'
      ? JSON.parse(user.target_roles || '[]')
      : [];
    const userSkills = Array.isArray(user.skills)
      ? user.skills
      : typeof user.skills === 'string'
      ? JSON.parse(user.skills || '[]')
      : [];
    const minExp = user.years_of_experience ? parseInt(user.years_of_experience, 10) || undefined : undefined;

    const preferences: CandidatePreferences = {
      target_roles: Array.isArray(rawPrefs.target_roles) && rawPrefs.target_roles.length > 0
        ? rawPrefs.target_roles
        : userTargetRoles,
      target_skills: Array.isArray(rawPrefs.target_skills) && rawPrefs.target_skills.length > 0
        ? rawPrefs.target_skills
        : userSkills,
      preferred_locations: Array.isArray(rawPrefs.preferred_locations) && rawPrefs.preferred_locations.length > 0
        ? rawPrefs.preferred_locations
        : (user.location ? [user.location] : []),
      remote_only: rawPrefs.remote_only ?? false,
      min_experience_years: rawPrefs.min_experience_years ?? minExp,
      max_experience_years: rawPrefs.max_experience_years,
      min_salary: rawPrefs.min_salary || user.expected_ctc || undefined,
      notes: rawPrefs.notes,
    };
    const emails = await fetchJobAndStatusEmails(userId, user.last_job_email_synced_at);
    result.scanned = emails.length;

    for (const email of emails) {
      try {
        const intent = await classifyEmail(email.subject, email.bodyText, email.from);

        if (intent === 'job_recommendation') {
          const extractedJobs = await extractJobOpportunitiesWithAi(
            email.subject,
            email.bodyText,
            email.from,
            email.bodyHtml
          );

          for (const job of extractedJobs) {
            const cleanUrl = job.url && job.url !== '#' ? job.url : '#';

            // Check if already in database by URL or source_email_id
            const existing = await pool.query(
              `SELECT id FROM job_applications
               WHERE user_id = $1 AND (
                 (job_url = $2 AND job_url NOT IN ('#', ''))
                 OR (source_email_id = $3 AND LOWER(company_name) = LOWER($4) AND LOWER(job_title) = LOWER($5))
               )
               LIMIT 1`,
              [userId, cleanUrl, email.id, job.company, job.title]
            );

            if (existing.rowCount && existing.rowCount > 0) {
              result.skipped++;
              continue;
            }

            const isConfirmed = Boolean(
              job.isConfident &&
              job.isComplete &&
              job.company &&
              !['company', 'unknown', 'confidential', 'various'].includes(job.company.trim().toLowerCase()) &&
              job.title &&
              job.title.trim().length > 0
            );

            let companyId: string | null = null;
            const trimmedCompany = job.company.trim();

            if (isConfirmed) {
              // Confident extraction: Auto-resolve or add company to DB if not present
              const compRes = await pool.query<{ id: string }>(
                `SELECT id FROM companies
                 WHERE LOWER(name) = LOWER($1) AND (created_by = $2 OR created_by IS NULL)
                 LIMIT 1`,
                [trimmedCompany, userId]
              );

              if (compRes.rowCount && compRes.rowCount > 0) {
                companyId = compRes.rows[0]!.id;
              } else {
                try {
                  const compInsert = await pool.query<{ id: string }>(
                    `INSERT INTO companies (name, created_by) VALUES ($1, $2) RETURNING id`,
                    [trimmedCompany, userId]
                  );
                  companyId = compInsert.rows[0]?.id || null;
                } catch {
                  const compRecheck = await pool.query<{ id: string }>(
                    `SELECT id FROM companies
                     WHERE LOWER(name) = LOWER($1) AND (created_by = $2 OR created_by IS NULL)
                     LIMIT 1`,
                    [trimmedCompany, userId]
                  );
                  companyId = compRecheck.rows[0]?.id || null;
                }
              }

              // Scrape description if URL is available
              const details = cleanUrl !== '#'
                ? await scrapeJobDetails(cleanUrl, job.descriptionSnippet || job.title)
                : { description: job.descriptionSnippet || job.title, title: job.title };

              // Fit scoring against preferences
              const score = await scoreJobAgainstPreferences(
                job.title,
                job.company,
                details.description,
                preferences
              );

              // Insert into `jobs` table with status 'open'
              let jobId: string | null = null;
              try {
                const jobInsert = await pool.query<{ id: string }>(
                  `INSERT INTO jobs (title, job_url, company_id, status, created_by, notes)
                   VALUES ($1, $2, $3, $4, $5, $6)
                   RETURNING id`,
                  [job.title, cleanUrl, companyId, 'open', userId, `Imported via email alert: ${email.subject.slice(0, 100)}`]
                );
                jobId = jobInsert.rows[0]?.id || null;
              } catch {
                // Ignore job insert conflict
              }

              // Insert confirmed application as 'not_applied'
              await pool.query(
                `INSERT INTO job_applications (
                   user_id, company_id, job_id, company_name, job_title, job_url,
                   platform, status, notes, match_score, match_reasons, missing_skills,
                   description, location, salary_range, source_email_id, email_source, applied_at
                 ) VALUES (
                   $1, $2, $3, $4, $5, $6, $7, 'not_applied', $8, $9, $10, $11, $12, $13, $14, $15, 'email', $16
                 )
                 ON CONFLICT (user_id, job_url) WHERE job_url NOT IN ('#', '')
                 DO UPDATE SET
                   match_score = COALESCE(job_applications.match_score, EXCLUDED.match_score),
                   source_email_id = COALESCE(job_applications.source_email_id, EXCLUDED.source_email_id),
                   updated_at = NOW()`,
                [
                  userId,
                  companyId,
                  jobId,
                  job.company,
                  job.title,
                  cleanUrl,
                  job.platform || 'Email',
                  `Discovered from email: "${email.subject.slice(0, 80)}"`,
                  score.matchScore,
                  score.matchReasons,
                  score.missingSkills,
                  details.description,
                  job.location || null,
                  job.salaryRange || null,
                  email.id,
                  email.date,
                ]
              );

              result.discovered++;
            } else {
              // Unconfirmed extraction: Do not add company to DB. Link existing if matches.
              if (trimmedCompany && !['company', 'unknown'].includes(trimmedCompany.toLowerCase())) {
                const compRes = await pool.query<{ id: string }>(
                  `SELECT id FROM companies
                   WHERE LOWER(name) = LOWER($1) AND (created_by = $2 OR created_by IS NULL)
                   LIMIT 1`,
                  [trimmedCompany, userId]
                );
                if (compRes.rowCount && compRes.rowCount > 0) {
                  companyId = compRes.rows[0]!.id;
                }
              }

              // Insert into `jobs` table with status 'unconfirmed'
              let jobId: string | null = null;
              try {
                const jobInsert = await pool.query<{ id: string }>(
                  `INSERT INTO jobs (title, job_url, company_id, status, created_by, notes)
                   VALUES ($1, $2, $3, $4, $5, $6)
                   RETURNING id`,
                  [
                    job.title || 'Unconfirmed Role',
                    cleanUrl,
                    companyId,
                    'unconfirmed',
                    userId,
                    `Unconfirmed job from email alert: ${email.subject.slice(0, 100)}`
                  ]
                );
                jobId = jobInsert.rows[0]?.id || null;
              } catch {
                // Ignore conflict
              }

              const unconfirmedNotes = [
                `Unconfirmed opportunity from email: "${email.subject.slice(0, 80)}"`,
                job.reasoning ? `AI note: ${job.reasoning}` : null,
                !job.company || ['company', 'unknown'].includes(job.company.toLowerCase()) ? 'Company name needs verification.' : null,
                !job.title ? 'Job title needs verification.' : null,
                cleanUrl === '#' ? 'Job URL needs verification.' : null,
              ].filter(Boolean).join('\n');

              // Insert unconfirmed application with status 'unconfirmed'
              await pool.query(
                `INSERT INTO job_applications (
                   user_id, company_id, job_id, company_name, job_title, job_url,
                   platform, status, notes, match_score, match_reasons, missing_skills,
                   description, location, salary_range, source_email_id, email_source, applied_at
                 ) VALUES (
                   $1, $2, $3, $4, $5, $6, $7, 'unconfirmed', $8, $9, $10, $11, $12, $13, $14, $15, 'email', $16
                 )
                 ON CONFLICT (user_id, job_url) WHERE job_url NOT IN ('#', '')
                 DO UPDATE SET
                   notes = COALESCE(EXCLUDED.notes, job_applications.notes),
                   updated_at = NOW()`,
                [
                  userId,
                  companyId,
                  jobId,
                  job.company || 'Unknown Company',
                  job.title || 'Job Opportunity',
                  cleanUrl,
                  job.platform || 'Email',
                  unconfirmedNotes,
                  null,
                  ['Needs verification in Priority Action Center'],
                  [],
                  job.descriptionSnippet || null,
                  job.location || null,
                  job.salaryRange || null,
                  email.id,
                  email.date,
                ]
              );

              result.discovered++;
            }
          }
        } else if (intent === 'application_update') {
          const update = await extractApplicationUpdateDetails(email.subject, email.bodyText, email.from);
          if (update && update.companyName) {
            // Find application for this company (prioritize actual job applications over placeholders)
            const matchRes = await pool.query<JobApplication>(
              `SELECT id, status, notes FROM job_applications
               WHERE user_id = $1 AND (
                 LOWER(company_name) = LOWER($2)
                 OR LOWER(company_name) LIKE LOWER($3)
                 OR LOWER($2) LIKE '%' || LOWER(company_name) || '%'
               )
               ORDER BY
                 CASE WHEN job_url != '#' AND job_title NOT ILIKE 'Role at %' THEN 0 ELSE 1 END,
                 created_at DESC
               LIMIT 1`,
              [userId, update.companyName, `%${update.companyName}%`]
            );

            if (matchRes.rowCount && matchRes.rowCount > 0) {
              const target = matchRes.rows[0]!;
              const updatedNotes = `${target.notes || ''}\n[Update ${new Date().toISOString().split('T')[0]}] ${update.note}`.trim();

              await pool.query(
                `UPDATE job_applications
                 SET status = $1, notes = $2, updated_at = NOW()
                 WHERE id = $3`,
                [update.status, updatedNotes, target.id]
              );
              result.updated++;
            } else {
              // Create an application record with this update status
              await pool.query(
                `INSERT INTO job_applications (
                   user_id, company_name, job_title, job_url, platform,
                   status, notes, source_email_id, email_source, applied_at
                 ) VALUES (
                   $1, $2, $3, $4, 'Email', $5, $6, $7, 'email', $8
                 )`,
                [
                  userId,
                  update.companyName,
                  'Role at ' + update.companyName,
                  '#',
                  update.status,
                  `Auto-tracked from status email: "${email.subject.slice(0, 80)}"`,
                  email.id,
                  email.date,
                ]
              );
              result.updated++;
            }
          }
        } else {
          result.skipped++;
        }
      } catch (emailErr) {
        console.warn(`[SyncOrchestrator] Error processing email ${email.id}:`, emailErr);
        result.errors?.push(String(emailErr));
      }
    }

    // Advance sync cursor
    await pool.query(
      `UPDATE users SET last_job_email_synced_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [userId]
    );
  } catch (err) {
    console.error(`[SyncOrchestrator] Fatal error syncing for user ${userId}:`, err);
    result.errors?.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}

/**
 * Runs periodically in scheduler.ts for all users who have Gmail connected.
 */
export async function syncAllActiveUsers(): Promise<number> {
  const users = await pool.query<{ id: string }>(
    `SELECT id FROM users
     WHERE (gmail_refresh_token IS NOT NULL OR gmail_access_token IS NOT NULL)
       AND job_email_sync_enabled = TRUE`
  );

  let totalDiscovered = 0;
  for (const user of users.rows) {
    try {
      const res = await syncJobEmailsForUser(user.id);
      totalDiscovered += res.discovered;
    } catch (err) {
      console.error(`[JobEmailSync] Auto sync failed for user ${user.id}:`, err);
    }
  }

  return totalDiscovered;
}
