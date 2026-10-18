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

    // Clean tracking query params from common platforms
    const parsed = new URL(url);
    const trackingParams = [
      'trk', 'refId', 'trackingId', 'midToken', 'trkEmail', 'otpToken', 'utm_source',
      'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'source',
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
    } else if (lowerText === 'view job' || lowerText === 'apply' || lowerText === 'apply now') {
      // Use subject as fallback title
      title = subject.replace(/^(jobs?|new jobs?|recommended jobs?|alert:?)\s*[-:]?\s*/i, '').slice(0, 100);
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

    links.push({ url: cleanUrl, text: linkText });
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
