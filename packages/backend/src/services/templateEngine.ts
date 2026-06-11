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
  const hasHtml = /<[a-zA-Z][^>]*>/.test(text);
  return text
    .split('\n')
    .map((line) => {
      if (line.trim() === '') return '<p style="margin:0 0 8px 0">&nbsp;</p>';
      const content = hasHtml ? line : escapeHtml(line);
      return `<p style="margin:0 0 8px 0">${content}</p>`;
    })
    .join('');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function wrapEmailHtml(bodyHtml: string, trackingPixelUrl?: string): string {
  const pixel = trackingPixelUrl
    ? `\n<img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0" />`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    a { color: #0066cc; text-decoration: underline; }
    p { margin: 0 0 8px 0; }
  </style>
</head>
<body>
${bodyHtml}${pixel}
</body>
</html>`;
}

export function extractPlaceholders(text: string): string[] {
  const matches = [...text.matchAll(/\{\{([^}]+)\}\}/g)];
  return [...new Set(matches.map((m) => m[1] ?? '').filter(Boolean))];
}
