import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db/index.js';
import { systemLogger } from '../services/systemLogger.js';
import type { JobApplication } from '../types/index.js';

const router: ReturnType<typeof Router> = Router();

const VALID_STATUSES = [
  'not_applied',
  'open',
  'referral_requested',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
  'closed',
  'ineligible',
];

import { syncJobEmailsForUser } from '../services/jobEmailSync/syncOrchestrator.js';
import { normalizeJobUrl } from '../services/jobUrlNormalizer.js';
import type { CandidatePreferences } from '../types/index.js';

// GET /api/applications
router.get('/', async (req: Request, res: Response) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    const userId = req.user!.id;
    const { status, search, limit = '100', offset = '0', job_id, min_match_score } = req.query as Record<string, string>;

    const conditions: string[] = isAdmin ? ['1=1'] : ['ja.user_id = $1'];
    const params: unknown[] = isAdmin ? [] : [userId];
    let i = isAdmin ? 1 : 2;

    if (status) {
      conditions.push(`ja.status = $${i++}`);
      params.push(status);
    }
    if (job_id) {
      conditions.push(`ja.job_id = $${i++}`);
      params.push(job_id);
    }
    if (min_match_score) {
      conditions.push(`ja.match_score >= $${i++}`);
      params.push(parseInt(min_match_score, 10));
    }
    if (search) {
      conditions.push(`(ja.company_name ILIKE $${i} OR ja.job_title ILIKE $${i})`);
      params.push(`%${search}%`);
      i++;
    }

    const where = conditions.join(' AND ');
    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT ja.*,
                COALESCE(j.company_id, c.id) AS company_id,
                CASE WHEN j.id IS NOT NULL THEN
                  json_build_object('id', j.id, 'title', j.title, 'job_url', j.job_url, 'company_id', COALESCE(j.company_id, c.id))
                ELSE NULL END AS job,
                COALESCE(em.email_count, 0)::int AS email_count,
                em.latest_referral_requested_at AS referral_requested_at
         FROM job_applications ja
         LEFT JOIN jobs j ON j.id = ja.job_id
         LEFT JOIN companies c ON (j.company_id = c.id OR (LOWER(c.name) = LOWER(ja.company_name) AND (c.created_by = ja.user_id OR c.created_by IS NULL)))
         LEFT JOIN (
           SELECT es.job_id,
                  COUNT(es.id) FILTER (WHERE es.status = 'sent') AS email_count,
                  MIN(COALESCE(es.sent_at, es.created_at)) FILTER (WHERE es.status = 'sent') AS latest_referral_requested_at
           FROM email_sends es
           WHERE es.job_id IS NOT NULL
           GROUP BY es.job_id
         ) em ON em.job_id = ja.job_id
         WHERE ${where}
         ORDER BY ja.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, parseInt(limit), parseInt(offset)],
      ),
      pool.query(`SELECT COUNT(*) FROM job_applications ja WHERE ${where}`, params),
    ]);

    res.json({ applications: rows.rows, total: parseInt(countRow.rows[0].count as string) });
  } catch (err) {
    systemLogger.error('Failed to fetch applications', err, {
      source: 'backend',
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: 500,
      userId: req.user?.id,
    });
    console.error('Error fetching applications:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/applications/sync-emails
router.post('/sync-emails', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await syncJobEmailsForUser(userId);
    res.json({ data: result });
  } catch (err) {
    systemLogger.error('Failed to sync job emails', err, {
      source: 'backend',
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: 500,
      userId: req.user?.id,
    });
    console.error('Error in /api/applications/sync-emails:', err);
    res.status(500).json({ error: 'Failed to sync job emails' });
  }
});

