import { Router } from 'express';
import { pool } from '../db/index.js';
import type { EmailTemplate, TemplateVariable } from '../types/index.js';
import { extractPlaceholders } from '../services/templateEngine.js';

const router: ReturnType<typeof Router> = Router();

router.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query<EmailTemplate>(
      'SELECT * FROM email_templates ORDER BY name ASC'
    );
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, description, subject, body, job_description, variables } =
      req.body as Partial<EmailTemplate>;

    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }
    if (!subject?.trim()) { res.status(400).json({ error: 'subject is required' }); return; }
    if (!body?.trim()) { res.status(400).json({ error: 'body is required' }); return; }

    const result = await pool.query<EmailTemplate>(
      `INSERT INTO email_templates (name, description, subject, body, job_description, variables)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        name.trim(),
        description ?? null,
        subject.trim(),
        body,
        job_description ?? null,
        JSON.stringify(variables ?? []),
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
    const result = await pool.query<EmailTemplate>(
      'SELECT * FROM email_templates WHERE id = $1',
      [id]
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
    const { name, description, subject, body, job_description, variables } =
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

    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    const result = await pool.query<EmailTemplate>(
      `UPDATE email_templates SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
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
    const result = await pool.query<{ id: string }>(
      'DELETE FROM email_templates WHERE id = $1 RETURNING id',
      [id]
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
    const result = await pool.query<EmailTemplate>(
      'SELECT subject, body FROM email_templates WHERE id = $1',
      [id]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    const { subject, body } = result.rows[0];
    const keys = extractPlaceholders(`${subject} ${body}`);

    const existingVars = (req.body as { existing?: TemplateVariable[] }).existing ?? [];
    const existingKeys = new Set(existingVars.map((v) => v.key));

    const newVars: TemplateVariable[] = keys
      .filter((k) => !existingKeys.has(k))
      .map((k) => ({
        key: k,
        label: k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        source: 'custom' as const,
        field: undefined,
        defaultValue: '',
      }));

    res.json({ data: { detected: keys, newVariables: newVars } });
  } catch (err) {
    next(err);
  }
});

export default router;
