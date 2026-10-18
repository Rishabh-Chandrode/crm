export interface TrackJobInfo {
  company_name: string;
  job_title:    string;
  job_url:      string;
  platform:     string;
}

/**
 * Extracts job title, company name, and career platform from a Chrome tab URL and title.
 */
export function extractJobInfoFromTab(tab: chrome.tabs.Tab): TrackJobInfo {
  const url      = tab.url ?? '';
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
