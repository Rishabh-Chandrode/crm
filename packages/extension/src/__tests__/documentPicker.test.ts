import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_PICKER_EMPTY_LABEL,
  DOCUMENT_PICKER_EMPTY_NOTE,
  buildDocumentPickerOptions,
  defaultDocumentSelection,
} from '../documentPicker';

describe('autofill document picker', () => {
  it('builds options from profile documents and offers an empty choice', () => {
    const options = buildDocumentPickerOptions([
      { id: 'doc-1', name: 'Backend Resume', filename: 'backend.pdf' },
      { id: 'doc-2', name: '', filename: 'cover.docx' },
    ]);

    expect(options).toEqual([
      { value: '', label: DOCUMENT_PICKER_EMPTY_LABEL, filename: null },
      { value: 'doc-1', label: 'Backend Resume', filename: 'backend.pdf' },
      { value: 'doc-2', label: 'cover.docx', filename: 'cover.docx' },
    ]);
    expect(DOCUMENT_PICKER_EMPTY_NOTE).toContain('Profile → Documents');
  });

  it('auto-selects the only document and leaves the picker empty otherwise', () => {
    expect(defaultDocumentSelection([{ id: 'only', name: 'Resume', filename: 'r.pdf' }])).toBe('only');
    expect(defaultDocumentSelection([])).toBe('');
    expect(defaultDocumentSelection([
      { id: 'a', name: 'A', filename: 'a.pdf' },
      { id: 'b', name: 'B', filename: 'b.pdf' },
    ])).toBe('');
  });
});
