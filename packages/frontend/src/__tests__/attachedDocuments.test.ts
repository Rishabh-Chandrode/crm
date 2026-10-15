import { describe, it, expect } from 'vitest';
import { attachedDocumentIds } from '../lib/attachedDocuments';

describe('attachedDocumentIds', () => {
  const documents = [{ id: 'doc-1' }, { id: 'doc-2' }];

  it('keeps only ids that still exist in the documents list', () => {
    expect(attachedDocumentIds(['doc-1', 'deleted-doc', 'doc-2'], documents)).toEqual(['doc-1', 'doc-2']);
  });

  it('returns an empty list when every attached document was deleted', () => {
    expect(attachedDocumentIds(['deleted-doc'], documents)).toEqual([]);
    expect(attachedDocumentIds(null, documents)).toEqual([]);
    expect(attachedDocumentIds(undefined, [])).toEqual([]);
  });
});
