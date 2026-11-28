import { pool } from '../../db/index.js';
import type { CandidatePreferences, JobEmailSyncResult, JobApplication } from '../../types/index.js';
import { pushNotificationService } from '../pushNotificationService.js';
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

function normalizeCompanyCore(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]+/g, ' ')
    .replace(/\b(inc|llc|ltd|pvt|corp|corporation|co|limited|technologies|technology|tech|solutions|services|group|labs)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapAppStatusToJobStatus(appStatus: string): string | null {
  if (appStatus === 'screening' || appStatus === 'interview') return 'interviewing';
  if (appStatus === 'applied') return 'applied';
  if (appStatus === 'offer' || appStatus === 'rejected') return 'closed';
  return null;
}

async function findOrCreateJob(
  userId: string,
  title: string,
  cleanUrl: string,
  companyId: string | null,
  status: 'open' | 'unconfirmed',
  notes: string,
  companyNameForNotify: string
): Promise<string | null> {
  try {
    const existingJob = await pool.query<{ id: string }>(
      `SELECT id FROM jobs
       WHERE created_by = $1 AND (
         (job_url = $2 AND job_url NOT IN ('#', ''))
         OR ($3::uuid IS NOT NULL AND company_id = $3 AND LOWER(TRIM(title)) = LOWER(TRIM($4)))
       )
       LIMIT 1`,
      [userId, cleanUrl, companyId, title]
    );
    if (existingJob.rowCount && existingJob.rowCount > 0) {
      return existingJob.rows[0]!.id;
    }

    const jobInsert = await pool.query<{ id: string }>(
      `INSERT INTO jobs (title, job_url, company_id, status, created_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [title, cleanUrl, companyId, status, userId, notes]
    );
    const jobId = jobInsert.rows[0]?.id || null;
    if (jobId) {
      void pushNotificationService.notifyJobAdded(userId, {
        jobId,
        title,
        companyName: companyNameForNotify,
        jobUrl: cleanUrl,
      }).catch(() => undefined);
    }
    return jobId;
  } catch {
    return null;
  }
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

            // Check if already in database by URL, source_email_id, or same (company, title)
            const existing = await pool.query(
              `SELECT id FROM job_applications
               WHERE user_id = $1 AND (
                 (job_url = $2 AND job_url NOT IN ('#', ''))
                 OR (source_email_id = $3 AND LOWER(company_name) = LOWER($4) AND LOWER(job_title) = LOWER($5))
                 OR (
                   LOWER(TRIM(company_name)) = LOWER(TRIM($4))
                   AND LOWER(TRIM(job_title)) = LOWER(TRIM($5))
                   AND LOWER(TRIM(company_name)) NOT IN ('unknown company', 'company', '')
                 )
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

              // Insert into `jobs` table with status 'open' (deduplicated)
              const jobId = await findOrCreateJob(
                userId,
                job.title,
                cleanUrl,
                companyId,
                'open',
                `Imported via email alert: ${email.subject.slice(0, 100)}`,
                job.company
              );

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

              // Insert into `jobs` table with status 'unconfirmed' (deduplicated)
              const jobId = await findOrCreateJob(
                userId,
                job.title || 'Unconfirmed Role',
                cleanUrl,
                companyId,
                'unconfirmed',
                `Unconfirmed job from email alert: ${email.subject.slice(0, 100)}`,
                job.company
              );

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
          // Skip if this exact status email was already processed
          const alreadyProcessed = await pool.query(
            `SELECT id FROM job_applications WHERE user_id = $1 AND source_email_id = $2 LIMIT 1`,
            [userId, email.id]
          );
          if (alreadyProcessed.rowCount && alreadyProcessed.rowCount > 0) {
            result.skipped++;
            continue;
          }

          const update = await extractApplicationUpdateDetails(email.subject, email.bodyText, email.from);
          if (update && update.companyName) {
            const coreCompany = normalizeCompanyCore(update.companyName);
            const corePattern = coreCompany.length >= 3 ? `%${coreCompany}%` : `%${update.companyName}%`;
            const titlePattern = update.jobTitle ? `%${update.jobTitle}%` : '';

            // 1. Find existing application for this company (prioritize job title match & real applications over placeholders)
            const matchRes = await pool.query<JobApplication>(
              `SELECT id, job_id, status, notes, job_title, company_name FROM job_applications
               WHERE user_id = $1 AND (
                 LOWER(company_name) = LOWER($2)
                 OR LOWER(company_name) LIKE LOWER($3)
                 OR LOWER($2) LIKE '%' || LOWER(company_name) || '%'
                 OR LOWER(company_name) LIKE LOWER($4)
               )
               ORDER BY
                 CASE WHEN $5 != '' AND (LOWER(job_title) = LOWER($6) OR LOWER(job_title) LIKE LOWER($5)) THEN 0 ELSE 1 END,
                 CASE WHEN job_url != '#' AND job_title NOT ILIKE 'Role at %' THEN 0 ELSE 1 END,
                 updated_at DESC,
                 created_at DESC
               LIMIT 1`,
              [userId, update.companyName, `%${update.companyName}%`, corePattern, titlePattern, update.jobTitle || '']
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

              const mappedJobStatus = mapAppStatusToJobStatus(update.status);
              if (target.job_id && mappedJobStatus) {
                await pool.query(
                  `UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2`,
                  [mappedJobStatus, target.job_id]
                ).catch(() => undefined);
              }

              result.updated++;
              void pushNotificationService.notifyApplicationUpdated(userId, {
                applicationId: target.id,
                jobTitle: target.job_title,
                companyName: target.company_name,
                status: update.status,
                notes: updatedNotes,
              }).catch(() => undefined);
            } else {
              // 2. Check if the job exists in `jobs` + `companies` (e.g. saved job or referral outreach without an application row yet)
              const jobMatchRes = await pool.query<{
                id: string;
                title: string;
                job_url: string | null;
                company_id: string | null;
                company_name: string | null;
              }>(
                `SELECT j.id, j.title, j.job_url, j.company_id, c.name AS company_name
                 FROM jobs j
                 LEFT JOIN companies c ON c.id = j.company_id
                 WHERE j.created_by = $1 AND c.name IS NOT NULL AND (
                   LOWER(c.name) = LOWER($2)
                   OR LOWER(c.name) LIKE LOWER($3)
                   OR LOWER($2) LIKE '%' || LOWER(c.name) || '%'
                   OR LOWER(c.name) LIKE LOWER($4)
                 )
                 ORDER BY
                   CASE WHEN $5 != '' AND (LOWER(j.title) = LOWER($6) OR LOWER(j.title) LIKE LOWER($5)) THEN 0 ELSE 1 END,
                   j.created_at DESC
                 LIMIT 1`,
                [userId, update.companyName, `%${update.companyName}%`, corePattern, titlePattern, update.jobTitle || '']
              );

              const matchedJob = jobMatchRes.rows[0];
              if (matchedJob) {
                const insertedApp = await pool.query<{ id: string }>(
                  `INSERT INTO job_applications (
                     user_id, company_id, job_id, company_name, job_title, job_url, platform,
                     status, notes, source_email_id, email_source, applied_at
                   ) VALUES (
                     $1, $2, $3, $4, $5, $6, 'Email', $7, $8, $9, 'email', $10
                   )
                   RETURNING id`,
                  [
                    userId,
                    matchedJob.company_id,
                    matchedJob.id,
                    matchedJob.company_name || update.companyName,
                    matchedJob.title,
                    matchedJob.job_url || '#',
                    update.status,
                    `[Update ${new Date().toISOString().split('T')[0]}] ${update.note}`,
                    email.id,
                    email.date,
                  ]
                );

                const mappedJobStatus = mapAppStatusToJobStatus(update.status);
                if (mappedJobStatus) {
                  await pool.query(
                    `UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2`,
                    [mappedJobStatus, matchedJob.id]
                  ).catch(() => undefined);
                }

                result.updated++;
                if (insertedApp.rows[0]?.id) {
                  void pushNotificationService.notifyApplicationUpdated(userId, {
                    applicationId: insertedApp.rows[0].id,
                    jobTitle: matchedJob.title,
                    companyName: matchedJob.company_name || update.companyName,
                    status: update.status,
                    notes: update.note,
                  }).catch(() => undefined);
                }
              } else {
                // 3. No matching application or saved job — create a placeholder application record
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
                    update.jobTitle || ('Role at ' + update.companyName),
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
