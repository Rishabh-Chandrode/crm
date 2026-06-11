import fs from 'fs';
import { pool } from '../db/index.js';
import type { Attachment } from './email/types.js';

interface ResumeRow {
  filename: string;
  path: string;
}

export async function getResumeAttachment(resumeId: string): Promise<Attachment | null> {
  const row = await pool.query<ResumeRow>(
    `SELECT filename, path FROM resumes WHERE id = $1`,
    [resumeId]
  );
  const r = row.rows[0];
  if (!r || !fs.existsSync(r.path)) return null;
  return { filename: r.filename, path: r.path };
}
