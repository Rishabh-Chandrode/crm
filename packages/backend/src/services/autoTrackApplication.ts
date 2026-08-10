import { pool } from '../db/index.js';

/**
 * When an email is sent with a `jobUrl` custom variable, automatically create
 * a job_application record with status "not_applied".
 *
 * Also upserts the company into the `companies` table if a `companyName`
 * custom variable is provided and no matching company exists.
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
): Promise<void> {
  // Resolve the job URL – the trigger for auto-tracking
  const jobUrl = customValues['jobUrl'] ?? customValues['job_url'];
  if (!jobUrl) return;

  const companyName = customValues['companyName'] ?? customValues['company_name'] ?? customValues['company'] ?? '';
  const jobTitle = customValues['jobTitle'] ?? customValues['job_title'] ?? customValues['role'] ?? '';
  const platform = customValues['platform'] ?? 'Email';
  const notes = customValues['notes'] ?? null;

  // We need at least a company name to create a meaningful record
  const resolvedCompanyName = companyName.trim() || 'Unknown';
  const resolvedJobTitle = jobTitle.trim() || 'Unknown';

  // Avoid duplicates: skip if an application with the same job_url already exists for this user
  const existing = await pool.query(
    `SELECT id FROM job_applications WHERE user_id = $1 AND job_url = $2 LIMIT 1`,
    [userId, jobUrl],
  );
  if (existing.rows.length > 0) return;

  // Upsert company if a name was provided
  if (companyName.trim()) {
    const companyExists = await pool.query(
      `SELECT id FROM companies WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [companyName.trim()],
    );
    if (companyExists.rows.length === 0) {
      try {
        await pool.query(
          `INSERT INTO companies (name, created_by) VALUES ($1, $2)`,
          [companyName.trim(), userId],
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
    [userId, resolvedCompanyName, resolvedJobTitle, jobUrl, platform, notes],
  );
}
