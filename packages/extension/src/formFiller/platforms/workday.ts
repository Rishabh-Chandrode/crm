import type { SelectorMap } from '../types';

// Workday ATS: *.myworkdayjobs.com / *.workday.com
// Workday renders in custom elements — generic label detection works best here.
// These selectors cover the most stable patterns.
export const SELECTOR_MAP: SelectorMap = {
  first_name:   'input[data-automation-id="legalNameSection_firstName"]',
  last_name:    'input[data-automation-id="legalNameSection_lastName"]',
  email:        'input[data-automation-id="email"]',
  phone:              'input[data-automation-id="phone-number"]',
  phone_country_code: 'select[data-automation-id="countryPhoneCode"], select[data-automation-id="phone-device-type"] ~ select',
  city:         'input[data-automation-id="addressSection_city"]',
  state:        'select[data-automation-id="addressSection_countryRegion"]',
  country:      'select[data-automation-id="addressSection_country"]',
  linkedin_url: 'input[data-automation-id*="linkedin"]',
  website:      'input[data-automation-id*="website"], input[data-automation-id*="portfolio"]',
};
