import { Router } from 'express';
import { pool } from '../db/index.js';
import { ownerFilter } from '../middleware/ownerFilter.js';
import type { EmailTemplate, TemplateVariable } from '../types/index.js';
import { liveDocumentIds, pruneMissingDocumentRefs } from '../services/documentRefs.js';
import { extractPlaceholders, toVariableLabel } from '../services/templateEngine.js';
import type { VariablePreset } from './variable-presets.js';

const router: ReturnType<typeof Router> = Router();

router.get('/', async (req, res, next) => {
  try {
    await pruneMissingDocumentRefs();
    const includeAll = req.query.all === 'true';
    const { sql, value } = ownerFilter(req.user!, 'email_templates', 1);
    const params = value ? [value] : [];
    const ownerAnd = sql ? `AND ${sql}` : '';
    const ownerWhere = sql ? `WHERE ${sql}` : '';

    const result = await pool.query<EmailTemplate>(
      includeAll
        ? `SELECT * FROM email_templates ${ownerWhere} ORDER BY name ASC, version DESC`
        : `SELECT * FROM (
             SELECT DISTINCT ON (family_id) *
             FROM email_templates
             WHERE deleted_at IS NULL ${ownerAnd}
             ORDER BY family_id, version DESC
           ) latest
           ORDER BY name ASC`,
      params
    );
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, description, subject, body, job_description, variables, document_ids } =
      req.body as Partial<EmailTemplate>;

    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }
    if (!subject?.trim()) { res.status(400).json({ error: 'subject is required' }); return; }
    if (!body?.trim()) { res.status(400).json({ error: 'body is required' }); return; }

    const result = await pool.query<EmailTemplate>(
      `INSERT INTO email_templates (
         id, family_id, name, description, subject, body, job_description, variables, document_ids, created_by, version
       )
       SELECT s.id, s.id, $1, $2, $3, $4, $5, $6, $7, $8, 1
       FROM (SELECT uuid_generate_v4() AS id) s
       RETURNING *`,
      [
        name.trim(),
        description ?? null,
        subject.trim(),
        body,
        job_description ?? null,
        JSON.stringify(variables ?? []),
        await liveDocumentIds(document_ids ?? []),
        req.user!.id,
      ]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sql, value } = ownerFilter(req.user!, 'email_templates', 2);
    const ownerWhere = sql ? `AND ${sql}` : '';
    const params: unknown[] = [id];
    if (value) params.push(value);

    const result = await pool.query<EmailTemplate>(
      `SELECT * FROM email_templates WHERE id = $1 ${ownerWhere}`,
      params
    );
    const template = result.rows[0];
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    template.document_ids = await liveDocumentIds(template.document_ids ?? []);
    res.json({ data: template });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, subject, body, job_description, variables, document_ids } =
      req.body as Partial<EmailTemplate>;

    const { sql, value } = ownerFilter(req.user!, 'email_templates', 2);
    const ownerWhere = sql ? `AND ${sql}` : '';
    const params: unknown[] = [id];
    if (value) params.push(value);

    const existing = await pool.query<EmailTemplate & { created_by: string | null }>(
      `SELECT * FROM email_templates WHERE id = $1 ${ownerWhere}`,
      params
    );
    const source = existing.rows[0];
    if (!source) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    if (source.deleted_at) {
      res.status(400).json({ error: 'Deleted templates cannot be edited' });
      return;
    }

    const nextName = (name ?? source.name).trim();
    const nextSubject = (subject ?? source.subject).trim();
    const nextBody = body ?? source.body;
    if (!nextName || !nextSubject || !nextBody.trim()) {
      res.status(400).json({ error: 'name, subject, and body are required' });
      return;
    }

    const versionRes = await pool.query<{ version: number }>(
      `SELECT COALESCE(MAX(version), 0) + 1 AS version FROM email_templates WHERE family_id = $1`,
      [source.family_id]
    );
    const nextVersion = versionRes.rows[0]!.version;

    const inserted = await pool.query<EmailTemplate>(
      `INSERT INTO email_templates (
         name, description, subject, body, job_description, variables, document_ids, created_by, version, family_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        nextName,
        description !== undefined ? description : source.description,
        nextSubject,
        nextBody,
        job_description !== undefined ? job_description : source.job_description,
        JSON.stringify(variables ?? source.variables),
        await liveDocumentIds(document_ids ?? source.document_ids ?? []),
        source.created_by ?? req.user!.id,
        nextVersion,
        source.family_id,
      ]
    );
    res.json({ data: inserted.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/older-versions', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sql, value } = ownerFilter(req.user!, 'email_templates', 2);
    const ownerWhere = sql ? `AND ${sql}` : '';
    const params: unknown[] = [id];
    if (value) params.push(value);

    const source = await pool.query<{ family_id: string }>(
      `SELECT family_id FROM email_templates WHERE id = $1 ${ownerWhere}`,
      params
    );
    if (!source.rows[0]) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const familyId = source.rows[0].family_id;
    const { sql: delSql, value: delValue } = ownerFilter(req.user!, 'email_templates', 2);
    const delOwner = delSql ? `AND ${delSql}` : '';
    const delParams: unknown[] = [familyId];
    if (delValue) delParams.push(delValue);

    const result = await pool.query<{ id: string }>(
      `UPDATE email_templates
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE family_id = $1
         AND deleted_at IS NULL
         AND version < (
           SELECT MAX(version) FROM email_templates
           WHERE family_id = $1 AND deleted_at IS NULL
         )
         ${delOwner}
       RETURNING id`,
      delParams
    );
    res.json({ data: { ids: result.rows.map((row) => row.id) } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sql, value } = ownerFilter(req.user!, 'email_templates', 2);
    const ownerWhere = sql ? `AND ${sql}` : '';
    const params: unknown[] = [id];
    if (value) params.push(value);

    const result = await pool.query<{ id: string }>(
      `UPDATE email_templates
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL ${ownerWhere}
       RETURNING id`,
      params
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ data: { id } });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/detect-variables', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sql, value } = ownerFilter(req.user!, 'email_templates', 2);
    const ownerWhere = sql ? `AND ${sql}` : '';
    const params: unknown[] = [id];
    if (value) params.push(value);

    const result = await pool.query<EmailTemplate>(
      `SELECT subject, body FROM email_templates WHERE id = $1 ${ownerWhere}`,
      params
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    const { subject, body } = result.rows[0];
    const keys = extractPlaceholders(`${subject} ${body}`);

    const existingVars = (req.body as { existing?: TemplateVariable[] }).existing ?? [];
    const existingKeys = new Set(existingVars.map((v) => v.key));

    const presetsResult = await pool.query<VariablePreset>('SELECT * FROM variable_presets');
    const presetMap = new Map(presetsResult.rows.map((p) => [p.key, p]));

    const newVars: TemplateVariable[] = keys
      .filter((k) => !existingKeys.has(k))
      .map((k) => {
        const preset = presetMap.get(k);
        if (preset) {
          return {
            key: k,
            label: preset.label,
            source: preset.source as TemplateVariable['source'],
            field: preset.field ?? undefined,
            defaultValue: preset.default_value,
            maleValue: preset.male_value ?? (k === 'salutation' ? 'Sir' : k === 'honorific' ? 'Mr.' : undefined),
            femaleValue: preset.female_value ?? (k === 'salutation' ? 'Ma\'am' : k === 'honorific' ? 'Ms.' : undefined),
          };
        }
        if (k.toLowerCase() === 'salutation') {
          return {
            key: k,
            label: 'Salutation (Sir/Ma\'am)',
            source: 'prospect' as const,
            field: 'salutation',
            defaultValue: 'Sir/Ma\'am',
            maleValue: 'Sir',
            femaleValue: 'Ma\'am',
          };
        }
        if (k.toLowerCase() === 'honorific') {
          return {
            key: k,
            label: 'Honorific (Mr./Ms.)',
            source: 'prospect' as const,
            field: 'honorific',
            defaultValue: '',
            maleValue: 'Mr.',
            femaleValue: 'Ms.',
          };
        }
        return {
          key: k,
          label: toVariableLabel(k),
          source: 'custom' as const,
          field: undefined,
          defaultValue: '',
        };
      });

    res.json({ data: { detected: keys, newVariables: newVars } });
  } catch (err) {
    next(err);
  }
});

export default router;
