import { Router } from 'express';
import { pool } from '../db/index.js';
import { ownerFilter } from '../middleware/ownerFilter.js';
import type { EmailTemplate, TemplateVariable } from '../types/index.js';
import { extractPlaceholders, toVariableLabel } from '../services/templateEngine.js';
import type { VariablePreset } from './variable-presets.js';

const router: ReturnType<typeof Router> = Router();

router.get('/', async (req, res, next) => {
  try {
    const { sql, value } = ownerFilter(req.user!, 'email_templates', 1);
    const where = sql ? `WHERE ${sql}` : '';
    const params = value ? [value] : [];
    const result = await pool.query<EmailTemplate>(
      `SELECT * FROM email_templates ${where} ORDER BY name ASC`,
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
      `INSERT INTO email_templates (name, description, subject, body, job_description, variables, document_ids, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        name.trim(),
        description ?? null,
        subject.trim(),
        body,
        job_description ?? null,
        JSON.stringify(variables ?? []),
        document_ids ?? [],
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
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, subject, body, job_description, variables, document_ids } =
      req.body as Partial<EmailTemplate>;

    const fields: string[] = [];
    const values: unknown[] = [];

    const add = (col: string, val: unknown) => {
      fields.push(`${col} = $${fields.length + 1}`);
      values.push(val);
    };

    if (name !== undefined) add('name', name);
    if (description !== undefined) add('description', description);
    if (subject !== undefined) add('subject', subject);
    if (body !== undefined) add('body', body);
    if (job_description !== undefined) add('job_description', job_description);
    if (variables !== undefined) add('variables', JSON.stringify(variables));
    if (document_ids !== undefined) add('document_ids', document_ids);

    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    const { sql, value } = ownerFilter(req.user!, 'email_templates', values.length + 1);
    const ownerWhere = sql ? `AND ${sql}` : '';
    if (value) values.push(value);

    const result = await pool.query<EmailTemplate>(
      `UPDATE email_templates SET ${fields.join(', ')} WHERE id = $${values.length - (value ? 1 : 0)} ${ownerWhere} RETURNING *`,
      values
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ data: result.rows[0] });
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
      `DELETE FROM email_templates WHERE id = $1 ${ownerWhere} RETURNING id`,
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
