import { pool } from './index.js';
import bcrypt from 'bcryptjs';
import { CONFIG } from '../config.js';
import { inferProspectGender } from '../services/genderInference.js';

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      VARCHAR(255) NOT NULL,
  email         VARCHAR(255),
  password_hash TEXT         NOT NULL,
  role          VARCHAR(50)  NOT NULL DEFAULT 'user',
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT users_username_unique UNIQUE (username),
  CONSTRAINT users_email_unique    UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS companies (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  website     VARCHAR(500),
  industry    VARCHAR(255),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prospects (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID         REFERENCES companies(id) ON DELETE SET NULL,
  first_name    VARCHAR(255) NOT NULL,
  last_name     VARCHAR(255),
  email         VARCHAR(255) NOT NULL,
  job_title     VARCHAR(255),
  role_category VARCHAR(50),
  linkedin_url  VARCHAR(500),
  phone         VARCHAR(50),
  notes         TEXT,
  gender        VARCHAR(50),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_templates (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  subject         VARCHAR(500) NOT NULL,
  body            TEXT         NOT NULL,
  job_description TEXT,
  variables       JSONB        NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_sends (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id   UUID         REFERENCES email_templates(id) ON DELETE SET NULL,
  prospect_id   UUID         REFERENCES prospects(id)      ON DELETE SET NULL,
  company_id    UUID         REFERENCES companies(id)       ON DELETE SET NULL,
  subject       VARCHAR(500),
  body          TEXT,
  status        VARCHAR(50)  NOT NULL DEFAULT 'pending',
  resend_id     VARCHAR(255),
  sent_at       TIMESTAMPTZ,
  error_message TEXT,
  opened_at     TIMESTAMPTZ,
  open_count    INT          NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  filename    VARCHAR(255) NOT NULL,
  path        VARCHAR(500) NOT NULL,
  size        INT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_schedules (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id     UUID         REFERENCES email_templates(id) ON DELETE SET NULL,
  company_id      UUID         REFERENCES companies(id)       ON DELETE SET NULL,
  prospect_ids    UUID[]       NOT NULL DEFAULT '{}',
  custom_values   JSONB        NOT NULL DEFAULT '{}',
  scheduled_for   TIMESTAMPTZ  NOT NULL,
  status          VARCHAR(50)  NOT NULL DEFAULT 'pending',
  total_prospects INT          NOT NULL DEFAULT 0,
  sent_count      INT          NOT NULL DEFAULT 0,
  failed_count    INT          NOT NULL DEFAULT 0,
  document_ids    UUID[]       NOT NULL DEFAULT '{}',
  error_message   TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS settings (
  key   VARCHAR(100) PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_prospects_company_id       ON prospects(company_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_template_id    ON email_sends(template_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_prospect_id    ON email_sends(prospect_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_company_id     ON email_sends(company_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_status         ON email_sends(status);
CREATE INDEX IF NOT EXISTS idx_email_schedules_status     ON email_schedules(status);
CREATE INDEX IF NOT EXISTS idx_email_schedules_scheduled  ON email_schedules(scheduled_for);
`;

const MIGRATE_PROSPECT_NAME = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prospects' AND column_name = 'name'
  ) THEN
    ALTER TABLE prospects
      ADD COLUMN IF NOT EXISTS first_name VARCHAR(255) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS last_name  VARCHAR(255);

    UPDATE prospects SET
      first_name = CASE
        WHEN POSITION(' ' IN name) > 0 THEN SPLIT_PART(name, ' ', 1)
        ELSE name
      END,
      last_name = CASE
        WHEN POSITION(' ' IN name) > 0
          THEN NULLIF(TRIM(SUBSTRING(name FROM POSITION(' ' IN name) + 1)), '')
        ELSE NULL
      END;

    ALTER TABLE prospects ALTER COLUMN first_name DROP DEFAULT;
    ALTER TABLE prospects DROP COLUMN name;
  END IF;
END $$;
`;

/* Renames the resumes table to documents and migrates email_schedules
   from a single resume_id FK to a document_ids UUID[] array. */
const MIGRATE_TO_DOCUMENTS = `
DO $$
BEGIN
  -- Rename resumes → documents for existing DBs
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'resumes' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents' AND table_schema = 'public')
  THEN
    ALTER TABLE resumes RENAME TO documents;
  END IF;

  -- Add document_ids column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_schedules' AND column_name = 'document_ids'
  ) THEN
    ALTER TABLE email_schedules ADD COLUMN document_ids UUID[] NOT NULL DEFAULT '{}';
    -- Migrate old single resume_id into the new array
    UPDATE email_schedules SET document_ids = ARRAY[resume_id] WHERE resume_id IS NOT NULL;
  END IF;

  -- Drop old columns if present
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_schedules' AND column_name = 'resume_id'
  ) THEN
    ALTER TABLE email_schedules DROP COLUMN resume_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_schedules' AND column_name = 'attach_resume'
  ) THEN
    ALTER TABLE email_schedules DROP COLUMN attach_resume;
  END IF;
END $$;

DELETE FROM settings WHERE key IN ('resume_filename', 'resume_path', 'resume_uploaded_at');
`;

const MIGRATE_ROLE_CATEGORY = `
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS role_category VARCHAR(50);
`;

/* Re-runs every migration: classifies all rows so the fix applies to
   existing data that was incorrectly set by earlier broken regex strings. */
const MIGRATE_ROLE_CATEGORY_BACKFILL = `
UPDATE prospects
SET role_category = CASE
  WHEN job_title ~* '\\m(hr|human\\s+resources?|recruit(er|ing|ment)?|talent(\\s+(acquisition|partner|lead|manager|sourcer|ops))?|people\\s+(ops|operations|partner)|staffing|headhunter)\\M'
    THEN 'hr'
  WHEN job_title ~* '\\m(sde|swe|software|developer|programmer|engineer|architect|backend|devops|sre|platform|infrastructure|mobile|data\\s+(scientist|engineer)|machine\\s+learning|tech\\s+lead|technical\\s+lead|engineering\\s+manager|cto)\\M'
    THEN 'engineer'
  WHEN job_title IS NOT NULL AND TRIM(job_title) <> ''
    THEN 'other'
  ELSE NULL
END
WHERE role_category IS NULL OR role_category = 'other';
`;

const MIGRATE_VARIABLE_PRESETS = `
CREATE TABLE IF NOT EXISTS variable_presets (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  key           VARCHAR(255) NOT NULL,
  label         VARCHAR(255) NOT NULL,
  source        VARCHAR(50)  NOT NULL,
  field         VARCHAR(255),
  default_value TEXT         NOT NULL DEFAULT '',
  male_value    VARCHAR(255),
  female_value  VARCHAR(255),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT variable_presets_key_unique UNIQUE (key)
);
`;

export async function migrate(): Promise<void> {
  await pool.query(SCHEMA);
  await pool.query(MIGRATE_PROSPECT_NAME);
  await pool.query(MIGRATE_TO_DOCUMENTS);
  await pool.query(MIGRATE_ROLE_CATEGORY);
  await pool.query(MIGRATE_ROLE_CATEGORY_BACKFILL);
  await pool.query(`
    ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS opened_at  TIMESTAMPTZ;
    ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS open_count INT NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    DROP INDEX IF EXISTS idx_prospects_email;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_email ON prospects (LOWER(email), created_by);
    DROP INDEX IF EXISTS idx_companies_name;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_name  ON companies  (LOWER(name), created_by);
  `);
  await pool.query(MIGRATE_VARIABLE_PRESETS);
  await pool.query(`
    ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS document_ids UUID[] NOT NULL DEFAULT '{}';
  `);
  await pool.query(`
    ALTER TABLE email_schedules ADD COLUMN IF NOT EXISTS subject VARCHAR(500);
    ALTER TABLE email_schedules ADD COLUMN IF NOT EXISTS body TEXT;
  `);
  await seedAdminUser();
  await pool.query(`
    ALTER TABLE companies         ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE prospects         ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE email_templates   ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE email_sends       ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE email_schedules   ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE documents         ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE variable_presets  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name    VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name     VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS current_company VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title     VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone         VARCHAR(50);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS website       VARCHAR(500);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bio           TEXT;
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gmail_user          VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gmail_app_password  TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS from_name           VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reply_to_email      VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT;
  `);
  /* Assign pre-existing rows (created before auth existed) to the first admin */
  await pool.query(`
    DO $$
    DECLARE admin_id UUID;
    BEGIN
      SELECT id INTO admin_id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
      IF admin_id IS NOT NULL THEN
        UPDATE companies        SET created_by = admin_id WHERE created_by IS NULL;
        UPDATE prospects        SET created_by = admin_id WHERE created_by IS NULL;
        UPDATE email_templates  SET created_by = admin_id WHERE created_by IS NULL;
        UPDATE email_sends      SET created_by = admin_id WHERE created_by IS NULL;
        UPDATE email_schedules  SET created_by = admin_id WHERE created_by IS NULL;
        UPDATE documents        SET created_by = admin_id WHERE created_by IS NULL;
        UPDATE variable_presets SET created_by = admin_id WHERE created_by IS NULL;
      END IF;
    END $$;
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id) WHERE google_id IS NOT NULL;
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin_url        VARCHAR(500);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS github_url          VARCHAR(500);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS city                VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS state               VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS country             VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS work_authorization  VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS location            VARCHAR(500);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS hometown            VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS years_of_experience VARCHAR(50);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS notice_period       VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS current_ctc         VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS expected_ctc        VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS education           VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS college_name        VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS graduation_year     VARCHAR(10);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS skills              JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS target_roles        JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS projects            JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS work_experiences    JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gender              VARCHAR(50);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS veteran_status      VARCHAR(100);
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_country_code VARCHAR(10);
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(500);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS postal_code   VARCHAR(20);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_applications (
      id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id   UUID         REFERENCES companies(id) ON DELETE SET NULL,
      company_name TEXT         NOT NULL,
      job_title    TEXT         NOT NULL,
      job_url      TEXT         NOT NULL,
      platform     TEXT         NOT NULL DEFAULT 'Generic',
      status       TEXT         NOT NULL DEFAULT 'applied',
      notes        TEXT,
      applied_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_job_applications_user_id ON job_applications(user_id);
    CREATE INDEX IF NOT EXISTS idx_job_applications_applied_at ON job_applications(applied_at DESC);
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_document_sync BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_document_synced_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gmail_access_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gmail_access_token_expires_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gmail_token_error TEXT;
  `);
  await pool.query(`
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS drive_url        TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS drive_file_id    TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS drive_synced_at  TIMESTAMPTZ;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS drive_sync_error TEXT;
  `);
  await pool.query(`
    ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES email_schedules(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_email_sends_schedule_id ON email_sends(schedule_id);
  `);
  await pool.query(`
    ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS job_url TEXT;
  `);
  await pool.query(`
    ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
      company_id  UUID         REFERENCES companies(id) ON DELETE SET NULL,
      title       VARCHAR(255) NOT NULL,
      job_url     TEXT         NOT NULL,
      status      VARCHAR(50)  NOT NULL DEFAULT 'open',
      notes       TEXT,
      created_by  UUID         REFERENCES users(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_by ON jobs(created_by);
  `);
  await pool.query(`
    ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_job_applications_job_id ON job_applications(job_id);
    ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_job_applications_company_id ON job_applications(company_id);
    UPDATE job_applications ja
    SET company_id = c.id
    FROM companies c
    WHERE ja.company_id IS NULL
      AND LOWER(c.name) = LOWER(ja.company_name)
      AND (c.created_by = ja.user_id OR c.created_by IS NULL);
  `);
  await pool.query(`
    ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_email_sends_job_id ON email_sends(job_id);
  `);
  await pool.query(`
    ALTER TABLE email_schedules ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_email_schedules_job_id ON email_schedules(job_id);
  `);
  await pool.query(`
    ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS family_id UUID;
    ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    UPDATE email_templates SET family_id = id WHERE family_id IS NULL;
    ALTER TABLE email_templates ALTER COLUMN family_id SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_email_templates_family_version ON email_templates(family_id, version);
  `);
  await pool.query(`
    ALTER TABLE prospects ADD COLUMN IF NOT EXISTS gender VARCHAR(50);
    ALTER TABLE variable_presets ADD COLUMN IF NOT EXISTS male_value VARCHAR(255);
    ALTER TABLE variable_presets ADD COLUMN IF NOT EXISTS female_value VARCHAR(255);
  `);
  await pool.query(`
    INSERT INTO variable_presets (key, label, source, field, default_value, male_value, female_value)
    VALUES
      ('salutation', 'Salutation (Sir/Ma''am)', 'prospect', 'salutation', 'Sir/Ma''am', 'Sir', 'Ma''am'),
      ('honorific', 'Honorific (Mr./Ms.)', 'prospect', 'honorific', '', 'Mr.', 'Ms.'),
      ('gender', 'Gender', 'prospect', 'gender', '', NULL, NULL)
    ON CONFLICT (key) DO UPDATE SET
      male_value = COALESCE(variable_presets.male_value, EXCLUDED.male_value),
      female_value = COALESCE(variable_presets.female_value, EXCLUDED.female_value);
  `);

  // Backfill existing prospects where gender IS NULL
  const unassigned = await pool.query<{ id: string; first_name: string }>(
    'SELECT id, first_name FROM prospects WHERE gender IS NULL'
  );
  if (unassigned.rows.length > 0) {
    for (const row of unassigned.rows) {
      const inferred = inferProspectGender({ firstName: row.first_name });
      if (inferred) {
        await pool.query('UPDATE prospects SET gender = $1 WHERE id = $2', [inferred, row.id]);
      }
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pending_prospects (
      id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      linkedin_url  VARCHAR(500) NOT NULL,
      first_name    VARCHAR(255),
      last_name     VARCHAR(255),
      company_name  VARCHAR(255),
      job_title     VARCHAR(255),
      notes         TEXT,
      dismissed_at  TIMESTAMPTZ,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_pending_prospects_user_id ON pending_prospects(user_id);
    CREATE INDEX IF NOT EXISTS idx_pending_prospects_dismissed_at ON pending_prospects(dismissed_at);

    ALTER TABLE users ADD COLUMN IF NOT EXISTS candidate_preferences JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_job_email_synced_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS job_email_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE;

    ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS match_score INT;
    ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS match_reasons TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS missing_skills TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS location TEXT;
    ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS salary_range TEXT;
    ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS source_email_id TEXT;
    ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS email_source TEXT;

    CREATE INDEX IF NOT EXISTS idx_job_applications_source_email_id ON job_applications(source_email_id);
    CREATE INDEX IF NOT EXISTS idx_job_applications_match_score ON job_applications(match_score DESC);

    CREATE TABLE IF NOT EXISTS system_logs (
      id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
      level         VARCHAR(20)  NOT NULL,
      message       TEXT         NOT NULL,
      source        VARCHAR(50)  NOT NULL DEFAULT 'backend',
      context       JSONB,
      error_name    VARCHAR(255),
      stack_trace   TEXT,
      request_id    VARCHAR(100),
      method        VARCHAR(10),
      path          VARCHAR(500),
      status_code   INTEGER,
      user_id       UUID         REFERENCES users(id) ON DELETE SET NULL,
      ip            VARCHAR(100),
      github_issue_url VARCHAR(500),
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS github_issue_url VARCHAR(500);
    CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
    CREATE INDEX IF NOT EXISTS idx_system_logs_source ON system_logs(source);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

    -- Merge existing email placeholder applications into full applications for the same user and company
    DO $$
    DECLARE
      r RECORD;
      real_app RECORD;
    BEGIN
      FOR r IN
        SELECT id, user_id, company_name, notes, source_email_id, email_source
        FROM job_applications
        WHERE (job_title ILIKE 'Role at %' OR job_url = '#' OR platform = 'Email')
      LOOP
        SELECT id, notes INTO real_app
        FROM job_applications
        WHERE user_id = r.user_id
          AND (LOWER(company_name) = LOWER(r.company_name) OR LOWER(r.company_name) LIKE '%' || LOWER(company_name) || '%' OR LOWER(company_name) LIKE '%' || LOWER(r.company_name) || '%')
          AND id != r.id
          AND job_title NOT ILIKE 'Role at %'
          AND job_url != '#'
        ORDER BY created_at DESC
        LIMIT 1;

        IF FOUND THEN
          UPDATE job_applications
          SET notes = CASE
            WHEN r.notes IS NOT NULL AND notes IS NOT NULL AND notes NOT LIKE '%' || r.notes || '%' THEN notes || E'\n' || r.notes
            WHEN notes IS NULL THEN r.notes
            ELSE notes
          END,
          source_email_id = COALESCE(source_email_id, r.source_email_id),
          email_source = COALESCE(email_source, r.email_source),
          updated_at = NOW()
          WHERE id = real_app.id;

          DELETE FROM job_applications WHERE id = r.id;
        END IF;
      END LOOP;
    END $$;

    -- Deduplicate exact duplicate applications (same user, company, and title)
    DELETE FROM job_applications
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY user_id, LOWER(company_name), LOWER(job_title)
                 ORDER BY updated_at DESC, created_at DESC
               ) as rnum
        FROM job_applications
      ) t
      WHERE t.rnum > 1
    );

    -- Merge and deduplicate duplicate applications by base URL (e.g. tracking links or concurrent submits)
    DO $$
    DECLARE
      dup RECORD;
      primary_app RECORD;
    BEGIN
      FOR dup IN
        SELECT id, user_id, job_url, notes, company_id, job_id, match_score, match_reasons, missing_skills
        FROM (
          SELECT id, user_id, job_url, notes, company_id, job_id, match_score, match_reasons, missing_skills,
                 ROW_NUMBER() OVER (
                   PARTITION BY user_id, split_part(job_url, '?', 1)
                   ORDER BY
                     CASE WHEN status IN ('interview', 'offer', 'applied') THEN 0 ELSE 1 END,
                     updated_at DESC,
                     created_at DESC
                 ) as rnum
          FROM job_applications
          WHERE job_url NOT IN ('#', '')
        ) t
        WHERE t.rnum > 1
      LOOP
        SELECT id, notes, company_id, job_id, match_score INTO primary_app
        FROM job_applications
        WHERE user_id = dup.user_id
          AND split_part(job_url, '?', 1) = split_part(dup.job_url, '?', 1)
          AND id != dup.id
        ORDER BY
          CASE WHEN status IN ('interview', 'offer', 'applied') THEN 0 ELSE 1 END,
          updated_at DESC,
          created_at DESC
        LIMIT 1;

        IF FOUND THEN
          UPDATE job_applications
          SET notes = CASE
            WHEN dup.notes IS NOT NULL AND notes IS NOT NULL AND notes NOT LIKE '%' || dup.notes || '%' THEN notes || E'\n' || dup.notes
            WHEN notes IS NULL THEN dup.notes
            ELSE notes
          END,
          company_id = COALESCE(company_id, dup.company_id),
          job_id = COALESCE(job_id, dup.job_id),
          match_score = COALESCE(match_score, dup.match_score),
          updated_at = NOW()
          WHERE id = primary_app.id;

          DELETE FROM job_applications WHERE id = dup.id;
        END IF;
      END LOOP;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_job_applications_user_url
      ON job_applications(user_id, job_url)
      WHERE job_url NOT IN ('#', '');
  `);

  console.log('Database migration completed successfully');
}

async function seedAdminUser(): Promise<void> {
  const existing = await pool.query('SELECT id FROM users WHERE username = $1', [CONFIG.adminUsername]);
  if (existing.rowCount && existing.rowCount > 0) return;

  const hash = await bcrypt.hash(CONFIG.adminPassword, 12);
  await pool.query(
    `INSERT INTO users (username, role, password_hash) VALUES ($1, 'admin', $2)`,
    [CONFIG.adminUsername, hash]
  );
  console.log(`Admin user '${CONFIG.adminUsername}' created`);
}
