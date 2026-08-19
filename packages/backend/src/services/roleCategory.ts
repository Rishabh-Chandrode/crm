const HR_RE =
  /\b(hr|human\s+resources?|recruit\w*|talent(\s+(acquisition|partner|lead|manager|sourcer|ops))?|people\s+(ops|operations|partner)|staffing|headhunter)\b/i;

const ENGINEER_RE =
  /\b(sde|swe|software|developer|programmer|engineer|architect|backend|front[\s-]?end|full[\s-]?stack|devops|sre|platform|infrastructure|ios|android|mobile|data\s+scientist|data\s+engineer|machine\s+learning|ml\s+engineer|ai\s+engineer|tech\s+lead|technical\s+lead|engineering\s+manager|cto|vp\s+(of\s+)?engineering)\b/i;

export function inferRoleCategory(title: string | null | undefined): string | null {
  const t = title?.trim();
  if (!t) return null;
  if (HR_RE.test(t)) return 'hr';
  if (ENGINEER_RE.test(t)) return 'engineer';
  return 'other';
}
