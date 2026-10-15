import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pool } from '../db/index.js';
import { detachDocument, liveDocumentIds, pruneMissingDocumentRefs } from '../services/documentRefs.js';

describe('documentRefs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('prunes template and schedule attachment ids that are not in documents', async () => {
    const spy = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as never);

    await pruneMissingDocumentRefs();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(String(spy.mock.calls[0]?.[0])).toContain('UPDATE email_templates');
    expect(String(spy.mock.calls[0]?.[0])).toContain('JOIN documents');
    expect(String(spy.mock.calls[1]?.[0])).toContain('UPDATE email_schedules');
  });

  it('detaches a deleted document from templates and schedules', async () => {
    const spy = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as never);

    await detachDocument('doc-1');

    expect(spy).toHaveBeenCalledTimes(2);
    expect(String(spy.mock.calls[0]?.[0])).toContain('array_remove');
    expect(String(spy.mock.calls[0]?.[0])).toContain('email_templates');
    expect(spy.mock.calls[0]?.[1]).toEqual(['doc-1']);
    expect(String(spy.mock.calls[1]?.[0])).toContain('email_schedules');
  });

  it('returns only document ids that still exist, in the original order', async () => {
    vi.spyOn(pool, 'query').mockResolvedValue({ rows: [{ id: 'doc-live' }] } as never);

    await expect(liveDocumentIds(['doc-gone', 'doc-live', 'doc-live'])).resolves.toEqual(['doc-live']);
  });

  it('skips the documents lookup when nothing is attached', async () => {
    const spy = vi.spyOn(pool, 'query');

    await expect(liveDocumentIds([])).resolves.toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
