import { describe, it, expect } from 'vitest';
import {
  inferGenderFromPronouns,
  inferGenderFromName,
  inferProspectGender,
} from '../services/genderInference.js';

describe('genderInference service', () => {
  describe('inferGenderFromPronouns', () => {
    it('detects male pronouns correctly', () => {
      expect(inferGenderFromPronouns('He/Him')).toBe('male');
      expect(inferGenderFromPronouns('(he / him)')).toBe('male');
      expect(inferGenderFromPronouns('Software Engineer | he/him/his')).toBe('male');
      expect(inferGenderFromPronouns('he/they')).toBe('male');
    });

    it('detects female pronouns correctly', () => {
      expect(inferGenderFromPronouns('She/Her')).toBe('female');
      expect(inferGenderFromPronouns('(she / her)')).toBe('female');
      expect(inferGenderFromPronouns('Senior VP | she/her/hers')).toBe('female');
      expect(inferGenderFromPronouns('she/they')).toBe('female');
    });

    it('detects neutral/non-binary pronouns correctly', () => {
      expect(inferGenderFromPronouns('They/Them')).toBe('other');
      expect(inferGenderFromPronouns('(they / them)')).toBe('other');
      expect(inferGenderFromPronouns('ze/zir')).toBe('other');
    });

    it('returns null when no pronouns exist', () => {
      expect(inferGenderFromPronouns(null)).toBeNull();
      expect(inferGenderFromPronouns('')).toBeNull();
      expect(inferGenderFromPronouns('Senior Engineer at Google')).toBeNull();
    });
  });

  describe('inferGenderFromName', () => {
    it('correctly classifies common male first names', () => {
      expect(inferGenderFromName('David')).toBe('male');
      expect(inferGenderFromName('John')).toBe('male');
      expect(inferGenderFromName('Rishabh')).toBe('male');
      expect(inferGenderFromName('Arjun')).toBe('male');
      expect(inferGenderFromName('Carlos')).toBe('male');
      expect(inferGenderFromName('Alexandre')).toBeNull(); // not in exact set or ambiguous
    });

    it('correctly classifies common female first names', () => {
      expect(inferGenderFromName('Sarah')).toBe('female');
      expect(inferGenderFromName('Emily')).toBe('female');
      expect(inferGenderFromName('Priya')).toBe('female');
      expect(inferGenderFromName('Anjali')).toBe('female');
      expect(inferGenderFromName('Elena')).toBe('female');
    });

    it('handles compound names and whitespace', () => {
      expect(inferGenderFromName('  Rahul Kumar  ')).toBe('male');
      expect(inferGenderFromName('Pooja-Sharma')).toBe('female');
    });

    it('returns null for unknown, empty, or ambiguous names', () => {
      expect(inferGenderFromName(null)).toBeNull();
      expect(inferGenderFromName('')).toBeNull();
      expect(inferGenderFromName('Xyzqwe')).toBeNull();
    });
  });

  describe('inferProspectGender', () => {
    it('prioritizes pronouns over name heuristic when available', () => {
      // e.g. name might look ambiguous or contradictory, pronouns are explicit
      expect(inferProspectGender({ firstName: 'Alex', pronounsOrBio: 'she/her' })).toBe('female');
      expect(inferProspectGender({ firstName: 'Sam', pronounsOrBio: 'he/him' })).toBe('male');
    });

    it('falls back to name heuristic when pronouns are missing', () => {
      expect(inferProspectGender({ firstName: 'David' })).toBe('male');
      expect(inferProspectGender({ firstName: 'Sarah' })).toBe('female');
    });

    it('returns null if neither name nor pronouns provide classification', () => {
      expect(inferProspectGender({ firstName: 'UnknownName', pronounsOrBio: 'Tech enthusiast' })).toBeNull();
    });
  });
});
