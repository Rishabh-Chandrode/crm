import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { pool } from '../db/index.js';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

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

router.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, filename, size, created_at FROM documents ORDER BY created_at DESC`
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
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO documents (name, filename, path, size) VALUES ($1, $2, $3, $4) RETURNING id, name, filename, size, created_at`,
      [name, req.file.originalname, req.file.path, req.file.size]
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    }
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query<{ path: string }>(
      `DELETE FROM documents WHERE id = $1 RETURNING path`,
      [req.params['id']]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    const filePath = result.rows[0].path;
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ data: { id: req.params['id'] } });
  } catch (err) {
    next(err);
  }
});

export default router;
