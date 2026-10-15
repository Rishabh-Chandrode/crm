import { pool } from '../db/index.js';

const PRUNE_TEMPLATES = `
UPDATE email_templates AS target
SET document_ids = COALESCE((
  SELECT array_agg(doc.id)
  FROM unnest(target.document_ids) AS ref(id)
  JOIN documents doc ON doc.id = ref.id
), '{}'::uuid[])
WHERE EXISTS (
  SELECT 1
  FROM unnest(target.document_ids) AS ref(id)
  LEFT JOIN documents doc ON doc.id = ref.id
  WHERE doc.id IS NULL
)`;

const PRUNE_SCHEDULES = `
UPDATE email_schedules AS target
SET document_ids = COALESCE((
  SELECT array_agg(doc.id)
  FROM unnest(target.document_ids) AS ref(id)
  JOIN documents doc ON doc.id = ref.id
), '{}'::uuid[])
WHERE EXISTS (
  SELECT 1
  FROM unnest(target.document_ids) AS ref(id)
  LEFT JOIN documents doc ON doc.id = ref.id
  WHERE doc.id IS NULL
)`;

/** Drop attachment ids that no longer exist in documents. Documents are the source of truth. */
export async function pruneMissingDocumentRefs(): Promise<void> {
  await pool.query(PRUNE_TEMPLATES);
  await pool.query(PRUNE_SCHEDULES);
}

/** Remove one deleted document from every template and schedule that still points at it. */
export async function detachDocument(documentId: string): Promise<void> {
  await pool.query(
    `UPDATE email_templates
     SET document_ids = array_remove(document_ids, $1::uuid)
     WHERE $1::uuid = ANY(document_ids)`,
    [documentId],
  );
  await pool.query(
    `UPDATE email_schedules
     SET document_ids = array_remove(document_ids, $1::uuid)
     WHERE $1::uuid = ANY(document_ids)`,
    [documentId],
  );
}

/** Keep only ids that still have a row in documents, in the original order. */
export async function liveDocumentIds(ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM documents WHERE id = ANY($1::uuid[])`,
    [unique],
  );
  const live = new Set(result.rows.map((row) => row.id));
  return unique.filter((id) => live.has(id));
}
