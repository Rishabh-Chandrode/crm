import type { ScrapeMessage } from './types';

function getText(el: Element | null): string {
  if (!el) return '';
  return ((el as HTMLElement).innerText ?? el.textContent ?? '').trim();
}

function isDateOrDuration(text: string): boolean {
  if (!text) return false;
  const dateMonthRegex = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4})\b/i;
  const durationRegex = /\b\d+\s*(mo|mos|yr|yrs|year|years|month|months)\b/i;
  const presentRegex = /\b(present|current)\b/i;
  return (
    (dateMonthRegex.test(text) && (presentRegex.test(text) || /\d{4}/.test(text) || durationRegex.test(text))) ||
    /^\d+\s*(mo|mos|yr|yrs|year|years|month|months)/i.test(text) ||
    /·\s*\d+\s*(mo|mos|yr|yrs)/i.test(text) ||
    /\b(present|current)\s*·/i.test(text)
  );
}

function isLocation(text: string): boolean {
  if (!text) return false;
  return (
    (/\b(on-site|hybrid|remote)\b/i.test(text) && (text.includes('·') || /,\s*[A-Z]/.test(text))) ||
    /^[A-Za-z\s]+,\s*[A-Za-z\s]+,\s*[A-Za-z\s]+(\s*·.*)?$/.test(text)
  );
}

function isSkillsOrDescription(text: string): boolean {
  if (!text) return false;
  return /\b\+\d+\s+skills?\b/i.test(text) || (/\bskills?\b/i.test(text) && text.includes('+')) || text.length > 150;
}