// GET /api/applications/preferences
router.get('/preferences', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await pool.query<{
      candidate_preferences: CandidatePreferences | null;
      target_roles?: string[] | string | null;
      skills?: string[] | string | null;
      years_of_experience?: string | null;
      expected_ctc?: string | null;
      location?: string | null;
    }>(
      `SELECT candidate_preferences, target_roles, skills, years_of_experience, expected_ctc, location
       FROM users WHERE id = $1`,
      [userId]
    );

    const row = result.rows[0];
    const userTargetRoles = Array.isArray(row?.target_roles)
      ? row.target_roles
      : typeof row?.target_roles === 'string'
      ? JSON.parse(row.target_roles || '[]')
      : [];
    const userSkills = Array.isArray(row?.skills)
      ? row.skills
      : typeof row?.skills === 'string'
      ? JSON.parse(row.skills || '[]')
      : [];
    const minExp = row?.years_of_experience ? parseInt(row.years_of_experience, 10) || undefined : undefined;

    const rawPrefs: Partial<CandidatePreferences> = row?.candidate_preferences || {};
    const prefs: CandidatePreferences = {
      target_roles: Array.isArray(rawPrefs.target_roles) && rawPrefs.target_roles.length > 0
        ? rawPrefs.target_roles
        : userTargetRoles,
      target_skills: Array.isArray(rawPrefs.target_skills) && rawPrefs.target_skills.length > 0
        ? rawPrefs.target_skills
        : userSkills,
      preferred_locations: Array.isArray(rawPrefs.preferred_locations) && rawPrefs.preferred_locations.length > 0
        ? rawPrefs.preferred_locations
        : (row?.location ? [row.location] : []),
      remote_only: rawPrefs.remote_only ?? false,
      min_experience_years: rawPrefs.min_experience_years ?? minExp,
      max_experience_years: rawPrefs.max_experience_years,
      min_salary: rawPrefs.min_salary || row?.expected_ctc || undefined,
      notes: rawPrefs.notes,
    };

    res.json({ data: prefs });
  } catch (err) {
    systemLogger.error('Failed to retrieve candidate preferences', err, {
      source: 'backend',
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: 500,
      userId: req.user?.id,
    });
    console.error('Error in GET /api/applications/preferences:', err);
    res.status(500).json({ error: 'Failed to retrieve candidate preferences' });
  }
});

