/**
 * Utility to extract clean, readable, visible plain text from an HTML email.
 * Strips scripts, styles, metadata, and HTML tags while preserving line breaks and decoding common entities.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';

  return html
    // 1. Remove script, style, head, and noscript elements including content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    // 2. Convert block and break tags into newlines
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|section|header|footer|table)>/gi, '\n')
    // 3. Remove all remaining HTML tags
    .replace(/<[^>]+>/g, ' ')
    // 4. Decode common HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&bull;/gi, '•')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&#\d+;/g, (match) => {
      const num = parseInt(match.slice(2, -1), 10);
      return !isNaN(num) ? String.fromCharCode(num) : '';
    })
    // 5. Clean up excessive whitespace line by line
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}
