/** Attachment ids that still exist. The documents list is the source of truth. */
export function attachedDocumentIds(
  ids: string[] | null | undefined,
  documents: { id: string }[],
): string[] {
  const live = new Set(documents.map((doc) => doc.id));
  return (ids ?? []).filter((id) => live.has(id));
}