// PUT /api/applications/preferences
router.put('/preferences', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const body = req.body as Partial<CandidatePreferences>;

    const currentRes = await pool.query<{ candidate_preferences: CandidatePreferences | null }>(
      `SELECT candidate_preferences FROM users WHERE id = $1`,
      [userId]
    );

    const existing = currentRes.rows[0]?.candidate_preferences || {
      target_roles: [],
      target_skills: [],
      preferred_locations: [],
      remote_only: false,
    };

    const updated: CandidatePreferences = {
      target_roles: Array.isArray(body.target_roles) ? body.target_roles : existing.target_roles,
      target_skills: Array.isArray(body.target_skills) ? body.target_skills : existing.target_skills,
      min_experience_years: typeof body.min_experience_years === 'number' ? body.min_experience_years : existing.min_experience_years,
      max_experience_years: typeof body.max_experience_years === 'number' ? body.max_experience_years : existing.max_experience_years,
      preferred_locations: Array.isArray(body.preferred_locations) ? body.preferred_locations : existing.preferred_locations,
      remote_only: typeof body.remote_only === 'boolean' ? body.remote_only : existing.remote_only,
      min_salary: typeof body.min_salary === 'string' ? body.min_salary : existing.min_salary,
      notes: typeof body.notes === 'string' ? body.notes : existing.notes,
    };

    await pool.query(
      `UPDATE users SET candidate_preferences = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(updated), userId]
    );

    if (Array.isArray(body.target_roles)) {
      await pool.query(
        `UPDATE users SET target_roles = $1 WHERE id = $2`,
        [JSON.stringify(body.target_roles), userId]
      );
    }

    res.json({ data: updated });
  } catch (err) {
    systemLogger.error('Failed to update candidate preferences', err, {
      source: 'backend',
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: 500,
      userId: req.user?.id,
      context: { body: req.body },
    });
    console.error('Error in PUT /api/applications/preferences:', err);
    res.status(500).json({ error: 'Failed to update candidate preferences' });
  }
});

// GET /api/applications/:id/emails
router.get('/:id/emails', async (req: Request, res: Response) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    const userId = req.user!.id;
    const { id } = req.params;

    const appRes = await pool.query<{ job_id: string | null }>(
      `SELECT job_id FROM job_applications WHERE id = $1 ${isAdmin ? '' : 'AND user_id = $2'}`,
      isAdmin ? [id] : [id, userId]
    );
    if (appRes.rows.length === 0) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    const jobId = appRes.rows[0]!.job_id;
    if (!jobId) {
      res.json({ data: [] });
      return;
    }

    const emails = await pool.query(
      `SELECT es.*,
              json_build_object(
                'first_name', p.first_name,
                'last_name', p.last_name,
                'email', p.email,
                'job_title', p.job_title
              ) AS prospect,
              json_build_object('name', c.name) AS company,
              json_build_object('name', t.name, 'version', t.version, 'deleted_at', t.deleted_at) AS template
       FROM email_sends es
       LEFT JOIN prospects p ON es.prospect_id = p.id
       LEFT JOIN companies c ON es.company_id = c.id
       LEFT JOIN email_templates t ON es.template_id = t.id
       WHERE es.job_id = $1 ${isAdmin ? '' : 'AND (es.created_by = $2 OR es.created_by IS NULL)'}
       ORDER BY es.created_at DESC`,
      isAdmin ? [jobId] : [jobId, userId]
    );

    res.json({ data: emails.rows });
  } catch (err) {
    systemLogger.error('Failed to fetch application emails', err, {
      source: 'backend',
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: 500,
      userId: req.user?.id,
      context: { id: req.params.id },
    });
    console.error('Error fetching application emails:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/applications
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { company_name, job_title, job_url, platform, status, notes, applied_at, job_id, jobId } = req.body as {
      company_name: string;
      job_title: string;
      job_url: string;
      platform?: string;
      status?: string;
      notes?: string;
      applied_at?: string;
      job_id?: string | null;
      jobId?: string | null;
    };

    if (!company_name || !job_title || !job_url) {
      res.status(400).json({ error: 'company_name, job_title, and job_url are required' });
      return;
    }

    if (status && !VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      return;
    }

    let normalizedStatus = status ? (status === 'open' ? 'not_applied' : status) : 'not_applied';

    // Auto-resolve or create company in companies table
    let resolvedCompanyId: string | null = null;
    const trimmedCompanyName = company_name.trim();
    const existingComp = await pool.query<{ id: string }>(
      `SELECT id FROM companies WHERE LOWER(name) = LOWER($1) AND (created_by = $2 OR created_by IS NULL) LIMIT 1`,
      [trimmedCompanyName, userId]
    );
    if (existingComp.rows.length > 0) {
      resolvedCompanyId = existingComp.rows[0]!.id;
    } else {
      try {
        const newComp = await pool.query<{ id: string }>(
          `INSERT INTO companies (name, created_by) VALUES ($1, $2) RETURNING id`,
          [trimmedCompanyName, userId]
        );
        resolvedCompanyId = newComp.rows[0]!.id;
      } catch {
        const recheck = await pool.query<{ id: string }>(
          `SELECT id FROM companies WHERE LOWER(name) = LOWER($1) AND (created_by = $2 OR created_by IS NULL) LIMIT 1`,
          [trimmedCompanyName, userId]
        );
        resolvedCompanyId = recheck.rows[0]?.id || null;
      }
    }

    const trimmedTitle = job_title.trim();
    const trimmedUrl = job_url.trim();
    const normalizedUrl = normalizeJobUrl(trimmedUrl);
    const trimmedPlatform = platform?.trim() || 'Generic';
    const trimmedNotes = notes?.trim() || null;
    const parsedAppliedAt = applied_at ? new Date(applied_at) : new Date();

    // Check for an existing application to merge with (URL match, base URL match, placeholder match, or exact company+title match)
    const existingAppRes = await pool.query<JobApplication>(
      `SELECT * FROM job_applications
       WHERE user_id = $1
         AND (
           (
             $2 NOT IN ('#', '')
             AND (
               job_url = $2
               OR job_url = $5
               OR split_part(job_url, '?', 1) = split_part($2, '?', 1)
             )
           )
           OR (
             (LOWER(company_name) = LOWER($3) OR LOWER($3) LIKE '%' || LOWER(company_name) || '%' OR LOWER(company_name) LIKE '%' || LOWER($3) || '%')
             AND (
               job_url IN ('#', '')
               OR platform = 'Email'
               OR job_title ILIKE 'Role at %'
               OR job_title IN ('Job Application', 'Unknown')
             )
           )
           OR (
             (LOWER(company_name) = LOWER($3) OR LOWER($3) LIKE '%' || LOWER(company_name) || '%')
             AND LOWER(job_title) = LOWER($4)
           )
         )
       ORDER BY
         CASE
           WHEN job_url = $2 THEN 0
           WHEN job_url = $5 THEN 1
           WHEN split_part(job_url, '?', 1) = split_part($2, '?', 1) AND $2 NOT IN ('#', '') THEN 2
           ELSE 3
         END,
         created_at DESC
       LIMIT 1`,
      [userId, normalizedUrl, trimmedCompanyName, trimmedTitle, trimmedUrl]
    );

    let targetJobId = job_id || jobId || existingAppRes.rows[0]?.job_id || null;

    if (!targetJobId) {
      if (normalizedUrl && normalizedUrl !== '#') {
        const existingJob = await pool.query<{ id: string }>(
          `SELECT id FROM jobs WHERE created_by = $1 AND (job_url = $2 OR job_url = $3) ORDER BY created_at DESC LIMIT 1`,
          [userId, normalizedUrl, trimmedUrl]
        );
        if (existingJob.rows.length > 0) {
          targetJobId = existingJob.rows[0]!.id;
        }
      }

      if (!targetJobId) {
        const jobRes = await pool.query<{ id: string }>(
          `INSERT INTO jobs (title, job_url, company_id, status, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [trimmedTitle, normalizedUrl, resolvedCompanyId, normalizedStatus, trimmedNotes, userId]
        );
        targetJobId = jobRes.rows[0]!.id;
      }
    } else if (resolvedCompanyId) {
      try {
        await pool.query(
          `UPDATE jobs SET company_id = COALESCE(company_id, $1), updated_at = NOW() WHERE id = $2 AND created_by = $3`,
          [resolvedCompanyId, targetJobId, userId]
        );
      } catch {
        // Ignore non-critical job company update error
      }
    }

    let resultRow: any;

    if (existingAppRes.rowCount && existingAppRes.rowCount > 0) {
      const existingApp = existingAppRes.rows[0]!;

      // Determine best job title: prefer specific title over placeholders
      const isPlaceholderTitle = (t: string) =>
        !t || t === 'Job Application' || t === 'Unknown' || t.toLowerCase().startsWith('role at ');
      const bestTitle = !isPlaceholderTitle(trimmedTitle) ? trimmedTitle : existingApp.job_title;

      // Determine best job URL: prefer normalized real URL over '#' or empty
      const bestUrl = normalizedUrl && normalizedUrl !== '#' ? normalizedUrl : existingApp.job_url;

      // Determine best platform: prefer specific platform over 'Email' or 'Generic'
      const bestPlatform =
        trimmedPlatform !== 'Generic' && trimmedPlatform !== 'Email'
          ? trimmedPlatform
          : existingApp.platform && existingApp.platform !== 'Email'
          ? existingApp.platform
          : trimmedPlatform;

      // Determine best status: keep progressed status, otherwise update
      const terminalOrActiveStatuses = ['interview', 'offer', 'rejected', 'ineligible'];
      const bestStatus =
        terminalOrActiveStatuses.includes(existingApp.status) && normalizedStatus === 'not_applied'
          ? existingApp.status
          : normalizedStatus !== 'not_applied'
          ? normalizedStatus
          : existingApp.status;

      // Merge notes cleanly without duplicating existing content
      let mergedNotes = existingApp.notes;
      if (trimmedNotes) {
        if (!mergedNotes) {
          mergedNotes = trimmedNotes;
        } else if (!mergedNotes.includes(trimmedNotes)) {
          mergedNotes = `${mergedNotes}\n${trimmedNotes}`;
        }
      }

      const updateRes = await pool.query(
        `UPDATE job_applications
         SET company_name = $1,
             job_title = $2,
             job_url = $3,
             platform = $4,
             status = $5,
             notes = $6,
             company_id = COALESCE(company_id, $7),
             job_id = COALESCE(job_id, $8),
             applied_at = COALESCE(applied_at, $9),
             updated_at = NOW()
         WHERE id = $10
         RETURNING *`,
        [
          trimmedCompanyName,
          bestTitle,
          bestUrl,
          bestPlatform,
          bestStatus,
          mergedNotes,
          resolvedCompanyId,
          targetJobId,
          parsedAppliedAt,
          existingApp.id,
        ]
      );
      resultRow = updateRes.rows[0];
    } else {
      const insertRes = await pool.query(
        `INSERT INTO job_applications (user_id, company_name, job_title, job_url, platform, status, notes, applied_at, job_id, company_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id, job_url) WHERE job_url NOT IN ('#', '')
         DO UPDATE SET
           company_name = EXCLUDED.company_name,
           job_title    = CASE
                            WHEN EXCLUDED.job_title NOT IN ('Job Application', 'Unknown') AND EXCLUDED.job_title NOT ILIKE 'Role at %' THEN EXCLUDED.job_title
                            ELSE job_applications.job_title
                          END,
           platform     = CASE
                            WHEN EXCLUDED.platform NOT IN ('Generic', 'Email') THEN EXCLUDED.platform
                            ELSE job_applications.platform
                          END,
           notes        = CASE
                            WHEN EXCLUDED.notes IS NOT NULL AND job_applications.notes IS NOT NULL AND job_applications.notes NOT LIKE '%' || EXCLUDED.notes || '%' THEN job_applications.notes || E'\n' || EXCLUDED.notes
                            ELSE COALESCE(EXCLUDED.notes, job_applications.notes)
                          END,
           company_id   = COALESCE(job_applications.company_id, EXCLUDED.company_id),
           job_id       = COALESCE(job_applications.job_id, EXCLUDED.job_id),
           applied_at   = COALESCE(job_applications.applied_at, EXCLUDED.applied_at),
           updated_at   = NOW()
         RETURNING *`,
        [
          userId,
          trimmedCompanyName,
          trimmedTitle,
          normalizedUrl,
          trimmedPlatform,
          normalizedStatus,
          trimmedNotes,
          parsedAppliedAt,
          targetJobId,
          resolvedCompanyId,
        ],
      );
      resultRow = insertRes.rows[0];
    }

    if (targetJobId) {
      try {
        await pool.query(
          `UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2 AND created_by = $3`,
          [normalizedStatus, targetJobId, userId]
        );
      } catch {
        // Ignore non-critical job status update error
      }
    }

    res.status(201).json({ ...resultRow, company_id: resolvedCompanyId });
  } catch (err) {
    systemLogger.error('Failed to create/track application', err, {
      source: 'backend',
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: 500,
      userId: req.user?.id,
      context: {
        body: req.body,
      },
    });
    console.error('Error creating/tracking application:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
  }
});

