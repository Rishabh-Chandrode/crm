import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/index.js';
import { CONFIG } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import type { User } from '../types/index.js';

const router: ReturnType<typeof Router> = Router();

router.post('/login', async (req, res) => {
  const body = req.body as { username?: unknown; password?: unknown };
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const result = await pool.query<User & { password_hash: string }>(
    'SELECT * FROM users WHERE username = $1 AND is_active = TRUE',
    [username]
  );
  const user = result.rows[0];

  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    CONFIG.jwtSecret,
    { expiresIn: CONFIG.jwtExpiresIn } as jwt.SignOptions
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role },
  });
});

router.post('/signup', async (req, res) => {
  const body = req.body as { username?: unknown; email?: unknown; password?: unknown };
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const email    = typeof body.email === 'string' ? body.email.trim() || null : null;
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }
  if (username.length < 3) {
    res.status(400).json({ error: 'Username must be at least 3 characters' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.rowCount && existing.rowCount > 0) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const result = await pool.query<User>(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $2, $3, 'user')
     RETURNING id, username, email, role`,
    [username, email, hash]
  );
  const user = result.rows[0]!;

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    CONFIG.jwtSecret,
    { expiresIn: CONFIG.jwtExpiresIn } as jwt.SignOptions
  );

  res.status(201).json({
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role },
  });
});

router.get('/me', authMiddleware, async (req, res) => {
  const result = await pool.query<User>(
    `SELECT id, username, email, role, is_active,
            first_name, last_name, current_company, job_title, phone, phone_country_code, website, bio,
            linkedin_url, github_url, city, state, country, address_line1, postal_code, work_authorization, location,
            hometown, years_of_experience, notice_period, current_ctc, expected_ctc,
            education, college_name, graduation_year, skills, projects, work_experiences,
            gender, veteran_status,
            gmail_user, from_name, reply_to_email,
            (gmail_refresh_token IS NOT NULL) AS has_gmail_configured,
            (gmail_app_password IS NOT NULL AND gmail_user IS NOT NULL) AS has_gmail_app_password,
            created_at
     FROM users WHERE id = $1`,
    [req.user!.id]
  );
  const user = result.rows[0];
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }
  res.json({ user });
});

router.patch('/profile', authMiddleware, async (req, res) => {
  const body = req.body as {
    first_name?: unknown; last_name?: unknown; email?: unknown;
    current_company?: unknown; job_title?: unknown; phone?: unknown; phone_country_code?: unknown;
    website?: unknown; bio?: unknown;
    linkedin_url?: unknown; github_url?: unknown;
    city?: unknown; state?: unknown; country?: unknown;
    address_line1?: unknown; postal_code?: unknown;
    work_authorization?: unknown; location?: unknown;
    hometown?: unknown; years_of_experience?: unknown; notice_period?: unknown;
    current_ctc?: unknown; expected_ctc?: unknown;
    education?: unknown; college_name?: unknown;
    graduation_year?: unknown; skills?: unknown; projects?: unknown; work_experiences?: unknown;
    gender?: unknown; veteran_status?: unknown;
    from_name?: unknown; reply_to_email?: unknown;
  };

  // ── validation ────────────────────────────────────────────────────────────
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : null);
  const fieldErrors: Record<string, string> = {};

  const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_RE    = /^[+\d\s\-().]{1,25}$/;
  const PHONE_CC_RE = /^\+\d{1,4}$/;
  const URL_RE      = /^https?:\/\/.+/;
  const YEAR_RE     = /^\d{4}$/;
  const THIS_YEAR   = new Date().getFullYear();

  const GENDER_VALUES   = new Set(['', 'Male', 'Female', 'Non-binary', 'Other']);
  const VETERAN_VALUES  = new Set([
    '',
    'I am not a protected veteran',
    'I identify as one or more of the classifications of a protected veteran',
    "I don't wish to answer",
  ]);

  if (body.email !== undefined) {
    const v = s(body.email);
    if (v && !EMAIL_RE.test(v)) fieldErrors['email'] = 'Invalid email address';
  }
  if (body.phone !== undefined) {
    const v = s(body.phone);
    if (v && !PHONE_RE.test(v)) fieldErrors['phone'] = 'Phone may only contain digits, spaces, +, -, (, ) and .';
  }
  if (body.phone_country_code !== undefined) {
    const v = s(body.phone_country_code);
    if (v && !PHONE_CC_RE.test(v)) fieldErrors['phone_country_code'] = 'Country code must be + followed by 1–4 digits (e.g. +1, +91)';
  }
  if (body.website !== undefined) {
    const v = s(body.website);
    if (v && !URL_RE.test(v)) fieldErrors['website'] = 'Must be a valid http/https URL';
  }
  if (body.linkedin_url !== undefined) {
    const v = s(body.linkedin_url);
    if (v && !URL_RE.test(v)) fieldErrors['linkedin_url'] = 'Must be a valid http/https URL';
  }
  if (body.github_url !== undefined) {
    const v = s(body.github_url);
    if (v && !URL_RE.test(v)) fieldErrors['github_url'] = 'Must be a valid http/https URL';
  }
  if (body.from_name !== undefined) {
    // no format restriction — just length (handled below)
  }
  if (body.reply_to_email !== undefined) {
    const v = s(body.reply_to_email);
    if (v && !EMAIL_RE.test(v)) fieldErrors['reply_to_email'] = 'Invalid email address';
  }
  if (body.graduation_year !== undefined) {
    const v = s(body.graduation_year);
    if (v) {
      if (!YEAR_RE.test(v)) {
        fieldErrors['graduation_year'] = 'Must be a 4-digit year';
      } else {
        const y = parseInt(v, 10);
        if (y < 1950 || y > THIS_YEAR + 10) fieldErrors['graduation_year'] = `Must be between 1950 and ${THIS_YEAR + 10}`;
      }
    }
  }
  if (body.gender !== undefined) {
    const v = s(body.gender) ?? '';
    if (!GENDER_VALUES.has(v)) fieldErrors['gender'] = 'Invalid value';
  }
  if (body.veteran_status !== undefined) {
    const v = s(body.veteran_status) ?? '';
    if (!VETERAN_VALUES.has(v)) fieldErrors['veteran_status'] = 'Invalid value';
  }

  // Length limits
  const LENGTH_LIMITS: [string, number][] = [
    ['first_name', 100], ['last_name', 100], ['from_name', 255],
    ['current_company', 255], ['job_title', 255],
    ['city', 255], ['state', 255], ['country', 255], ['hometown', 255],
    ['address_line1', 500], ['postal_code', 20],
    ['location', 500], ['work_authorization', 255], ['notice_period', 100],
    ['education', 255], ['college_name', 255],
    ['current_ctc', 100], ['expected_ctc', 100], ['years_of_experience', 50],
    ['bio', 2000],
    ['website', 500], ['linkedin_url', 500], ['github_url', 500],
  ];
  for (const [field, max] of LENGTH_LIMITS) {
    if (field in fieldErrors) continue; // already flagged
    const v = s((body as Record<string, unknown>)[field]);
    if (v && v.length > max) fieldErrors[field] = `Must be ${max} characters or fewer`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    res.status(400).json({ error: 'Validation failed', fields: fieldErrors });
    return;
  }
  // ── end validation ────────────────────────────────────────────────────────

  const updates: string[] = [];
  const values: unknown[] = [];
  const add = (col: string, val: unknown) => {
    updates.push(`${col} = $${updates.length + 1}`);
    values.push(val);
  };

  if (body.first_name !== undefined)     add('first_name',     typeof body.first_name === 'string' ? body.first_name.trim() || null : null);
  if (body.last_name !== undefined)      add('last_name',      typeof body.last_name === 'string' ? body.last_name.trim() || null : null);
  if (body.email !== undefined)          add('email',          typeof body.email === 'string' ? body.email.trim() || null : null);
  if (body.current_company !== undefined) add('current_company', typeof body.current_company === 'string' ? body.current_company.trim() || null : null);
  if (body.job_title !== undefined)      add('job_title',      typeof body.job_title === 'string' ? body.job_title.trim() || null : null);
  if (body.phone !== undefined)          add('phone',          typeof body.phone === 'string' ? body.phone.trim() || null : null);
  if (body.phone_country_code !== undefined) add('phone_country_code', typeof body.phone_country_code === 'string' ? body.phone_country_code.trim() || null : null);
  if (body.website !== undefined)        add('website',        typeof body.website === 'string' ? body.website.trim() || null : null);
  if (body.bio !== undefined)            add('bio',            typeof body.bio === 'string' ? body.bio.trim() || null : null);
  if (body.linkedin_url !== undefined)     add('linkedin_url',      typeof body.linkedin_url === 'string' ? body.linkedin_url.trim() || null : null);
  if (body.github_url !== undefined)       add('github_url',        typeof body.github_url === 'string' ? body.github_url.trim() || null : null);
  if (body.city !== undefined)             add('city',              typeof body.city === 'string' ? body.city.trim() || null : null);
  if (body.state !== undefined)            add('state',             typeof body.state === 'string' ? body.state.trim() || null : null);
  if (body.country !== undefined)          add('country',           typeof body.country === 'string' ? body.country.trim() || null : null);
  if (body.address_line1 !== undefined)    add('address_line1',     typeof body.address_line1 === 'string' ? body.address_line1.trim() || null : null);
  if (body.postal_code !== undefined)      add('postal_code',       typeof body.postal_code === 'string' ? body.postal_code.trim() || null : null);
  if (body.work_authorization !== undefined) add('work_authorization', typeof body.work_authorization === 'string' ? body.work_authorization.trim() || null : null);
  if (body.location !== undefined)           add('location',           typeof body.location === 'string' ? body.location.trim() || null : null);
  if (body.hometown !== undefined)           add('hometown',           typeof body.hometown === 'string' ? body.hometown.trim() || null : null);
  if (body.years_of_experience !== undefined) add('years_of_experience', typeof body.years_of_experience === 'string' ? body.years_of_experience.trim() || null : null);
  if (body.notice_period !== undefined)      add('notice_period',      typeof body.notice_period === 'string' ? body.notice_period.trim() || null : null);
  if (body.current_ctc !== undefined)        add('current_ctc',        typeof body.current_ctc === 'string' ? body.current_ctc.trim() || null : null);
  if (body.expected_ctc !== undefined)       add('expected_ctc',       typeof body.expected_ctc === 'string' ? body.expected_ctc.trim() || null : null);
  if (body.education !== undefined)          add('education',          typeof body.education === 'string' ? body.education.trim() || null : null);
  if (body.college_name !== undefined)       add('college_name',       typeof body.college_name === 'string' ? body.college_name.trim() || null : null);
  if (body.graduation_year !== undefined)    add('graduation_year',    typeof body.graduation_year === 'string' ? body.graduation_year.trim() || null : null);
  if (body.gender !== undefined)          add('gender',          typeof body.gender === 'string' ? body.gender.trim() || null : null);
  if (body.veteran_status !== undefined)  add('veteran_status',  typeof body.veteran_status === 'string' ? body.veteran_status.trim() || null : null);
  if (body.skills !== undefined && Array.isArray(body.skills))                   add('skills',            JSON.stringify(body.skills));
  if (body.projects !== undefined && Array.isArray(body.projects))               add('projects',          JSON.stringify(body.projects));
  if (body.work_experiences !== undefined && Array.isArray(body.work_experiences)) add('work_experiences', JSON.stringify(body.work_experiences));
  if (body.from_name !== undefined)        add('from_name',         typeof body.from_name === 'string' ? body.from_name.trim() || null : null);
  if (body.reply_to_email !== undefined)   add('reply_to_email',    typeof body.reply_to_email === 'string' ? body.reply_to_email.trim() || null : null);

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  updates.push('updated_at = NOW()');
  values.push(req.user!.id);

  const result = await pool.query<User>(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${values.length}
     RETURNING id, username, email, role, is_active,
               first_name, last_name, current_company, job_title, phone, phone_country_code, website, bio,
               linkedin_url, github_url, city, state, country, address_line1, postal_code, work_authorization, location,
               hometown, years_of_experience, notice_period, current_ctc, expected_ctc,
               education, college_name, graduation_year, skills, projects, work_experiences,
               gender, veteran_status,
               gmail_user, from_name, reply_to_email,
               (gmail_refresh_token IS NOT NULL) AS has_gmail_configured,
               (gmail_app_password IS NOT NULL AND gmail_user IS NOT NULL) AS has_gmail_app_password`,
    values
  );
  res.json({ user: result.rows[0] });
});

export default router;
