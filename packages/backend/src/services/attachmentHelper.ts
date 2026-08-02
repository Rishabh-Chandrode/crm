import { pool } from '../db/index.js';
import { getStorageService } from './storage/index.js';
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
  
  const storageService = getStorageService();
  const attachments: Attachment[] = [];
  
  for (const row of rows.rows) {
    try {
      const content = await storageService.download(row.path);
      attachments.push({
        filename: row.filename,
        content: content,
      });
    } catch (err) {
      console.error(`Failed to download attachment ${row.filename} from storage:`, err);
    }
  }
  
  return attachments;
}