// PATCH /api/applications/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    const userId = req.user!.id;
    const { id } = req.params;
    const { company_name, job_title, job_url, platform, status, notes, applied_at, job_id, jobId } = req.body as {
      company_name?: string;
      job_title?: string;
      job_url?: string;
      platform?: string;
      status?: string;
      notes?: string | null;
      applied_at?: string;
      job_id?: string | null;
      jobId?: string | null;
    };

    if (status && !VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      return;
    }

    const updates: string[] = ['updated_at = NOW()'];
    const params: unknown[] = isAdmin ? [id] : [id, userId];
    let i = params.length + 1;
    let resolvedCompanyId: string | null = null;

    if (company_name !== undefined) {
      if (!company_name.trim()) {
        res.status(400).json({ error: 'company_name cannot be empty' });
        return;
      }
      const trimmedCompanyName = company_name.trim();
      const existingComp = await pool.query<{ id: string }>(
        `SELECT id FROM companies WHERE LOWER(name) = LOWER($1) AND (created_by = $2 OR created_by IS NULL) LIMIT 1`,
        [trimmedCompanyName, userId]
      );
      if (existingComp.rows.length > 0) {
        resolvedCompanyId = existingComp.rows[0]!.id;
      } else {
        const newComp = await pool.query<{ id: string }>(
          `INSERT INTO companies (name, created_by) VALUES ($1, $2) RETURNING id`,
          [trimmedCompanyName, userId]
        );
        resolvedCompanyId = newComp.rows[0]!.id;
      }
      updates.push(`company_name = $${i++}`);
      params.push(trimmedCompanyName);
    }

    if (job_title !== undefined) {
      if (!job_title.trim()) {
        res.status(400).json({ error: 'job_title cannot be empty' });
        return;
      }
      updates.push(`job_title = $${i++}`);
      params.push(job_title.trim());
    }

    if (job_url !== undefined) {
      if (!job_url.trim()) {
        res.status(400).json({ error: 'job_url cannot be empty' });
        return;
      }
      updates.push(`job_url = $${i++}`);
      params.push(job_url.trim());
    }

    if (platform !== undefined) {
      updates.push(`platform = $${i++}`);
      params.push(platform.trim() || 'Generic');
    }

    if (status !== undefined) {
      const normalizedStatus = status === 'open' ? 'not_applied' : status;
      updates.push(`status = $${i++}`);
      params.push(normalizedStatus);
    }

    if (notes !== undefined) {
      updates.push(`notes = $${i++}`);
      params.push(notes ? notes.trim() : null);
    }

    if (applied_at !== undefined) {
      updates.push(`applied_at = $${i++}`);
      params.push(applied_at ? new Date(applied_at) : new Date());
    }

    if (job_id !== undefined || jobId !== undefined) {
      updates.push(`job_id = $${i++}`);
      params.push(job_id ?? jobId ?? null);
    }

    const result = await pool.query(
      `UPDATE job_applications
       SET ${updates.join(', ')}
       WHERE id = $1 ${isAdmin ? '' : 'AND user_id = $2'}
       RETURNING *`,
      params,
    );

    if (!result.rowCount) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const updatedApp = result.rows[0];
    const targetJob = updatedApp.job_id;
    if (targetJob) {
      const jobUpdates: string[] = ['updated_at = NOW()'];
      const jobParams: unknown[] = isAdmin ? [targetJob] : [targetJob, userId];
      let ji = jobParams.length + 1;
      if (status !== undefined) {
        jobUpdates.push(`status = $${ji++}`);
        jobParams.push(status === 'open' ? 'not_applied' : status);
      }
      if (resolvedCompanyId) {
        jobUpdates.push(`company_id = $${ji++}`);
        jobParams.push(resolvedCompanyId);
      }
      if (job_title !== undefined) {
        jobUpdates.push(`title = $${ji++}`);
        jobParams.push(job_title.trim());
      }
      if (job_url !== undefined) {
        jobUpdates.push(`job_url = $${ji++}`);
        jobParams.push(job_url.trim());
      }
      if (jobUpdates.length > 1) {
        pool.query(
          `UPDATE jobs SET ${jobUpdates.join(', ')} WHERE id = $1 ${isAdmin ? '' : 'AND created_by = $2'}`,
          jobParams
        ).catch(() => undefined);
      }
    }

    res.json({ ...updatedApp, company_id: resolvedCompanyId });
  } catch (err) {
    systemLogger.error('Failed to update application', err, {
      source: 'backend',
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: 500,
      userId: req.user?.id,
      context: { body: req.body, id: req.params.id },
    });
    console.error('Error updating application:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/applications/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM job_applications WHERE id = $1 ${isAdmin ? '' : 'AND user_id = $2'}`,
      isAdmin ? [id] : [id, userId],
    );

    if (!result.rowCount) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    systemLogger.error('Failed to delete application', err, {
      source: 'backend',
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: 500,
      userId: req.user?.id,
      context: { id: req.params.id },
    });
    console.error('Error deleting application:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
