import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { pool } from '../db/index.js';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

type DriveFileType = 'file' | 'doc' | 'sheet' | 'slides';

interface ParsedDriveUrl {
  fileId: string;
  type: DriveFileType;
}

export function parseDriveUrl(url: string): ParsedDriveUrl | null {
  const docMatch = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docMatch) return { fileId: docMatch[1]!, type: 'doc' };

  const sheetMatch = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (sheetMatch) return { fileId: sheetMatch[1]!, type: 'sheet' };

  const slidesMatch = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (slidesMatch) return { fileId: slidesMatch[1]!, type: 'slides' };

  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return { fileId: fileMatch[1]!, type: 'file' };

  const openMatch = url.match(/drive\.google\.com\/open\?.*?id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return { fileId: openMatch[1]!, type: 'file' };

  const ucMatch = url.match(/drive\.google\.com\/uc\?.*?id=([a-zA-Z0-9_-]+)/);
  if (ucMatch) return { fileId: ucMatch[1]!, type: 'file' };

  return null;
}

function getDownloadUrl(parsed: ParsedDriveUrl): string {
  switch (parsed.type) {
    case 'doc':    return `https://docs.google.com/document/d/${parsed.fileId}/export?format=pdf`;
    case 'sheet':  return `https://docs.google.com/spreadsheets/d/${parsed.fileId}/export?format=pdf`;
    case 'slides': return `https://docs.google.com/presentation/d/${parsed.fileId}/export?format=pdf`;
    default:       return `https://drive.google.com/uc?export=download&id=${parsed.fileId}&confirm=1`;
  }
}

function extractFilename(contentDisposition: string | null, parsed: ParsedDriveUrl): string {
  if (contentDisposition) {
    const utf8 = contentDisposition.match(/filename\*=UTF-8''([^;\n]+)/i);
    if (utf8?.[1]) return decodeURIComponent(utf8[1].trim());
    const plain = contentDisposition.match(/filename=["']?([^"';\n]+)/i);
    if (plain?.[1]) return plain[1].trim().replace(/^"|"$/g, '');
  }
  return parsed.type === 'file' ? 'drive-file.pdf' : 'document.pdf';
}

async function fetchWithConfirm(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    redirect: 'follow',
  });

  const contentType = res.headers.get('content-type') ?? '';
  if (res.ok && !contentType.includes('text/html')) return res;

  if (contentType.includes('text/html')) {
    const html = await res.text();

    // Drive's virus-scan warning page — extract confirm token and retry
    const tokenMatch = html.match(/name="uuid"\s+value="([^"]+)"/);
    if (tokenMatch?.[1]) {
      const parsed2 = new URL(url);
      const fileId = parsed2.searchParams.get('id') ?? '';
      const confirmUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t&uuid=${tokenMatch[1]}`;
      const res2 = await fetch(confirmUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
      if (res2.ok) return res2;
    }

    // Older confirm pattern
    const hrefMatch = html.match(/href="(\/uc\?[^"]*confirm=[^"]+)"/);
    if (hrefMatch?.[1]) {
      const confirmUrl = `https://drive.google.com${hrefMatch[1].replace(/&amp;/g, '&')}`;
      const res2 = await fetch(confirmUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
      if (res2.ok) return res2;
    }

    if (html.includes('Google Drive - Quota exceeded') || html.includes('quota')) {
      throw new Error('Google Drive download quota exceeded — try again later');
    }

    throw new Error('File is not publicly accessible — make sure sharing is set to "Anyone with the link"');
  }

  if (res.status === 403 || res.status === 404) {
    const err = new Error('DRIVE_FILE_GONE') as Error & { code: string };
    err.code = 'DRIVE_FILE_GONE';
    throw err;
  }

  throw new Error(`Drive download failed with status ${res.status}`);
}

export async function fetchAndSaveFile(
  driveUrl: string,
  existingPath?: string,
): Promise<{ filePath: string; filename: string; size: number }> {
  const parsed = parseDriveUrl(driveUrl);
  if (!parsed) throw new Error('Invalid Google Drive URL');

  const downloadUrl = getDownloadUrl(parsed);
  const res = await fetchWithConfirm(downloadUrl);

  const filename = extractFilename(res.headers.get('content-disposition'), parsed);
  const buffer = Buffer.from(await res.arrayBuffer());

  let filePath: string;
  if (existingPath && fs.existsSync(existingPath)) {
    filePath = existingPath;
  } else {
    const ext = path.extname(filename) || '.pdf';
    filePath = path.join(UPLOADS_DIR, `${randomUUID()}${ext}`);
  }

  fs.writeFileSync(filePath, buffer);
  return { filePath, filename, size: buffer.length };
}

interface DriveDoc {
  id: string;
  name: string;
  path: string;
  drive_url: string;
}

export async function syncDriveDocuments(): Promise<void> {
  const result = await pool.query<DriveDoc>(
    `SELECT id, name, path, drive_url FROM documents WHERE drive_url IS NOT NULL`,
  );

  for (const doc of result.rows) {
    try {
      const { filePath, size } = await fetchAndSaveFile(doc.drive_url, doc.path);
      await pool.query(
        `UPDATE documents SET path = $1, size = $2, drive_synced_at = NOW(), drive_sync_error = NULL WHERE id = $3`,
        [filePath, size, doc.id],
      );
      console.log(`Drive sync: updated "${doc.name}" (${doc.id})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'DRIVE_FILE_GONE' || (err as { code?: string }).code === 'DRIVE_FILE_GONE') {
        // File was deleted from Drive — clean up locally
        await pool.query(
          `UPDATE email_templates SET document_ids = array_remove(document_ids, $1::uuid) WHERE $1::uuid = ANY(document_ids)`,
          [doc.id],
        );
        await pool.query(`DELETE FROM documents WHERE id = $1`, [doc.id]);
        try { if (doc.path) fs.unlinkSync(doc.path); } catch { /* already gone */ }
        console.log(`Drive sync: removed "${doc.name}" (${doc.id}) — file deleted from Drive`);
      } else {
        await pool.query(
          `UPDATE documents SET drive_sync_error = $1, drive_synced_at = NOW() WHERE id = $2`,
          [msg, doc.id],
        );
        console.error(`Drive sync: failed for "${doc.name}" (${doc.id}):`, msg);
      }
    }
  }
}
