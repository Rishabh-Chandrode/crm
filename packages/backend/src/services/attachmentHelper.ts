import fs from 'fs';
import { pool } from '../db/index.js';
import type { Attachment } from './email/types.js';

interface DocRow {
  filename: string;
  path: string;
}

export async function getAttachments(documentIds: string[]): Promise<Attachment[]> {
  if (documentIds.length === 0) return [];
  const rows = await pool.query<DocRow>(
    `SELECT filename, path FROM documents WHERE id = ANY($1)`,
    [documentIds]
  );
  return rows.rows
    .filter((r) => fs.existsSync(r.path))
    .map((r) => ({ filename: r.filename, path: r.path }));
}
