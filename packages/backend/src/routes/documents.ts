import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { pool } from '../db/index.js';
import { ownerFilter } from '../middleware/ownerFilter.js';
import { parseDriveUrl, fetchAndSaveFile } from '../services/driveSync.js';

import { getStorageService } from '../services/storage/index.js';

// We no longer need UPLOADS_DIR because we are using object storage
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.doc', '.docx'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and Word documents are allowed'));
    }
  },
});

const router: ReturnType<typeof Router> = Router();

router.get('/', async (req, res, next) => {
  try {
    const { sql, value } = ownerFilter(req.user!, 'documents', 1);
    const where = sql ? `WHERE ${sql}` : '';
    const params = value ? [value] : [];
    const result = await pool.query(
      `SELECT id, name, filename, size, drive_url, drive_synced_at, drive_sync_error, created_at FROM documents ${where} ORDER BY created_at DESC`,
      params
    );
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', upload.single('document'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const name = (req.body as { name?: string }).name?.trim();
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const storageService = getStorageService();
    const fileKey = await storageService.upload(req.file.buffer, req.file.originalname);

    const result = await pool.query(
      `INSERT INTO documents (name, filename, path, size, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, filename, size, created_at`,
      [name, req.file.originalname, fileKey, req.file.size, req.user!.id]
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/from-drive', async (req, res, next) => {
  try {
    const { name, drive_url } = req.body as { name?: string; drive_url?: string };

    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }
    if (!drive_url?.trim()) { res.status(400).json({ error: 'drive_url is required' }); return; }

    const parsed = parseDriveUrl(drive_url.trim());
    if (!parsed) {
      res.status(400).json({ error: 'Not a valid Google Drive or Google Docs URL' });
      return;
    }

    let filePath: string;
    let filename: string;
    let size: number;
    try {
      ({ filePath, filename, size } = await fetchAndSaveFile(drive_url.trim()));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to download from Drive';
      res.status(400).json({ error: msg });
      return;
    }

    const result = await pool.query(
      `INSERT INTO documents (name, filename, path, size, drive_url, drive_file_id, drive_synced_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
       RETURNING id, name, filename, size, drive_url, drive_synced_at, drive_sync_error, created_at`,
      [name.trim(), filename, filePath, size, drive_url.trim(), parsed.fileId, req.user!.id]
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    const { sql, value } = ownerFilter(req.user!, 'documents', 2);
    const ownerWhere = sql ? `AND ${sql}` : '';
    const params: unknown[] = [req.params['id']];
    if (value) params.push(value);

    const result = await pool.query<{ path: string; filename: string }>(
      `SELECT path, filename FROM documents WHERE id = $1 ${ownerWhere}`,
      params
    );
    const doc = result.rows[0];
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }

    const storageService = getStorageService();
    try {
      const buffer = await storageService.download(doc.path);
      res.setHeader('Content-Disposition', `attachment; filename="${doc.filename}"`);
      res.setHeader('Access-Control-Allow-Origin', '*');
      // For binary files, send the buffer directly
      res.send(buffer);
    } catch (err) {
      res.status(404).json({ error: 'File not found in storage' });
      return;
    }
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { sql, value } = ownerFilter(req.user!, 'documents', 2);
    const ownerWhere = sql ? `AND ${sql}` : '';
    const params: unknown[] = [req.params['id']];
    if (value) params.push(value);

    const result = await pool.query<{ path: string }>(
      `DELETE FROM documents WHERE id = $1 ${ownerWhere} RETURNING path`,
      params
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    const docId = req.params['id']!;
    const filePath = result.rows[0].path;
    
    const storageService = getStorageService();
    try { 
      await storageService.delete(filePath); 
    } catch { 
      /* already gone from storage — that's fine */ 
    }

    // Remove deleted document from any templates that reference it
    await pool.query(
      `UPDATE email_templates
       SET document_ids = array_remove(document_ids, $1::uuid)
       WHERE $1::uuid = ANY(document_ids)`,
      [docId]
    );

    res.json({ data: { id: docId } });
  } catch (err) {
    next(err);
  }
});

export default router;
