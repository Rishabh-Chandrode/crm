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

    // Normalize LinkedIn /comm/ to standard public /jobs/view/
    if (parsed.hostname.includes('linkedin.com') && parsed.pathname.includes('/comm/jobs/view/')) {
      parsed.pathname = parsed.pathname.replace('/comm/jobs/view/', '/jobs/view/');
    }

    // Remove trailing slash if path is longer than root
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    return trimmed;
  }
}
