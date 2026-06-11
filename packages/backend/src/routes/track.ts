import { Router } from 'express';
import { pool } from '../db/index.js';

const router: ReturnType<typeof Router> = Router();

// Smallest valid 1×1 transparent GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

router.get('/open/:sendId.gif', (req, res) => {
  const { sendId } = req.params;
  if (sendId) {
    pool
      .query(
        `UPDATE email_sends
         SET open_count = open_count + 1,
             opened_at  = COALESCE(opened_at, NOW())
         WHERE id = $1`,
        [sendId]
      )
      .catch(() => {});
  }
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.end(PIXEL);
});

export default router;
