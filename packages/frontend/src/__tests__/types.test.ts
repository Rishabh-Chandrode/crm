import { describe, it, expect } from 'vitest';
import {
  prospectFullName,
  toVariableLabel,
  buildVariableFromKey,
  type VariablePreset,
} from '../lib/types';

describe('Frontend Types & Utility Functions', () => {
  describe('prospectFullName', () => {
    it('concatenates first and last name correctly', () => {
      expect(prospectFullName({ first_name: 'John', last_name: 'Doe' })).toBe('John Doe');
    });

    it('handles missing last name gracefully', () => {
      expect(prospectFullName({ first_name: 'John', last_name: null })).toBe('John');
    });
  });

  describe('toVariableLabel', () => {
    it('formats camelCase and snake_case keys into Title Case labels', () => {
      expect(toVariableLabel('firstName')).toBe('First Name');
      expect(toVariableLabel('company_name')).toBe('Company Name');
      expect(toVariableLabel('linkedin_url')).toBe('Linkedin Url');
    });
  });

  describe('buildVariableFromKey', () => {
    const mockPresets: VariablePreset[] = [
      {
        id: '1',
        key: 'firstName',
        label: 'First Name',
        source: 'prospect',
        field: 'first_name',
        default_value: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '2',
        key: 'company',
        label: 'Company Name',
        source: 'company',
        field: 'name',
        default_value: 'Acme',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    it('matches configured preset and builds template variable', () => {
      const v = buildVariableFromKey('firstName', mockPresets);
      expect(v).toEqual({
        key: 'firstName',
        label: 'First Name',
        source: 'prospect',
        field: 'first_name',
        defaultValue: '',
      });
    });

    it('falls back to custom source when no preset matches', () => {
      const v = buildVariableFromKey('custom_role', mockPresets);
      expect(v).toEqual({
        key: 'custom_role',
        label: 'Custom Role',
        source: 'custom',
        field: undefined,
        defaultValue: '',
      });
    });
  });
});
