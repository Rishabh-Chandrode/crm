import type { SelectorMap } from '../types';

// Lever ATS: jobs.lever.co
// Selectors derived from live Lever application form HTML (data-qa attributes are stable).
export const SELECTOR_MAP: SelectorMap = {
  full_name:       'input[data-qa="name-input"], input[name="name"]',
  email:           'input[data-qa="email-input"], input[name="email"]',
  phone:              'input[data-qa="phone-input"], input[name="phone"]',
  phone_country_code: 'select[name="phone_country_code"], select[data-qa="phone-country-code"]',
  current_company: 'input[data-qa="org-input"], input[name="org"]',
  // location is a single free-text autocomplete on Lever (city, state, country combined)
  location:        'input.location-input, input[data-qa="location-input"], input[name="location"]',
  linkedin_url:    'input[name="urls[LinkedIn]"], input[name*="linkedin"]',
  github_url:      'input[name="urls[GitHub]"], input[name*="github"]',
  website:         'input[name="urls[Portfolio]"], input[name*="website"], input[name*="portfolio"]',
};
