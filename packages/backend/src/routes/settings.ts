import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from '../db/index.js';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `resume${ext}`);
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

router.get('/resume', async (_req, res, next) => {
  try {
    const rows = await pool.query<{ key: string; value: string }>(
      `SELECT key, value FROM settings WHERE key IN ('resume_filename', 'resume_path', 'resume_uploaded_at')`
    );
    const map: Record<string, string> = {};
    for (const r of rows.rows) map[r.key] = r.value;

    const resumePath = map['resume_path'];
    const exists = resumePath ? fs.existsSync(resumePath) : false;

    res.json({
      data: {
        exists,
        filename: map['resume_filename'] ?? null,
        uploadedAt: map['resume_uploaded_at'] ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/resume', upload.single('resume'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO settings (key, value) VALUES
         ('resume_filename', $1), ('resume_path', $2), ('resume_uploaded_at', $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [req.file.originalname, req.file.path, now]
    );

    res.json({ data: { exists: true, filename: req.file.originalname, uploadedAt: now } });
  } catch (err) {
    next(err);
  }
});

router.delete('/resume', async (_req, res, next) => {
  try {
    const row = await pool.query<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'resume_path'`
    );
    const resumePath = row.rows[0]?.value;
    if (resumePath && fs.existsSync(resumePath)) {
      fs.unlinkSync(resumePath);
    }
    await pool.query(
      `DELETE FROM settings WHERE key IN ('resume_filename', 'resume_path', 'resume_uploaded_at')`
    );
    res.json({ data: { exists: false } });
  } catch (err) {
    next(err);
  }
});

export default router;
