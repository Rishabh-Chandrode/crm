export interface ExtractedJob {
  title: string;
  companyName: string;
  jobUrl: string;
  platform: string;
  location?: string;
  salaryRange?: string;
  snippet?: string;
}

export function unwrapTrackingUrl(rawUrl: string): string {
  try {
    let url = rawUrl.trim();
    // Unwrap Google redirect URLs
    if (url.includes('google.com/url?') && url.includes('q=')) {
      const parsed = new URL(url);
      const target = parsed.searchParams.get('q');
      if (target) url = target;
    }

    // Clean tracking query params from common platforms (LinkedIn, Indeed, UTM, etc.)
    const parsed = new URL(url);
    const trackingParams = [
      'trk', 'refId', 'trackingId', 'midToken', 'trkEmail', 'otpToken', 'utm_source',
      'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'source',
      'fbclid', 'gclid', 'mc_cid', 'mc_eid',
      // Indeed tracking params (keep `jk` / `vjk` as they identify the job)
      'tk', 'alid', 'bb', 'xpse', 'xkcb', 'from', 'vjs', 'adid', 'pub', 'rgtk', 'advn', 'sj', 'fromage',
    ];
    for (const p of trackingParams) {
      parsed.searchParams.delete(p);
    }

    // Normalize LinkedIn /comm/ to standard public /jobs/view/
    if (parsed.hostname.includes('linkedin.com') && parsed.pathname.includes('/comm/jobs/view/')) {
      parsed.pathname = parsed.pathname.replace('/comm/jobs/view/', '/jobs/view/');
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

export function detectPlatformFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('linkedin.com')) return 'LinkedIn';
  if (lower.includes('naukri.com')) return 'Naukri';
  if (lower.includes('greenhouse.io')) return 'Greenhouse';
  if (lower.includes('lever.co')) return 'Lever';
  if (lower.includes('workday.com') || lower.includes('myworkdayjobs.com')) return 'Workday';
  if (lower.includes('smartrecruiters.com')) return 'SmartRecruiters';
  if (lower.includes('ashbyhq.com')) return 'Ashby';
  if (lower.includes('indeed.com')) return 'Indeed';
  if (lower.includes('wellfound.com') || lower.includes('angel.co')) return 'Wellfound';
  return 'Email';
}

const NON_COMPANY_NOISE = /^(indeed|linkedin|naukri|glassdoor|ziprecruiter|wellfound|easy apply|apply now|apply|view job|just posted|today|yesterday|urgently hiring|actively hiring|responsive employer|new|remote|hybrid|on-site|onsite|full-time|part-time|contract|internship|temporary|\d+\s*(days?|hours?|mins?)\s*ago|\d+(\.\d+)?\s*★?)$/i;

function extractNearbyTextAfterAnchor(html: string, anchorEndIndex: number, maxChars = 350): string {
  const slice = html.slice(anchorEndIndex, anchorEndIndex + maxChars);
  // Stop before the next anchor tag so we don't bleed into the next job card
  const nextAnchorIdx = slice.search(/<a\b/i);
  const bounded = nextAnchorIdx !== -1 ? slice.slice(0, nextAnchorIdx) : slice;
  return bounded
    .replace(/<\/(?:div|td|tr|p|li|span|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function extractCompanyFromNearbyHtml(html: string, anchorEndIndex: number): string | null {
  const nearby = extractNearbyTextAfterAnchor(html, anchorEndIndex, 350);
  if (!nearby) return null;

  const segments = nearby
    .split(/\n|[•·|]|(?:\s+[-—]\s+)/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 80);

  for (const seg of segments) {
    // Strip trailing rating like "Acme Corp 4.2" or "Acme Corp 4.2 ★"
    const cleaned = seg.replace(/\s+\d(?:\.\d)?\s*★?$/, '').trim();
    if (!cleaned || cleaned.length < 2) continue;
    if (NON_COMPANY_NOISE.test(cleaned)) continue;
    if (/^[\$₹€£]\s*\d/.test(cleaned) || /\bper\s+(year|month|hour|annum)\b/i.test(cleaned)) continue;
    return cleaned;
  }
  return null;
}

/**
 * Extracts individual job opportunities from an email's HTML and plain text.
 */
export function extractJobsFromEmail(
  subject: string,
  html: string,
  text: string
): ExtractedJob[] {
  const jobs: ExtractedJob[] = [];
  const seenUrls = new Set<string>();

  // 1. Find all anchor tags with hrefs
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1];
    const linkText = (match[2] || '').replace(/<[^>]+>/g, '').trim();

    if (!rawHref || !linkText || linkText.length < 3) continue;

    // Filter out unsubscribe, privacy, terms, settings links
    const lowerText = linkText.toLowerCase();
    if (
      lowerText.includes('unsubscribe') ||
      lowerText.includes('privacy') ||
      lowerText.includes('terms') ||
      lowerText.includes('manage preferences') ||
      lowerText.includes('help center') ||
      lowerText.includes('view in browser')
    ) {
      continue;
    }

    // Check if URL looks like a job link
    const lowerHref = rawHref.toLowerCase();
    const isJobLink =
      lowerHref.includes('/jobs/view/') ||
      lowerHref.includes('/job-listings-') ||
      lowerHref.includes('/job/') ||
      lowerHref.includes('/career') ||
      lowerHref.includes('indeed.com/rc/clk') ||
      lowerHref.includes('indeed.com/viewjob') ||
      lowerHref.includes('indeed.com/pagead/clk') ||
      lowerHref.includes('indeed.com/job') ||
      lowerHref.includes('greenhouse.io') ||
      lowerHref.includes('lever.co') ||
      lowerHref.includes('workday') ||
      lowerHref.includes('ashbyhq') ||
      (lowerText.includes('apply') || lowerText.includes('view job') || lowerText.includes('developer') || lowerText.includes('engineer'));

    if (!isJobLink) continue;

    const cleanUrl = unwrapTrackingUrl(rawHref);
    if (!cleanUrl.startsWith('http')) continue;
    if (seenUrls.has(cleanUrl)) continue;
    seenUrls.add(cleanUrl);

    const platform = detectPlatformFromUrl(cleanUrl);

    // Derive title and company
    let title = linkText;
    let companyName = 'Company';

    // Often link text is "Software Engineer at Acme Corp"
    const atMatch = linkText.match(/(.*?)\s+(?:at|@)\s+(.*)/i);
    if (atMatch && atMatch[1] && atMatch[2]) {
      title = atMatch[1].trim();
      companyName = atMatch[2].trim();
    } else {
      if (lowerText === 'view job' || lowerText === 'apply' || lowerText === 'apply now') {
        // Use subject as fallback title
        title = subject.replace(/^(jobs?|new jobs?|recommended jobs?|alert:?)\s*[-:]?\s*/i, '').slice(0, 100);
      }
      // Look at nearby HTML after </a> (crucial for Indeed, Naukri, and Glassdoor alerts)
      const nearbyCompany = extractCompanyFromNearbyHtml(html, linkRegex.lastIndex);
      if (nearbyCompany) {
        companyName = nearbyCompany;
      }
    }

    jobs.push({
      title: title.slice(0, 200),
      companyName: companyName.slice(0, 100),
      jobUrl: cleanUrl,
      platform,
      snippet: `${title} at ${companyName} (${platform})`,
    });
  }

  // Fallback: If no HTML links matched but plain text has direct URLs
  if (jobs.length === 0) {
    const rawUrlRegex = /(https?:\/\/[^\s<>"']+)/g;
    let urlMatch: RegExpExecArray | null;
    while ((urlMatch = rawUrlRegex.exec(text)) !== null) {
      const foundUrl = urlMatch[1];
      if (!foundUrl) continue;
      const cleanUrl = unwrapTrackingUrl(foundUrl);
      if (seenUrls.has(cleanUrl)) continue;

      const lower = cleanUrl.toLowerCase();
      if (
        lower.includes('/jobs/view/') ||
        lower.includes('/job-listings-') ||
        lower.includes('lever.co') ||
        lower.includes('greenhouse.io')
      ) {
        seenUrls.add(cleanUrl);
        const platform = detectPlatformFromUrl(cleanUrl);
        jobs.push({
          title: subject.replace(/^(jobs?|alert:?)\s*[-:]?\s*/i, '').slice(0, 100) || 'Job Opportunity',
          companyName: 'Company',
          jobUrl: cleanUrl,
          platform,
          snippet: subject,
        });
      }
    }
  }

  return jobs;
}

export interface ExtractedJobCandidateLink {
  url: string;
  text: string;
  context?: string;
}

export function extractCandidateLinksFromHtml(html: string): ExtractedJobCandidateLink[] {
  const links: ExtractedJobCandidateLink[] = [];
  const seen = new Set<string>();
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1];
    const linkText = (match[2] || '').replace(/<[^>]+>/g, '').trim();
    if (!rawHref || !linkText || linkText.length < 2) continue;

    const lowerText = linkText.toLowerCase();
    if (
      lowerText.includes('unsubscribe') ||
      lowerText.includes('privacy') ||
      lowerText.includes('terms') ||
      lowerText.includes('manage preferences') ||
      lowerText.includes('help center') ||
      lowerText.includes('view in browser')
    ) {
      continue;
    }

    const cleanUrl = unwrapTrackingUrl(rawHref);
    if (!cleanUrl.startsWith('http') || seen.has(cleanUrl)) continue;
    seen.add(cleanUrl);

    const rawContext = extractNearbyTextAfterAnchor(html, linkRegex.lastIndex, 180)
      .replace(/\s+/g, ' ')
      .trim();

    links.push({
      url: cleanUrl,
      text: linkText,
      ...(rawContext ? { context: rawContext } : {}),
    });
  }

  return links;
}

export function extractJobOpportunitiesHeuristic(
  subject: string,
  bodyText: string,
  fromHeader: string,
  bodyHtml?: string
): import('../../types/index.js').ExtractedJobOpportunity[] {
  const heuristicJobs = extractJobsFromEmail(subject, bodyHtml || '', bodyText);

  return heuristicJobs.map((j) => {
    const company = (j.companyName || '').trim();
    const isGenericCompany = !company || ['company', 'unknown', 'various', 'client', 'confidential'].includes(company.toLowerCase());
    const hasValidUrl = Boolean(j.jobUrl && j.jobUrl !== '#' && j.jobUrl.startsWith('http'));
    const isComplete = Boolean(!isGenericCompany && j.title && hasValidUrl);

    return {
      title: j.title || 'Job Opportunity',
      company: isGenericCompany ? 'Unknown Company' : company,
      url: j.jobUrl || '#',
      platform: j.platform || 'Email',
      location: j.location || null,
      salaryRange: j.salaryRange || null,
      descriptionSnippet: j.snippet || null,
      confidence: isGenericCompany ? 'low' : 'medium',
      isConfident: false, // Heuristic cannot guarantee confidence without AI verification
      isComplete,
      reasoning: isGenericCompany
        ? 'Company could not be accurately inferred from link text alone.'
        : 'Inferred via heuristic anchor text matching.',
    };
  });
}