export function extractName(): { firstName: string; lastName: string } {
  const currentUrl = window.location.href;

  let nameEl: Element | null = document.querySelector(`a[href='${currentUrl}'] h2`);

  if (!nameEl) {
    const badge = document.querySelector('svg[aria-label^="View"][aria-label$="verifications"]');
    nameEl = badge?.parentElement?.querySelector('h2') ?? null;
  }

  if (!nameEl) {
    nameEl = document.querySelector('.pv-text-details__left-panel h1, .ph5 h1, h1.text-heading-xlarge, [data-testid="profile-name"]');
  }

  if (!nameEl) {
    nameEl = document.querySelector('[componentkey*="profile.card"] h2, [componentkey*="ProfileCard"] h2');
  }

  let full = getText(nameEl);

  if (!full && typeof document !== 'undefined' && document.title) {
    const titleMatch = document.title.match(/^([^–—\-|]+)/);
    if (titleMatch?.[1] && !titleMatch[1].toLowerCase().includes('linkedin')) {
      full = titleMatch[1].trim();
    }
  }

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

export const EXPERIENCE_SELECTOR = [
  '#experience',
  '[data-testid*="ExperienceTopLevelSection"]',
  '[data-testid*="profile_Experience"]',
  '[data-testid*="experience"]',
  '[componentkey*="ExperienceTopLevelSection"]',
  '[componentkey*="ProfileNullStateCardAnchor_Experience"]',
  '[data-view-name="profile-card-experience"]',
  'section[id="experience"]',
  'div[id="experience"]',
].join(', ');

export function getExperienceSection(): Element | null {
  // 1. Check ID #experience
  const byId = document.querySelector('#experience');
  if (byId) {
    const section = byId.closest('section, div.artdeco-card, [data-component-type="LazyColumn"]') ?? byId.parentElement ?? byId;
    if (section) return section;
  }

  // 2. Semantic Visible Text Match (Zero dynamic class/ID dependency)
  const headings = Array.from(document.querySelectorAll('h2, h3'));
  const expHeading = headings.find(h => {
    const text = getText(h).toLowerCase();
    const key = (h.getAttribute('componentkey') || h.getAttribute('data-testid') || '').toLowerCase();
    return text === 'experience' || key.includes('experience');
  });
  if (expHeading) {
    const container =
      expHeading.closest('section, div.artdeco-card, [data-component-type="LazyColumn"]') ??
      expHeading.parentElement?.parentElement ??
      expHeading.parentElement ??
      expHeading;
    if (container) return container;
  }

  // 3. Fallback to CSS selectors
  const bySelector = document.querySelector(EXPERIENCE_SELECTOR);
  if (bySelector) {
    if (bySelector.tagName === 'H2' || bySelector.tagName === 'H3' || bySelector.tagName === 'A' || bySelector.id === 'experience') {
      return (
        bySelector.closest('section, div.artdeco-card, [data-component-type="LazyColumn"]') ??
        bySelector.parentElement?.parentElement ??
        bySelector.parentElement ??
        bySelector
      );
    }
    return bySelector;
  }

  return null;
}

export function extractCompany(): string {
  const experienceSection = getExperienceSection();

  if (experienceSection) {
    const firstEntry = experienceSection.querySelector(
      'div[componentkey^="entity-collection-item"], li.artdeco-list__item, li.pvs-list__paged-list-item, li'
    ) ?? experienceSection;

    // 1. Accessibility Logo Alt / Aria-label (Universal & Class-Free)
    const imgAlt = firstEntry.querySelector('img[alt]')?.getAttribute('alt') ?? '';
    if (imgAlt && !imgAlt.toLowerCase().includes('profile')) {
      const namePart = imgAlt.replace(/\s+logo\b.*$/i, '').replace(/^logo\s+of\s+/i, '').trim();
      const candidate = cleanCompanyName(namePart);
      if (candidate) return candidate;
    }

    const svgLabel = firstEntry.querySelector('svg[aria-label]')?.getAttribute('aria-label') ?? '';
    if (svgLabel && !svgLabel.toLowerCase().includes('profile')) {
      const namePart = svgLabel.replace(/\s+logo\b.*$/i, '').replace(/^logo\s+of\s+/i, '').trim();
      const candidate = cleanCompanyName(namePart);
      if (candidate) return candidate;
    }

    // 2. Company Link (href*="/company/")
    const companyLink = firstEntry.querySelector('a[href*="/company/"]');
    if (companyLink) {
      const pList = Array.from(companyLink.querySelectorAll('p'));
      const companyP = pList.find(p => {
        const text = getText(p);
        return text.includes('·') && !isDateOrDuration(text) && !isLocation(text) && !isSkillsOrDescription(text);
      });
      if (companyP) {
        const namePart = getText(companyP).split('·')[0] ?? '';
        const candidate = cleanCompanyName(namePart.trim());
        if (candidate) return candidate;
      }
    }

    // 3. Content Heuristic: <p> element with "Company · Employment Type"
    const pElements = Array.from(firstEntry.querySelectorAll('p'));
    const companyWithDot = pElements.find(p => {
      const text = getText(p);
      return text.includes('·') && !isDateOrDuration(text) && !isLocation(text) && !isSkillsOrDescription(text);
    });
    if (companyWithDot) {
      const namePart = getText(companyWithDot).split('·')[0] ?? '';
      const candidate = cleanCompanyName(namePart.trim());
      if (candidate) return candidate;
    }

    // 4. Content Heuristic: Any non-title, non-date, non-location, non-skill paragraph
    const jobTitle = extractJobTitle();
    for (const p of pElements) {
      const text = getText(p);
      if (!text || text === jobTitle || isDateOrDuration(text) || isLocation(text) || isSkillsOrDescription(text)) {
        continue;
      }
      const namePart = text.split('·')[0] ?? '';
      const candidate = cleanCompanyName(namePart.trim());
      if (candidate) return candidate;
    }

    // 5. Classic LinkedIn Hidden Spans (aria-hidden="true")
    const hiddenSpans = Array.from(
      firstEntry.querySelectorAll('span[aria-hidden="true"]')
    );
    for (const span of hiddenSpans) {
      const text = getText(span);
      if (!text || text === jobTitle || isDateOrDuration(text) || isLocation(text) || isSkillsOrDescription(text)) {
        continue;
      }
      const namePart = text.split('·')[0] ?? '';
      const candidate = cleanCompanyName(namePart.trim());
      if (candidate) return candidate;
    }
  }

  // 6. Fallback: Headline parsing (e.g. "... at Urban Company")
  const headline = document.querySelector(
    '.pv-text-details__left-panel .text-body-medium, .ph5 .text-body-medium, .text-body-medium.break-words, [data-testid="profile-headline"]'
  );
  const headlineText = getText(headline);
  const atMatch = headlineText.match(/\bat\s+([^·|,\n]+)/i);
  if (atMatch?.[1]) {
    const candidate = cleanCompanyName(atMatch[1].trim());
    if (candidate) return candidate;
  }

  // 7. Fallback: document.title format ("Name - Job Title - Company | LinkedIn")
  if (typeof document !== 'undefined' && document.title && document.title.includes('LinkedIn')) {
    const titleParts = document.title
      .replace(/\s*\|\s*LinkedIn.*$/i, '')
      .split(/\s*[-–—]\s*/);
    if (titleParts.length >= 3) {
      const candidate = cleanCompanyName(titleParts[2]!.trim());
      if (candidate) return candidate;
    }
  }

  return '';
}

export function extractJobTitle(): string {
  const experienceSection = getExperienceSection();

  if (experienceSection) {
    const firstEntry = experienceSection.querySelector(
      'div[componentkey^="entity-collection-item"], li.artdeco-list__item, li.pvs-list__paged-list-item, li'
    ) ?? experienceSection;

    const firstRoleLi = firstEntry.querySelector('ul > li');
    const titleRoot = firstRoleLi ?? firstEntry;

    // 1. First <p> without "·" that isn't a date, location, or skills
    const pElements = Array.from(titleRoot.querySelectorAll('p'));
    const titleP = pElements.find(p => {
      const text = getText(p);
      return text && !text.includes('·') && !isDateOrDuration(text) && !isLocation(text) && !isSkillsOrDescription(text);
    });
    if (titleP) return getText(titleP);

    // 2. Hidden spans
    const hiddenSpans = Array.from(
      titleRoot.querySelectorAll('span[aria-hidden="true"]')
    );
    const candidate = hiddenSpans.map(s => getText(s)).find(text => {
      return text && !text.includes('·') && !isDateOrDuration(text) && !isLocation(text) && !isSkillsOrDescription(text);
    });
    if (candidate) return candidate;
  }

  // Fallback 1: Headline tagline
  const headline = document.querySelector(
    '.pv-text-details__left-panel .text-body-medium, .ph5 .text-body-medium, .text-body-medium.break-words, [data-testid="profile-headline"]'
  );
  const headlineText = getText(headline);
  if (headlineText) {
    const title = headlineText.replace(/\s+at\s+.+$/i, '').trim();
    if (title) return title;
  }

  // Fallback 2: document.title format ("Name - Job Title - Company | LinkedIn")
  if (typeof document !== 'undefined' && document.title && document.title.includes('LinkedIn')) {
    const titleParts = document.title
      .replace(/\s*\|\s*LinkedIn.*$/i, '')
      .split(/\s*[-–—]\s*/);
    if (titleParts.length >= 2) {
      return titleParts[1]!.trim();
    }
  }

  return '';
}

export function getScrollContainer(): Element {
  return (
    document.querySelector('div.scaffold-layout__main') ??
    document.querySelector('main') ??
    document.documentElement
  );
}

export async function waitForExperienceSection(timeoutMs = 5000): Promise<Element | null> {
  let existing = getExperienceSection();
  if (existing) return existing;

  const container = getScrollContainer();
  let stepPx = Math.floor(container.clientHeight * 0.6);
  if (stepPx <= 0) stepPx = 500; // fallback if clientHeight is zero

  let lastScrollTop = container === document.documentElement 
    ? (window.scrollY || document.documentElement.scrollTop)
    : container.scrollTop;

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    existing = getExperienceSection();
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

  return getExperienceSection();
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

export function extractGender(): string {
  // 1. Look for explicit pronoun elements on LinkedIn profile top card
  const pronounCandidates = Array.from(document.querySelectorAll(
    '.pv-text-details__left-panel span, .ph5 span, .pv-top-card--list-bullet li, [data-field="pronouns"]'
  ));
  for (const el of pronounCandidates) {
    const text = getText(el);
    if (/\b(he\s*\/\s*him|he\s*\/\s*his|he\/they)\b/i.test(text)) return 'male';
    if (/\b(she\s*\/\s*her|she\s*\/\s*hers|she\/they)\b/i.test(text)) return 'female';
    if (/\b(they\s*\/\s*them|they\s*\/\s*theirs)\b/i.test(text)) return 'other';
  }

  // 2. Scan top card text
  const topCard = document.querySelector('.pv-top-card, .ph5, .pv-text-details__left-panel');
  if (topCard) {
    const text = getText(topCard);
    if (/\b(he\s*\/\s*him|he\s*\/\s*his|he\/they)\b/i.test(text)) return 'male';
    if (/\b(she\s*\/\s*her|she\s*\/\s*hers|she\/they)\b/i.test(text)) return 'female';
    if (/\b(they\s*\/\s*them|they\s*\/\s*theirs)\b/i.test(text)) return 'other';
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
  const gender = extractGender();
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
    gender: gender || undefined,
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
