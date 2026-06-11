import fs from 'fs';
import { pool } from '../db/index.js';
import type { Attachment } from './email/types.js';

export async function getResumeAttachment(): Promise<Attachment | null> {
  const rows = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN ('resume_filename', 'resume_path')`
  );
  const map: Record<string, string> = {};
  for (const r of rows.rows) map[r.key] = r.value;

  const filePath = map['resume_path'];
  const filename = map['resume_filename'];

  if (!filePath || !filename || !fs.existsSync(filePath)) return null;
  return { filename, path: filePath };
}
