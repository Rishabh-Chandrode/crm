import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  cleanCompanyName,
  extractName,
  extractCompany,
  extractJobTitle,
  extractGender,
  extractEmail,
  initContentScript,
  scrape,
  EXPERIENCE_SELECTOR,
} from '../contentScript';

describe('LinkedIn Content Script Scraper', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('cleanCompanyName', () => {
    it('strips legal entity suffixes properly', () => {
      expect(cleanCompanyName('Acme Inc.')).toBe('Acme');
      expect(cleanCompanyName('Stark Industries LLC')).toBe('Stark Industries');
      expect(cleanCompanyName('Wayne Enterprises Pvt. Ltd.')).toBe('Wayne Enterprises');
      expect(cleanCompanyName('Cyberdyne Systems Corporation')).toBe('Cyberdyne Systems');
      expect(cleanCompanyName('Google GmbH')).toBe('Google');
    });

    it('preserves clean names', () => {
      expect(cleanCompanyName('OpenAI')).toBe('OpenAI');
      expect(cleanCompanyName('Stripe')).toBe('Stripe');
    });
  });

  describe('extractName', () => {
    it('extracts name from h1 in pv-text-details', () => {
      document.body.innerHTML = `
        <div class="pv-text-details__left-panel">
          <h1 class="text-heading-xlarge">Jane Doe</h1>
        </div>
      `;
      const { firstName, lastName } = extractName();
      expect(firstName).toBe('Jane');
      expect(lastName).toBe('Doe');
    });

    it('handles single word names or multiple parts', () => {
      document.body.innerHTML = `
        <div class="pv-text-details__left-panel">
          <h1 class="text-heading-xlarge">Alice Mary Smith</h1>
        </div>
      `;
      const { firstName, lastName } = extractName();
      expect(firstName).toBe('Alice');
      expect(lastName).toBe('Smith');
    });
  });

  describe('extractCompany', () => {
    it('extracts company name from experience section logo alt', () => {
      document.body.innerHTML = `
        <section id="experience">
          <div componentkey="entity-collection-item-1">
            <img alt="Microsoft logo" src="logo.png" />
          </div>
        </section>
      `;
      expect(extractCompany()).toBe('Microsoft');
    });

    it('falls back to headline "at Company" format when experience is empty', () => {
      document.body.innerHTML = `
        <div class="pv-text-details__left-panel">
          <div class="text-body-medium">Senior Architect at Amazon Web Services Inc.</div>
        </div>
      `;
      expect(extractCompany()).toBe('Amazon Web Services');
    });
  });

  describe('extractJobTitle', () => {
    it('extracts job title from experience section entry', () => {
      document.body.innerHTML = `
        <section id="experience">
          <div componentkey="entity-collection-item-1">
            <p>Staff Software Engineer</p>
            <p>Google · Full-time</p>
          </div>
        </section>
      `;
      expect(extractJobTitle()).toBe('Staff Software Engineer');
    });

    it('falls back to headline if experience section not found', () => {
      document.body.innerHTML = `
        <div class="pv-text-details__left-panel">
          <div class="text-body-medium">Staff Software Engineer at Google</div>
        </div>
      `;
      expect(extractJobTitle()).toBe('Staff Software Engineer');
    });
  });

  describe('extractGender', () => {
    it('extracts male pronouns from top card or pronoun badges', () => {
      document.body.innerHTML = `
        <div class="pv-text-details__left-panel">
          <h1 class="text-heading-xlarge">John Doe</h1>
          <span>(He/Him)</span>
        </div>
      `;
      expect(extractGender()).toBe('male');
    });

    it('extracts female pronouns from top card', () => {
      document.body.innerHTML = `
        <div class="pv-text-details__left-panel">
          <h1 class="text-heading-xlarge">Jane Doe</h1>
          <span>(She / Her)</span>
        </div>
      `;
      expect(extractGender()).toBe('female');
    });

    it('extracts neutral pronouns', () => {
      document.body.innerHTML = `
        <div class="pv-text-details__left-panel">
          <h1 class="text-heading-xlarge">Sam Doe</h1>
          <span>(They/Them)</span>
        </div>
      `;
      expect(extractGender()).toBe('other');
    });

    it('returns empty string when no pronouns are present', () => {
      document.body.innerHTML = `
        <div class="pv-text-details__left-panel">
          <h1 class="text-heading-xlarge">Sam Doe</h1>
          <div class="text-body-medium">VP Engineering at Apple</div>
        </div>
      `;
      expect(extractGender()).toBe('');
    });
  });

  describe('extractEmail', () => {
    it('extracts email from mailto link', () => {
      document.body.innerHTML = `
        <div>
          <a href="mailto:alex@example.com?subject=Hello">Email Me</a>
        </div>
      `;
      expect(extractEmail()).toBe('alex@example.com');
    });

    it('extracts email from contact section text', () => {
      document.body.innerHTML = `
        <div class="pv-contact-info">
          <span>Contact at contact.user@domain.org for queries</span>
        </div>
      `;
      expect(extractEmail()).toBe('contact.user@domain.org');
    });
  });

  describe('Automatic Execution Guard & Message Listener', () => {
    it('registers message listener without auto-scraping or scrolling on init', () => {
      const addListenerSpy = vi.fn();
      const sendMessageSpy = vi.fn();

      (globalThis as unknown as { chrome: unknown }).chrome = {
        runtime: {
          onMessage: {
            addListener: addListenerSpy,
          },
          sendMessage: sendMessageSpy,
        },
      };

      // Calling initContentScript registers the listener
      initContentScript();

      expect(addListenerSpy).toHaveBeenCalled();
      // Crucial: sendMessage or scrape must NOT be called on load!
      expect(sendMessageSpy).not.toHaveBeenCalled();

      // Find registered listener and send a non-matching message
      const registeredHandler = addListenerSpy.mock.calls[0]![0] as (msg: { type: string }) => void;
      registeredHandler({ type: 'SOME_OTHER_EVENT' });
      expect(sendMessageSpy).not.toHaveBeenCalled();
    });
  });
});
