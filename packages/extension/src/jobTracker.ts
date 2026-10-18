export interface TrackJobInfo {
  company_name: string;
  job_title:    string;
  job_url:      string;
  platform:     string;
}

/**
 * Normalizes job posting URLs by stripping tracking tokens, platform query params,
 * UTM parameters, and trailing slashes.
 */
export function normalizeJobUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (trimmed === '' || trimmed === '#') return trimmed;

  try {
    const parsed = new URL(trimmed);
    const trackingParams = [
      'trk',
      'refId',
      'trackingId',
      'midToken',
      'trkEmail',
      'otpToken',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'source',
      'gh_src',
      'gh_jid',
      'lever-source',
      'lever-origin',
      'ashby_jid',
      'fbzx',
      'ref',
      'eBP',
      'origin',
    ];

    for (const p of trackingParams) {
      parsed.searchParams.delete(p);
    }

    if (parsed.hostname.includes('linkedin.com') && parsed.pathname.includes('/comm/jobs/view/')) {
      parsed.pathname = parsed.pathname.replace('/comm/jobs/view/', '/jobs/view/');
    }

    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    return trimmed;
  }
}

/**
 * Extracts job title, company name, and career platform from a Chrome tab URL and title.
 */
export function extractJobInfoFromTab(tab: chrome.tabs.Tab): TrackJobInfo {
  const rawUrl   = tab.url ?? '';
  const url      = normalizeJobUrl(rawUrl);
  const hostname = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
  const jobTitle = (tab.title ?? '').replace(/\s*[-|·—]\s*.+$/, '').trim();
  let company    = '';
  let platform   = 'Generic';

  if (hostname.includes('greenhouse.io')) {
    platform = 'Greenhouse';
    const m = url.match(/greenhouse\.io\/([^/?#]+)/);
    company = m?.[1]?.replace(/-/g, ' ') ?? '';
  } else if (hostname.includes('lever.co')) {
    platform = 'Lever';
    const m = url.match(/lever\.co\/([^/?#]+)/);
    company = m?.[1]?.replace(/-/g, ' ') ?? '';
  } else if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) {
    platform = 'Workday';
    company = hostname.split('.')[0] ?? '';
  } else if (hostname.includes('ashbyhq.com')) {
    platform = 'Ashby';
    const m = url.match(/ashbyhq\.com\/([^/?#]+)/);
    company = m?.[1]?.replace(/-/g, ' ') ?? '';
  } else if (hostname.includes('linkedin.com')) {
    platform = 'LinkedIn';
  }

  if (!company && hostname) {
    const parts = hostname.split('.');
    const main = parts.length >= 2 ? parts[parts.length - 2] : hostname;
    if (main && !['jobs', 'careers', 'apply', 'app', 'hire', 'work', 'www'].includes(main)) {
      company = main.charAt(0).toUpperCase() + main.slice(1);
    }
  }

  return { company_name: company, job_title: jobTitle, job_url: url, platform };
}

/**
 * Formats user-friendly, specific error messages from HTTP responses or network failures.
 */
export function formatJobTrackError(status?: number, errJson?: { error?: string } | null, fallback = 'Failed to save — please try again.'): string {
  if (errJson?.error && typeof errJson.error === 'string' && errJson.error.trim().length > 0) {
    return errJson.error.trim();
  }
  if (status === 401) {
    return 'Session expired — please log in again.';
  }
  if (status === 403) {
    return 'Permission denied — unable to track application.';
  }
  if (status && status >= 400 && status < 500) {
    return `Invalid request (HTTP ${status}) — please check the job fields.`;
  }
  if (status && status >= 500) {
    return `Server error (HTTP ${status}) — error recorded in system logs.`;
  }
  return fallback;
}
