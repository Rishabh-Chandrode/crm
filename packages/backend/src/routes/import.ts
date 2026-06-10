import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { pool } from '../db/index.js';

const router: ReturnType<typeof Router> = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const okByMime = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
      'text/plain',
    ].includes(file.mimetype);
    const okByExt = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    if (okByMime || okByExt) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx, .xls, and .csv files are accepted'));
    }
  },
});

// Ordered list of (fieldKey, regex) pairs used to auto-detect column mapping.
const FIELD_MATCHERS: [string, RegExp][] = [
  ['first_name',   /^(first.?name|firstname|fname|first)$/i],
  ['last_name',    /^(last.?name|lastname|lname|surname|last)$/i],
  ['full_name',    /^(name|full.?name|fullname|contact.?name)$/i],
  ['email',        /^(email|email.?address|e-?mail)$/i],
  ['company',      /^(company|company.?name|organization|org|employer)$/i],
  ['job_title',    /^(title|job.?title|position|role|designation)$/i],
  ['phone',        /^(phone|phone.?number|mobile|cell|telephone|tel)$/i],
  ['linkedin_url', /^(linkedin|linkedin.?url|linkedin.?profile|li)$/i],
  ['notes',        /^(notes?|comments?|remarks?|description)$/i],
];

function suggestMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    for (const [field, regex] of FIELD_MATCHERS) {
      if (!mapping[field] && regex.test(header.trim())) {
        mapping[field] = header;
        break;
      }
    }
  }
  return mapping;
}

/**
 * POST /api/import/parse
 * Accepts multipart/form-data with a single `file` field (.xlsx, .xls, or .csv).
 * Returns parsed headers, a preview of the first 5 rows, all rows, and an
 * auto-detected field → column mapping suggestion.
 */
router.post('/parse', upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', raw: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      res.status(400).json({ error: 'The file contains no sheets' });
      return;
    }

    const sheet = workbook.Sheets[sheetName]!;
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    });

    if (rawRows.length === 0) {
      res.status(400).json({ error: 'The sheet contains no data rows' });
      return;
    }

    const headers = Object.keys(rawRows[0]!);
    // Normalise everything to strings so the frontend doesn't have to type-check
    const rows = rawRows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, v == null ? '' : String(v)])
      )
    );

    res.json({
      data: {
        headers,
        preview: rows.slice(0, 5),
        rows,
        rowCount: rows.length,
        suggestedMapping: suggestMapping(headers),
      },
    });
  } catch (err) {
    next(err);
  }
});

interface ImportMapping {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  company?: string;
  job_title?: string;
  phone?: string;
  linkedin_url?: string;
  notes?: string;
}

interface ImportBody {
  rows: Record<string, string>[];
  mapping: ImportMapping;
  defaultCompanyId?: string;
  createMissingCompanies?: boolean;
}

/**
 * POST /api/import/prospects
 * Inserts rows using the provided column mapping.
 * Rows with duplicate emails or missing required fields are skipped, not failed.
 */
router.post('/prospects', async (req, res, next) => {
  try {
    const {
      rows,
      mapping,
      defaultCompanyId,
      createMissingCompanies = false,
    } = req.body as ImportBody;

    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'No rows to import' });
      return;
    }

    const col = (row: Record<string, string>, key?: string) =>
      key ? (row[key] ?? '').trim() : '';

    let imported = 0;
    let skipped = 0;
    const errors: { row: number; email?: string; error: string }[] = [];

    // Cache company name (lowercased) → id to avoid N+1 on company lookups
    const companyCache = new Map<string, string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rowNum = i + 1;

      try {
        // ── Resolve name ────────────────────────────────────────────────────
        let firstName = col(row, mapping.first_name);
        let lastName: string | null = col(row, mapping.last_name) || null;

        if (!firstName && mapping.full_name) {
          const full = col(row, mapping.full_name);
          const spaceIdx = full.indexOf(' ');
          firstName = spaceIdx > -1 ? full.slice(0, spaceIdx) : full;
          lastName = spaceIdx > -1 ? full.slice(spaceIdx + 1).trim() || null : null;
        }

        const email = col(row, mapping.email).toLowerCase();

        if (!firstName) {
          errors.push({ row: rowNum, error: 'Missing first name — skipped' });
          skipped++;
          continue;
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errors.push({ row: rowNum, firstName, error: 'Missing or invalid email — skipped' } as never);
          skipped++;
          continue;
        }

        // ── Check for duplicate email ────────────────────────────────────────
        const dup = await pool.query<{ id: string }>(
          'SELECT id FROM prospects WHERE email = $1',
          [email]
        );
        if (dup.rows[0]) {
          errors.push({ row: rowNum, email, error: 'Email already exists — skipped' });
          skipped++;
          continue;
        }

        // ── Resolve company ──────────────────────────────────────────────────
        let companyId: string | null = defaultCompanyId ?? null;
        const companyName = col(row, mapping.company);

        if (companyName) {
          const key = companyName.toLowerCase();
          if (companyCache.has(key)) {
            companyId = companyCache.get(key)!;
          } else {
            const found = await pool.query<{ id: string }>(
              'SELECT id FROM companies WHERE LOWER(name) = $1 LIMIT 1',
              [key]
            );
            if (found.rows[0]) {
              companyId = found.rows[0].id;
            } else if (createMissingCompanies) {
              const created = await pool.query<{ id: string }>(
                'INSERT INTO companies (name) VALUES ($1) RETURNING id',
                [companyName]
              );
              companyId = created.rows[0]!.id;
            }
            if (companyId) companyCache.set(key, companyId);
          }
        }

        // ── Insert prospect ──────────────────────────────────────────────────
        await pool.query(
          `INSERT INTO prospects
             (company_id, first_name, last_name, email, job_title, linkedin_url, phone, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            companyId,
            firstName,
            lastName,
            email,
            col(row, mapping.job_title) || null,
            col(row, mapping.linkedin_url) || null,
            col(row, mapping.phone) || null,
            col(row, mapping.notes) || null,
          ]
        );
        imported++;
      } catch (rowErr) {
        const msg = rowErr instanceof Error ? rowErr.message : 'Unknown error';
        errors.push({ row: rowNum, error: msg });
        skipped++;
      }
    }

    res.json({ data: { imported, skipped, errors } });
  } catch (err) {
    next(err);
  }
});

export default router;
