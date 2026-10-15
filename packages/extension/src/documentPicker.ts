/** Documents managed on CRM Profile → Documents, attached during autofill. */

export const DOCUMENT_PICKER_EMPTY_LABEL = "Don't attach a document";

export const DOCUMENT_PICKER_EMPTY_NOTE =
  'Upload documents in CRM → Profile → Documents.';

export interface AutofillDocument {
  id: string;
  name: string;
  filename: string;
}

export interface DocumentPickerOption {
  value: string;
  label: string;
  filename: string | null;
}

export function buildDocumentPickerOptions(docs: AutofillDocument[]): DocumentPickerOption[] {
  return [
    { value: '', label: DOCUMENT_PICKER_EMPTY_LABEL, filename: null },
    ...docs.map((doc) => ({
      value: doc.id,
      label: doc.name || doc.filename,
      filename: doc.filename,
    })),
  ];
}

/** Select the only document automatically so autofill has a file to attach. */
export function defaultDocumentSelection(docs: AutofillDocument[]): string {
  return docs.length === 1 ? docs[0]!.id : '';
}
