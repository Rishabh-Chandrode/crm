import type { ScrapeMessage } from './types';

function getText(el: Element | null): string {
  if (!el) return '';
  return ((el as HTMLElement).innerText ?? el.textContent ?? '').trim();
}

export function extractName(): { firstName: string; lastName: string } {
  const currentUrl = window.location.href;

  let nameEl: Element | null = document.querySelector(`a[href='${currentUrl}'] h2`);

  if (!nameEl) {
    const badge = document.querySelector('svg[aria-label^="View"][aria-label$="verifications"]');
    nameEl = badge?.parentElement?.querySelector('h2') ?? null;
  }

  if (!nameEl) {
    nameEl = document.querySelector('.pv-text-details__left-panel h1, .ph5 h1, h1.text-heading-xlarge');
  }

  if (!nameEl) {
    nameEl = document.querySelector('[componentkey*="profile.card"] h2');
  }

  const full = getText(nameEl);
  const parts = full.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? '';
  const lastName = parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
  return { firstName, lastName };
}

export function cleanCompanyName(name: string): string {
  return name
    .replace(
      /\b(private\s+limited|pvt\.?\s*ltd\.?|ltd\.?|limited|incorporated|inc\.?|corporation|corp\.?|llc|llp|gmbh|s\.?a\.?)\b\.?/gi,
      ''
    )
    .replace(/[,.\s]+$/, '')
    .trim();
}

export function extractCompany(): string {
  const experienceSection = getExperienceSection();

  if (experienceSection) {
    const firstEntry = experienceSection.querySelector(
      'div[componentkey^="entity-collection-item"], li'
    );

    const imgAlt = firstEntry?.querySelector('img[alt]')?.getAttribute('alt') ?? '';
    if (imgAlt && !imgAlt.toLowerCase().includes('profile')) {
      const namePart = imgAlt.split(' logo')[0] ?? '';
      return cleanCompanyName(namePart.trim());
    }

    const svgLabel = firstEntry?.querySelector('svg[aria-label]')?.getAttribute('aria-label') ?? '';
    if (svgLabel) {
      const namePart = svgLabel.split(' logo')[0] ?? '';
      return cleanCompanyName(namePart.trim());
    }

    // New LinkedIn SDUI: "Company · Employment Type" in a <p> element
    const pElements = Array.from(firstEntry?.querySelectorAll('p') ?? []);
    const companyP = pElements.find(p => getText(p).includes('·'));
    if (companyP) {
      const namePart = getText(companyP).split('·')[0] ?? '';
      const candidate = cleanCompanyName(namePart.trim());
      if (candidate) return candidate;
    }

    const hiddenSpans = Array.from(
      firstEntry?.querySelectorAll('span[aria-hidden="true"]') ?? []
    );
    if (hiddenSpans.length >= 2) {
      const namePart = getText(hiddenSpans[1] ?? null).split('·')[0] ?? '';
      const candidate = cleanCompanyName(namePart.trim());
      if (candidate) return candidate;
    } else if (hiddenSpans.length === 1) {
      const namePart = getText(hiddenSpans[0] ?? null).split('·')[0] ?? '';
      const candidate = cleanCompanyName(namePart.trim());
      if (candidate) return candidate;
    }
  }

  const headline = document.querySelector(
    '.pv-text-details__left-panel .text-body-medium, .ph5 .text-body-medium, .text-body-medium.break-words'
  );
  const headlineText = getText(headline);
  const atMatch = headlineText.match(/\bat\s+(.+)$/i);
  return cleanCompanyName(atMatch?.[1]?.trim() ?? '');
}

