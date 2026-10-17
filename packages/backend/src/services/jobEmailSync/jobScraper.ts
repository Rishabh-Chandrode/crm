export interface ScrapedJobDetails {
  description: string;
  location?: string;
  salaryRange?: string;
}

export async function scrapeJobDetails(jobUrl: string, fallbackSnippet?: string): Promise<ScrapedJobDetails> {
  const fallback = {
    description: fallbackSnippet || 'Job description retrieved from email notification.',
  };

  try {
    const parsed = new URL(jobUrl);

    // 1. LinkedIn Public Guest API
    if (parsed.hostname.includes('linkedin.com')) {
      const idMatch = parsed.pathname.match(/\/jobs\/view\/(\d+)/);
      if (idMatch && idMatch[1]) {
        const jobId = idMatch[1];
        const guestUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        try {
          const res = await fetch(guestUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: controller.signal,
          });

          if (res.ok) {
            const html = await res.text();
            // Extract description container
            const descMatch = html.match(/<div class="show-more-less-html__markup[^>]*>(.*?)<\/div>/s) ||
                              html.match(/<section class="description"[^>]*>(.*?)<\/section>/s);
            if (descMatch && descMatch[1]) {
              const cleanText = descMatch[1]
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>/gi, '\n\n')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

              if (cleanText.length > 50) {
                return { description: cleanText };
              }
            }
          }
        } finally {
          clearTimeout(timeout);
        }
      }
    }

    // 2. Generic Web Fetch
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(jobUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: controller.signal,
      });

      if (res.ok) {
        const html = await res.text();
        // Remove scripts and styles
        const withoutScripts = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
                                   .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');

        // Match main article/content or body
        const mainMatch = withoutScripts.match(/<(?:main|article)[^>]*>(.*?)<\/(?:main|article)>/is) ||
                          withoutScripts.match(/<body[^>]*>(.*?)<\/body>/is);

        const content = mainMatch ? mainMatch[1] : withoutScripts;
        const clean = (content || '')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (clean.length > 100) {
          return { description: clean.slice(0, 5000) };
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    // Graceful fallback to snippet on network or bot-block errors
  }

  return fallback;
}
