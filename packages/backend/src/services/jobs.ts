import { pool } from '../db/index.js';
import type { Job, EmailSend, Company, JobApplication } from '../types/index.js';

export interface ListJobsOptions {
  companyId?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreateJobInput {
  title: string;
  job_url: string;
  company_id?: string | null;
  company_name?: string | null;
  status?: string;
  notes?: string | null;
}

export interface UpdateJobInput {
  title?: string;
  job_url?: string;
  company_id?: string | null;
  status?: string;
  notes?: string | null;
}

export async function listJobs(
  userId: string,
  options: ListJobsOptions = {}
): Promise<{ jobs: Job[]; total: number }> {
  const conditions: string[] = ['j.created_by = $1'];
  const params: unknown[] = [userId];
  let i = 2;

  if (options.companyId) {
    conditions.push(`j.company_id = $${i++}`);
    params.push(options.companyId);
  }

  if (options.status && options.status !== 'all') {
    conditions.push(`j.status = $${i++}`);
    params.push(options.status);
  }

  if (options.search) {
    conditions.push(`(j.title ILIKE $${i} OR c.name ILIKE $${i})`);
    params.push(`%${options.search}%`);
    i++;
  }

  const where = conditions.join(' AND ');
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const countQuery = `
    SELECT COUNT(DISTINCT j.id) as count
    FROM jobs j
    LEFT JOIN companies c ON c.id = j.company_id
    WHERE ${where}
  `;

  const dataQuery = `
    SELECT 
      j.*,
      CASE WHEN c.id IS NOT NULL THEN
        json_build_object('id', c.id, 'name', c.name, 'website', c.website, 'industry', c.industry)
      ELSE NULL END AS company,
      CASE WHEN ja.id IS NOT NULL THEN
        json_build_object(
          'id', ja.id,
          'status', ja.status,
          'applied_at', ja.applied_at,
          'platform', ja.platform
        )
      ELSE NULL END AS application,
      COALESCE(es_stats.email_count, 0)::int AS email_count,
      es_stats.first_sent_at AS referral_requested_at
    FROM jobs j
    LEFT JOIN companies c ON c.id = j.company_id
    LEFT JOIN job_applications ja ON ja.job_id = j.id
    LEFT JOIN (
      SELECT 
        job_id,
        COUNT(id) AS email_count,
        MIN(COALESCE(sent_at, created_at)) AS first_sent_at
      FROM email_sends
      WHERE job_id IS NOT NULL
      GROUP BY job_id
    ) es_stats ON es_stats.job_id = j.id
    WHERE ${where}
    ORDER BY j.created_at DESC
    LIMIT $${i++} OFFSET $${i++}
  `;

  const [countRes, dataRes] = await Promise.all([
    pool.query<{ count: string }>(countQuery, params),
    pool.query(dataQuery, [...params, limit, offset]),
  ]);

  const total = parseInt(countRes.rows[0]?.count ?? '0', 10);
  return { jobs: dataRes.rows as Job[], total };
}

export async function getJobById(
  id: string,
  userId: string
): Promise<(Job & { emails: EmailSend[] }) | null> {
  const jobRes = await pool.query(
    `SELECT 
      j.*,
      CASE WHEN c.id IS NOT NULL THEN
        json_build_object('id', c.id, 'name', c.name, 'website', c.website, 'industry', c.industry)
      ELSE NULL END AS company,
      CASE WHEN ja.id IS NOT NULL THEN
        json_build_object(
          'id', ja.id,
          'status', ja.status,
          'applied_at', ja.applied_at,
          'platform', ja.platform
        )
      ELSE NULL END AS application,
      COALESCE(es_stats.email_count, 0)::int AS email_count,
      es_stats.first_sent_at AS referral_requested_at
    FROM jobs j
    LEFT JOIN companies c ON c.id = j.company_id
    LEFT JOIN job_applications ja ON ja.job_id = j.id
    LEFT JOIN (
      SELECT 
        job_id,
        COUNT(id) AS email_count,
        MIN(COALESCE(sent_at, created_at)) AS first_sent_at
      FROM email_sends
      WHERE job_id IS NOT NULL
      GROUP BY job_id
    ) es_stats ON es_stats.job_id = j.id
    WHERE j.id = $1 AND j.created_by = $2`,
    [id, userId]
  );

  if (jobRes.rows.length === 0) {
    return null;
  }

  const emailsRes = await pool.query(
    `SELECT 
      es.*,
      CASE WHEN p.id IS NOT NULL THEN
        json_build_object('first_name', p.first_name, 'last_name', p.last_name, 'email', p.email, 'job_title', p.job_title)
      ELSE NULL END AS prospect,
      CASE WHEN c.id IS NOT NULL THEN
        json_build_object('name', c.name)
      ELSE NULL END AS company,
      CASE WHEN t.id IS NOT NULL THEN
        json_build_object('name', t.name)
      ELSE NULL END AS template
    FROM email_sends es
    LEFT JOIN prospects p ON p.id = es.prospect_id
    LEFT JOIN companies c ON c.id = es.company_id
    LEFT JOIN email_templates t ON t.id = es.template_id
    WHERE es.job_id = $1
    ORDER BY COALESCE(es.sent_at, es.created_at) DESC`,
    [id]
  );

  return {
    ...(jobRes.rows[0] as Job),
    emails: emailsRes.rows as EmailSend[],
  };
}

export async function createJob(
  userId: string,
  input: CreateJobInput
): Promise<Job> {
  let companyId = input.company_id ?? null;

  // Auto-resolve or create company by name if provided without company_id
  if (!companyId && input.company_name?.trim()) {
    const trimmedName = input.company_name.trim();
    const existingComp = await pool.query<{ id: string }>(
      `SELECT id FROM companies WHERE LOWER(name) = LOWER($1) AND (created_by = $2 OR created_by IS NULL) LIMIT 1`,
      [trimmedName, userId]
    );
    if (existingComp.rows.length > 0) {
      companyId = existingComp.rows[0]!.id;
    } else {
      const newComp = await pool.query<{ id: string }>(
        `INSERT INTO companies (name, created_by) VALUES ($1, $2) RETURNING id`,
        [trimmedName, userId]
      );
      companyId = newComp.rows[0]!.id;
    }
  }

  const result = await pool.query<Job>(
    `INSERT INTO jobs (title, job_url, company_id, status, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.title.trim(),
      input.job_url.trim(),
      companyId,
      input.status || 'open',
      input.notes?.trim() || null,
      userId,
    ]
  );

  const job = result.rows[0]!;

  // Fetch full company object if present
  if (job.company_id) {
    const compRes = await pool.query<Company>(
      `SELECT id, name, website, industry, created_at, updated_at FROM companies WHERE id = $1`,
      [job.company_id]
    );
    job.company = compRes.rows[0];
  }

  return job;
}

export async function updateJob(
  id: string,
  userId: string,
  input: UpdateJobInput
): Promise<Job | null> {
  const updates: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [id, userId];
  let i = 3;

  if (input.title !== undefined) {
    updates.push(`title = $${i++}`);
    params.push(input.title.trim());
  }

  if (input.job_url !== undefined) {
    updates.push(`job_url = $${i++}`);
    params.push(input.job_url.trim());
  }

  if (input.company_id !== undefined) {
    updates.push(`company_id = $${i++}`);
    params.push(input.company_id);
  }

  if (input.status !== undefined) {
    updates.push(`status = $${i++}`);
    params.push(input.status);

    if (input.status === 'applied') {
      const jobInfo = await pool.query<{ company_id: string | null; title: string; job_url: string }>(
        `SELECT company_id, title, job_url FROM jobs WHERE id = $1 AND created_by = $2`,
        [id, userId]
      );
      if (jobInfo.rows.length > 0) {
        const { company_id, title, job_url } = jobInfo.rows[0]!;
        let compName = 'Company';
        if (company_id) {
          const cRes = await pool.query<{ name: string }>(`SELECT name FROM companies WHERE id = $1`, [company_id]);
          if (cRes.rows.length > 0) compName = cRes.rows[0]!.name;
        }
        const existingApp = await pool.query(
          `SELECT id FROM job_applications WHERE job_id = $1 AND user_id = $2`,
          [id, userId]
        );
        if (existingApp.rows.length === 0) {
          await pool.query(
            `INSERT INTO job_applications (user_id, job_id, company_name, job_title, job_url, platform, status, applied_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [userId, id, compName, title, job_url, 'Direct', 'applied']
          );
        }
      }
    } else if (input.status === 'open' || input.status === 'not_applied' || input.status === 'referral_requested') {
      await pool.query(
        `DELETE FROM job_applications WHERE job_id = $1 AND user_id = $2`,
        [id, userId]
      );
    }
  }

  if (input.notes !== undefined) {
    updates.push(`notes = $${i++}`);
    params.push(input.notes ? input.notes.trim() : null);
  }

  const result = await pool.query<Job>(
    `UPDATE jobs
     SET ${updates.join(', ')}
     WHERE id = $1 AND created_by = $2
     RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    return null;
  }

  const job = result.rows[0]!;
  if (job.company_id) {
    const compRes = await pool.query<Company>(
      `SELECT id, name, website, industry, created_at, updated_at FROM companies WHERE id = $1`,
      [job.company_id]
    );
    job.company = compRes.rows[0];
  }

  return job;
}

export async function deleteJob(id: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM jobs WHERE id = $1 AND created_by = $2`,
    [id, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getJobEmails(id: string, userId: string): Promise<EmailSend[]> {
  const checkJob = await pool.query(
    `SELECT id FROM jobs WHERE id = $1 AND created_by = $2`,
    [id, userId]
  );
  if (checkJob.rows.length === 0) {
    return [];
  }

  const result = await pool.query(
    `SELECT 
      es.*,
      CASE WHEN p.id IS NOT NULL THEN
        json_build_object('first_name', p.first_name, 'last_name', p.last_name, 'email', p.email, 'job_title', p.job_title)
      ELSE NULL END AS prospect,
      CASE WHEN c.id IS NOT NULL THEN
        json_build_object('name', c.name)
      ELSE NULL END AS company,
      CASE WHEN t.id IS NOT NULL THEN
        json_build_object('name', t.name)
      ELSE NULL END AS template
    FROM email_sends es
    LEFT JOIN prospects p ON p.id = es.prospect_id
    LEFT JOIN companies c ON c.id = es.company_id
    LEFT JOIN email_templates t ON t.id = es.template_id
    WHERE es.job_id = $1
    ORDER BY COALESCE(es.sent_at, es.created_at) DESC`,
    [id]
  );

  return result.rows as EmailSend[];
}
