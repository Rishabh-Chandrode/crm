import { describe, it, expect } from 'vitest';
import type { UserProfile } from '../types';

function highlightMatch(text: string, query: string): string {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.replace(regex, '<mark class="search-highlight">$1</mark>');
}

function filterProfileFields(
  profile: Partial<UserProfile>,
  fields: Array<{ key: keyof UserProfile; label: string }>,
  query: string
) {
  if (!query) return fields;
  const q = query.toLowerCase();
  return fields.filter(({ key, label }) => {
    const val = String(profile[key] ?? '');
    return label.toLowerCase().includes(q) || val.toLowerCase().includes(q);
  });
}

describe('Extension Profile Search & Copy Filter', () => {
  const mockProfile: Partial<UserProfile> = {
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane.doe@example.com',
    phone: '+1 555-0199',
    job_title: 'Staff Software Engineer',
    current_company: 'Acme Technologies',
    notice_period: '2 weeks',
    expected_ctc: '$180,000',
    skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
  };

  const sampleFields: Array<{ key: keyof UserProfile; label: string }> = [
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'job_title', label: 'Job Title' },
    { key: 'current_company', label: 'Company' },
    { key: 'notice_period', label: 'Notice Period' },
    { key: 'expected_ctc', label: 'Expected CTC' },
  ];

  it('filters fields by label keyword match (e.g. "email")', () => {
    const matches = filterProfileFields(mockProfile, sampleFields, 'email');
    expect(matches.length).toBe(1);
    expect(matches[0]!.key).toBe('email');
  });

  it('filters fields by value match (e.g. "Acme")', () => {
    const matches = filterProfileFields(mockProfile, sampleFields, 'acme');
    expect(matches.length).toBe(1);
    expect(matches[0]!.key).toBe('current_company');
  });

  it('filters fields by partial salary/ctc search', () => {
    const matches = filterProfileFields(mockProfile, sampleFields, '180');
    expect(matches.length).toBe(1);
    expect(matches[0]!.key).toBe('expected_ctc');
  });

  it('highlights matched substrings in label or value', () => {
    const highlighted = highlightMatch('jane.doe@example.com', 'doe');
    expect(highlighted).toBe('jane.<mark class="search-highlight">doe</mark>@example.com');
  });

  it('returns all fields when query is empty', () => {
    const matches = filterProfileFields(mockProfile, sampleFields, '');
    expect(matches.length).toBe(sampleFields.length);
  });
});
