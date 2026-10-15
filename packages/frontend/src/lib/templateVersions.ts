export interface VersionedTemplate {
  id: string;
  family_id?: string | null;
  version?: number | null;
  deleted_at?: string | null;
}

export function templateFamilyId(template: VersionedTemplate): string {
  return template.family_id || template.id;
}

export function versionsInFamily<T extends VersionedTemplate>(templates: T[], familyId: string): T[] {
  return templates
    .filter((template) => templateFamilyId(template) === familyId)
    .sort((a, b) => (b.version || 1) - (a.version || 1));
}

/** One card per template family: the highest version number. */
export function latestTemplateCards<T extends VersionedTemplate>(templates: T[]): T[] {
  const byFamily = new Map<string, T>();
  for (const template of templates) {
    const family = templateFamilyId(template);
    const current = byFamily.get(family);
    if (!current || (template.version || 1) > (current.version || 1)) {
      byFamily.set(family, template);
    }
  }
  return [...byFamily.values()];
}

/** Highest version that is still live. Falls back to the highest version if every one is deleted. */
export function latestSelectableVersion<T extends VersionedTemplate>(versions: T[]): T | undefined {
  const live = versions.filter((template) => !template.deleted_at);
  const pool = live.length > 0 ? live : versions;
  return [...pool].sort((a, b) => (b.version || 1) - (a.version || 1))[0];
}
