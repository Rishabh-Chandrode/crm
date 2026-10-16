export interface InferredJob {
  company_name: string;
  job_title: string;
  job_url: string;
  platform: string;
}

const GENERIC_HOST_LABELS = new Set(['jobs', 'careers', 'apply', 'app', 'hire', 'work', 'www']);

function firstHttp(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  return match[0].replace(/[),.;]+$/, '');
}

/** First http(s) link from the share `url` field, then from `text`. */
export function resolveSharedLink(url: string | null | undefined, text: string | null | undefined): string {
  return firstHttp(url) ?? firstHttp(text) ?? '';
}

/** Company and platform from a job URL. Mirrors the extension's tab extractor. */
export function inferJobFromUrl(jobUrl: string, title = ''): InferredJob {
  let hostname = '';
  try {
    hostname = new URL(jobUrl).hostname;
  } catch {
    hostname = '';
  }

  const jobTitle = title.replace(/\s*[-|·—]\s*.+$/, '').trim();
  let company = '';
  let platform = 'Generic';

  if (hostname.includes('greenhouse.io')) {
    platform = 'Greenhouse';
    const match = jobUrl.match(/greenhouse\.io\/([^/?#]+)/);
    company = match?.[1]?.replace(/-/g, ' ') ?? '';
  } else if (hostname.includes('lever.co')) {
    platform = 'Lever';
    const match = jobUrl.match(/lever\.co\/([^/?#]+)/);
    company = match?.[1]?.replace(/-/g, ' ') ?? '';
  } else if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) {
    platform = 'Workday';
    company = hostname.split('.')[0] ?? '';
  } else if (hostname.includes('ashbyhq.com')) {
    platform = 'Ashby';
    const match = jobUrl.match(/ashbyhq\.com\/([^/?#]+)/);
    company = match?.[1]?.replace(/-/g, ' ') ?? '';
  } else if (hostname.includes('linkedin.com')) {
    platform = 'LinkedIn';
  }

  if (!company && hostname) {
    const parts = hostname.split('.');
    const main = parts.length >= 2 ? parts[parts.length - 2] : hostname;
    if (main && !GENERIC_HOST_LABELS.has(main)) {
      company = main.charAt(0).toUpperCase() + main.slice(1);
    }
  }

  return { company_name: company, job_title: jobTitle, job_url: jobUrl, platform };
}

const COMPANY_SKIP = new Set([
  'jobs', 'job', 'careers', 'apply', 'app', 'hire', 'work', 'www',
  'linkedin', 'greenhouse', 'lever', 'workday', 'ashby', 'smartrecruiters',
  'opening', 'openings', 'search', 'view',
]);

function titleCaseWords(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function phraseCompanies(source: string): string[] {
  const trimmed = source.trim();
  if (!trimmed) return [];
  const found: string[] = [];
  const atMatch = trimmed.match(/\bat\s+(.+)$/i);
  if (atMatch?.[1]) {
    const beforeBoard = atMatch[1].split(/\s*(?:\||·|—|-)\s*/)[0]?.trim() ?? '';
    if (beforeBoard) found.push(beforeBoard);
  }
  const parts = trimmed.split(/\s*(?:\||·|—|-)\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) found.push(parts[parts.length - 1] ?? '');
  return found;
}

/** Possible company names from a shared job link, title, and message. */
export function companyOptionsFromShare(url: string, title = '', text = ''): string[] {
  const options: string[] = [];
  const push = (raw: string) => {
    const label = titleCaseWords(raw);
    if (label.length < 2 || COMPANY_SKIP.has(label.toLowerCase())) return;
    if (options.some((existing) => existing.toLowerCase() === label.toLowerCase())) return;
    options.push(label);
  };

  push(inferJobFromUrl(url, title).company_name);
  for (const source of [title, text]) {
    for (const piece of phraseCompanies(source)) push(piece);
  }
  return options.slice(0, 6);
}

/** Internal path + query only. Rejects protocol-relative and external targets. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;

  const pathOnly = next.split(/[?#]/)[0];
  if (!pathOnly.startsWith('/') || pathOnly.startsWith('//')) return null;
  if (pathOnly.includes('\\') || pathOnly.includes(':') || pathOnly.includes('//')) return null;

  return next;
}

export function postLoginPath(next: string | null | undefined): string {
  return safeNextPath(next) ?? '/dashboard';
}
