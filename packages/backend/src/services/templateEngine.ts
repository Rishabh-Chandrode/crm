import type { TemplateVariable, Prospect, Company } from '../types/index.js';

interface ResolutionContext {
  prospect: Prospect;
  company: Company | null;
  custom: Record<string, string>;
}

export function resolveTemplate(
  text: string,
  variables: TemplateVariable[],
  context: ResolutionContext
): string {
  let result = text;

  for (const variable of variables) {
    const placeholder = `{{${variable.key}}}`;
    let value = variable.defaultValue ?? '';

    if (variable.source === 'prospect' && variable.field) {
      const raw = (context.prospect as unknown as Record<string, unknown>)[variable.field];
      value = raw != null ? String(raw) : (variable.defaultValue ?? '');
    } else if (variable.source === 'company' && variable.field && context.company) {
      const raw = (context.company as unknown as Record<string, unknown>)[variable.field];
      value = raw != null ? String(raw) : (variable.defaultValue ?? '');
    } else if (variable.source === 'static') {
      value = variable.defaultValue ?? '';
    } else if (variable.source === 'custom') {
      value = context.custom[variable.key] ?? (variable.defaultValue ?? '');
    }

    result = result.replaceAll(placeholder, value);
  }

  return result;
}

export function plainTextToHtml(text: string): string {
  return text
    .split('\n')
    .map((line) => `<p style="margin:0 0 8px 0">${line.trim() === '' ? '&nbsp;' : escapeHtml(line)}</p>`)
    .join('');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function extractPlaceholders(text: string): string[] {
  const matches = [...text.matchAll(/\{\{([^}]+)\}\}/g)];
  return [...new Set(matches.map((m) => m[1] ?? '').filter(Boolean))];
}
