import type { ScrapeMessage } from './types';

function extractName(): { firstName: string; lastName: string } {
  const currentUrl = window.location.href;

  let nameEl: Element | null = document.querySelector(`a[href='${currentUrl}'] h2`);

  if (!nameEl) {
    const badge = document.querySelector('svg[aria-label^="View"][aria-label$="verifications"]');
    nameEl = badge?.parentElement?.querySelector('h2') ?? null;
  }

  if (!nameEl) {
    nameEl = document.querySelector('.pv-text-details__left-panel h1, .ph5 h1');
  }

  if (!nameEl) {
    nameEl = document.querySelector('[componentkey*="profile.card"] h2');
  }

  const full = (nameEl as HTMLElement | null)?.innerText.trim() ?? '';
  const parts = full.split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName = parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
  return { firstName, lastName };
}

function cleanCompanyName(name: string): string {
  return name
    .replace(
      /\b(private\s+limited|pvt\.?\s*ltd\.?|ltd\.?|limited|incorporated|inc\.?|corporation|corp\.?|llc|llp|gmbh|s\.?a\.?)\b\.?/gi,
      ''
    )
    .replace(/[,.\s]+$/, '')
    .trim();
}

function extractCompany(): string {
  const experienceSection = document.querySelector(
    'section[id="experience"], section[componentkey$="ExperienceTopLevelSection"]'
  );

  if (experienceSection) {
    const firstEntry = experienceSection.querySelector(
      'div[componentkey^="entity-collection-item"], li'
    );

    const imgAlt = firstEntry?.querySelector('img[alt]')?.getAttribute('alt') ?? '';
    if (imgAlt && !imgAlt.toLowerCase().includes('profile')) {
      return cleanCompanyName(imgAlt.split(' logo')[0].trim());
    }

    const svgLabel = firstEntry?.querySelector('svg[aria-label]')?.getAttribute('aria-label') ?? '';
    if (svgLabel) {
      return cleanCompanyName(svgLabel.split(' logo')[0].trim());
    }

    // New LinkedIn SDUI: "Company · Employment Type" in a <p> element
    const pElements = Array.from(firstEntry?.querySelectorAll('p') ?? []) as HTMLElement[];
    const companyP = pElements.find(p => p.innerText?.includes('·'));
    if (companyP) {
      const candidate = cleanCompanyName(companyP.innerText.split('·')[0].trim());
      if (candidate) return candidate;
    }

    const hiddenSpans = Array.from(
      firstEntry?.querySelectorAll('span[aria-hidden="true"]') ?? []
    ) as HTMLElement[];
    if (hiddenSpans.length >= 2) {
      const candidate = cleanCompanyName(hiddenSpans[1]!.innerText?.split('·')[0].trim() ?? '');
      if (candidate) return candidate;
    } else if (hiddenSpans.length === 1) {
      const candidate = cleanCompanyName(hiddenSpans[0]!.innerText?.split('·')[0].trim() ?? '');
      if (candidate) return candidate;
    }
  }

  const headline = document.querySelector(
    '.pv-text-details__left-panel .text-body-medium, .ph5 .text-body-medium'
  );
  const headlineText = (headline as HTMLElement | null)?.innerText ?? '';
  const atMatch = headlineText.match(/\bat\s+(.+)$/i);
  return cleanCompanyName(atMatch?.[1]?.trim() ?? '');
}

function extractJobTitle(): string {
  const experienceSection = document.querySelector(
    'section[id="experience"], section[componentkey$="ExperienceTopLevelSection"]'
  );

  if (experienceSection) {
    const firstEntry = experienceSection.querySelector(
      'div[componentkey^="entity-collection-item"], li'
    );

    // Grouped entries (multiple roles under one company) nest individual roles in <ul><li>.
    // In that case the top-level <p> is the company name, so scope the title search to the
    // first <li> to avoid mistaking the company name for a job title.
    const firstRoleLi = firstEntry?.querySelector('ul > li');
    const titleRoot = firstRoleLi ?? firstEntry;

    // New LinkedIn SDUI: job title is in the first <p> that has no "·" and isn't a date
    const pElements = Array.from(titleRoot?.querySelectorAll('p') ?? []) as HTMLElement[];
    const titleP = pElements.find(p => {
      const text = p.innerText?.trim() ?? '';
      return text && !text.includes('·') && !/^\d/.test(text);
    });
    if (titleP) return titleP.innerText.trim();

    const hiddenSpans = Array.from(
      titleRoot?.querySelectorAll('span[aria-hidden="true"]') ?? []
    ) as HTMLElement[];

    // spans[0] is the job title for a single-role entry; skip if it looks like
    // a company name (contains '·') or a date/duration (starts with a digit)
    const candidate = hiddenSpans[0]?.innerText?.trim() ?? '';
    if (candidate && !candidate.includes('·') && !/^\d/.test(candidate)) {
      return candidate;
    }
  }

  // Fallback: strip "at Company" from the profile headline tagline
  const headline = document.querySelector(
    '.pv-text-details__left-panel .text-body-medium, .ph5 .text-body-medium'
  );
  const text = (headline as HTMLElement | null)?.innerText.trim() ?? '';
  return text.replace(/\s+at\s+.+$/i, '').trim();
}

const EXPERIENCE_SELECTOR =
  'section[id="experience"], section[componentkey$="ExperienceTopLevelSection"]';

function getScrollContainer(): Element {
  return (
    document.querySelector('div.scaffold-layout__main') ??
    document.querySelector('main') ??
    document.documentElement
  );
}

async function waitForExperienceSection(timeoutMs = 10000): Promise<Element | null> {
  const existing = document.querySelector(EXPERIENCE_SELECTOR);
  if (existing) return existing;

  const container = getScrollContainer();
  const stepPx = Math.floor(container.clientHeight * 0.6);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const el = document.querySelector(EXPERIENCE_SELECTOR);
    if (el) return el;
    container.scrollBy({ top: stepPx, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 400));
  }

  return document.querySelector(EXPERIENCE_SELECTOR);
}

async function scrape(): Promise<void> {
  await waitForExperienceSection();
  // Give LinkedIn a moment to render content inside the section
  await new Promise((r) => setTimeout(r, 500));

  const { firstName, lastName } = extractName();
  const company = extractCompany();
  const jobTitle = extractJobTitle();
  const linkedinUrl = window.location.href.includes('linkedin.com/in/')
    ? window.location.href.split('?')[0] ?? ''
    : '';

  const message: ScrapeMessage = {
    action: 'scraped',
    firstName,
    lastName,
    company,
    jobTitle,
    linkedinUrl,
  };

  chrome.runtime.sendMessage(message);
}

void scrape();
