import { pool } from '../../db/index.js';
import type { CandidatePreferences, JobEmailSyncResult, JobApplication } from '../../types/index.js';
import { fetchJobAndStatusEmails } from './gmailFetcher.js';
import { extractJobsFromEmail } from './jobExtractor.js';
import { scrapeJobDetails } from './jobScraper.js';
import {
  classifyEmail,
  scoreJobAgainstPreferences,
  extractApplicationUpdateDetails,
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
          const extractedJobs = extractJobsFromEmail(email.subject, email.bodyHtml, email.bodyText);

          for (const job of extractedJobs) {
            // Check if already in database by URL or source_email_id
            const existing = await pool.query(
              `SELECT id FROM job_applications
               WHERE user_id = $1 AND (job_url = $2 OR (source_email_id = $3 AND company_name = $4))
               LIMIT 1`,
              [userId, job.jobUrl, email.id, job.companyName]
            );

            if (existing.rowCount && existing.rowCount > 0) {
              result.skipped++;
              continue;
            }

            // Scrape description
            const details = await scrapeJobDetails(job.jobUrl, job.snippet);

            // Fit scoring
            const score = await scoreJobAgainstPreferences(
              job.title,
              job.companyName,
              details.description,
              preferences
            );

            // Optional: Match or associate with company
            let companyId: string | null = null;
            if (job.companyName && job.companyName !== 'Company') {
              const compRes = await pool.query<{ id: string }>(
                `SELECT id FROM companies
                 WHERE (LOWER(name) = LOWER($1)) AND (created_by = $2 OR created_by IS NULL)
                 LIMIT 1`,
                [job.companyName, userId]
              );
              if (compRes.rowCount && compRes.rowCount > 0) {
                companyId = compRes.rows[0]!.id;
              }
            }

            // Also insert into `jobs` table if needed so it links to referrals
            let jobId: string | null = null;
            try {
              const jobInsert = await pool.query<{ id: string }>(
                `INSERT INTO jobs (title, job_url, company_id, status, created_by, notes)
                 VALUES ($1, $2, $3, 'open', $4, $5)
                 RETURNING id`,
                [job.title, job.jobUrl, companyId, userId, `Imported via email alert: ${email.subject.slice(0, 100)}`]
              );
              jobId = jobInsert.rows[0]?.id || null;
            } catch {
              // Ignore job insert conflict
            }

            await pool.query(
              `INSERT INTO job_applications (
                 user_id, company_id, job_id, company_name, job_title, job_url,
                 platform, status, notes, match_score, match_reasons, missing_skills,
                 description, source_email_id, email_source, applied_at
               ) VALUES (
                 $1, $2, $3, $4, $5, $6, $7, 'not_applied', $8, $9, $10, $11, $12, $13, 'email', $14
               )`,
              [
                userId,
                companyId,
                jobId,
                job.companyName,
                job.title,
                job.jobUrl,
                job.platform,
                `Discovered from email: "${email.subject.slice(0, 80)}"`,
                score.matchScore,
                score.matchReasons,
                score.missingSkills,
                details.description,
                email.id,
                email.date,
              ]
            );

            result.discovered++;
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
