import { pool } from './index.js';

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS companies (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  website     VARCHAR(500),
  industry    VARCHAR(255),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prospects (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID         REFERENCES companies(id) ON DELETE SET NULL,
  first_name   VARCHAR(255) NOT NULL,
  last_name    VARCHAR(255),
  email        VARCHAR(255) NOT NULL,
  job_title    VARCHAR(255),
  linkedin_url VARCHAR(500),
  phone        VARCHAR(50),
  notes        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
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
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resumes (
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
  resume_id       UUID         REFERENCES resumes(id) ON DELETE SET NULL,
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

/* Replaces the old attach_resume BOOLEAN with a FK to the resumes table.
   Also cleans up the single-resume key-value entries from the settings table. */
const MIGRATE_SCHEDULE_RESUME_ID = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_schedules' AND column_name = 'resume_id'
  ) THEN
    ALTER TABLE email_schedules
      ADD COLUMN resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL;
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

export async function migrate(): Promise<void> {
  await pool.query(SCHEMA);
  await pool.query(MIGRATE_PROSPECT_NAME);
  await pool.query(MIGRATE_SCHEDULE_RESUME_ID);
  console.log('Database migration completed successfully');
}