export function extractJobTitle(): string {
  const experienceSection = getExperienceSection();

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
    const pElements = Array.from(titleRoot?.querySelectorAll('p') ?? []);
    const titleP = pElements.find(p => {
      const text = getText(p);
      return text && !text.includes('·') && !/^\d/.test(text);
    });
    if (titleP) return getText(titleP);

    const hiddenSpans = Array.from(
      titleRoot?.querySelectorAll('span[aria-hidden="true"]') ?? []
    );

    // spans[0] is the job title for a single-role entry; skip if it looks like
    // a company name (contains '·') or a date/duration (starts with a digit)
    const candidate = getText(hiddenSpans[0] ?? null);
    if (candidate && !candidate.includes('·') && !/^\d/.test(candidate)) {
      return candidate;
    }
  }

  // Fallback: strip "at Company" from the profile headline tagline
  const headline = document.querySelector(
    '.pv-text-details__left-panel .text-body-medium, .ph5 .text-body-medium, .text-body-medium.break-words'
  );
  const text = getText(headline);
  return text.replace(/\s+at\s+.+$/i, '').trim();
}

export const EXPERIENCE_SELECTOR =
  '#experience, section[componentkey$="ExperienceTopLevelSection"], section[data-view-name="profile-card-experience"]';

export function getExperienceSection(): Element | null {
  const byId = document.querySelector('#experience');
  if (byId) {
    const section = byId.closest('section');
    if (section) return section;
  }
  return document.querySelector(EXPERIENCE_SELECTOR);
}

export function getScrollContainer(): Element {
  return (
    document.querySelector('div.scaffold-layout__main') ??
    document.querySelector('main') ??
    document.documentElement
  );
}

export async function waitForExperienceSection(timeoutMs = 5000): Promise<Element | null> {
  let existing = document.querySelector(EXPERIENCE_SELECTOR);
  if (existing) return existing;

  const container = getScrollContainer();
  let stepPx = Math.floor(container.clientHeight * 0.6);
  if (stepPx <= 0) stepPx = 500; // fallback if clientHeight is zero

  let lastScrollTop = container === document.documentElement 
    ? (window.scrollY || document.documentElement.scrollTop)
    : container.scrollTop;

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    existing = document.querySelector(EXPERIENCE_SELECTOR);
    if (existing) return existing;
    
    if (container === document.documentElement) {
      window.scrollBy({ top: stepPx, behavior: 'instant' });
    } else {
      container.scrollBy({ top: stepPx, behavior: 'instant' });
    }
    
    await new Promise((r) => setTimeout(r, 400));
    
    const newScrollTop = container === document.documentElement 
      ? (window.scrollY || document.documentElement.scrollTop)
      : container.scrollTop;
      
    if (newScrollTop === lastScrollTop) {
      // Reached bottom
      break;
    }
    lastScrollTop = newScrollTop;
  }

  return document.querySelector(EXPERIENCE_SELECTOR);
}

export function extractEmail(): string {
  // 1. Look for mailto links on the page
  const mailto = document.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
  if (mailto) {
    const raw = mailto.getAttribute('href') ?? '';
    const email = raw.replace(/^mailto:/i, '').split('?')[0]?.trim();
    if (email && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      return email;
    }
  }

  // 2. Look in contact info section or overlay if present
  const contactSection = document.querySelector('.pv-contact-info, section.ci-email, #contact-info');
  if (contactSection) {
    const text = getText(contactSection);
    const match = text.match(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/);
    if (match?.[0]) return match[0];
  }

  // 3. Look in the About / Summary section
  const aboutSection = document.querySelector('#about, section[componentkey$="AboutTopLevelSection"]');
  if (aboutSection) {
    const text = getText(aboutSection);
    const match = text.match(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/);
    if (match?.[0]) return match[0];
  }

  // 4. Look across the top card header / headline
  const topCard = document.querySelector('.pv-top-card, .ph5, .pv-text-details__left-panel');
  if (topCard) {
    const text = getText(topCard);
    const match = text.match(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/);
    if (match?.[0]) return match[0];
  }

  return '';
}

export async function scrape(): Promise<void> {
  await waitForExperienceSection();
  // Give LinkedIn a moment to render content inside the section
  await new Promise((r) => setTimeout(r, 500));

  const { firstName, lastName } = extractName();
  const company = extractCompany();
  const jobTitle = extractJobTitle();
  const email = extractEmail();
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
    email: email || undefined,
  };

  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage(message);
  }
}

export function initContentScript(): void {
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message: { type?: string }) => {
      if (message?.type === 'SCRAPE_PAGE') {
        void scrape();
      }
    });
  }
}

initContentScript();
