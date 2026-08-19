import { describe, it, expect } from 'vitest';
import {
  toVariableLabel,
  resolveTemplate,
  plainTextToHtml,
  wrapEmailHtml,
  extractPlaceholders,
} from '../services/templateEngine.js';
import type { TemplateVariable, Prospect, Company, SenderProfile } from '../types/index.js';

describe('templateEngine service', () => {
  describe('toVariableLabel', () => {
    it('converts camelCase and snake_case to human readable title case', () => {
      expect(toVariableLabel('firstName')).toBe('First Name');
      expect(toVariableLabel('company_name')).toBe('Company Name');
      expect(toVariableLabel('role')).toBe('Role');
      expect(toVariableLabel('job_title_category')).toBe('Job Title Category');
    });
  });

  describe('extractPlaceholders', () => {
    it('extracts unique variable keys from template text', () => {
      const text = 'Hi {{firstName}}, I saw you work at {{companyName}}. {{firstName}}, lets connect!';
      const extracted = extractPlaceholders(text);
      expect(extracted).toEqual(['firstName', 'companyName']);
    });

    it('returns empty array when no placeholders exist', () => {
      expect(extractPlaceholders('Hello world without variables')).toEqual([]);
    });
  });

  describe('resolveTemplate', () => {
    const mockProspect: Prospect = {
      id: 'p-123',
      company_id: 'c-456',
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      job_title: 'VP of Engineering',
      role_category: 'Engineering',
      linkedin_url: null,
      phone: null,
      notes: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const mockCompany: Company = {
      id: 'c-456',
      name: 'Acme Corp',
      website: 'https://acme.com',
      industry: 'Technology',
      created_at: new Date(),
      updated_at: new Date(),
    };

    const mockSender: SenderProfile = {
      first_name: 'Rishabh',
      last_name: 'Chandrode',
      email: 'rishabh@example.com',
      current_company: 'Acme',
      job_title: 'Engineer',
      phone: '+1234567890',
      website: null,
    };

    const variables: TemplateVariable[] = [
      { key: 'firstName', label: 'First Name', source: 'prospect', field: 'first_name' },
      { key: 'companyName', label: 'Company', source: 'company', field: 'name' },
      { key: 'senderName', label: 'Sender', source: 'sender', field: 'first_name' },
      { key: 'role', label: 'Custom Role', source: 'custom' },
      { key: 'fallbackVar', label: 'Fallback', source: 'custom', defaultValue: 'Software Engineer' },
    ];

    it('replaces prospect, company, sender, and custom variables accurately', () => {
      const template = 'Hi {{firstName}}, I am {{senderName}} from Acme. Loved {{companyName}}! Applying for {{role}}.';
      const resolved = resolveTemplate(template, variables, {
        prospect: mockProspect,
        company: mockCompany,
        sender: mockSender,
        custom: { role: 'Lead Architect' },
      });

      expect(resolved).toBe('Hi Jane, I am Rishabh from Acme. Loved Acme Corp! Applying for Lead Architect.');
    });

    it('uses default values when custom value is missing', () => {
      const template = 'Applying for {{fallbackVar}}.';
      const resolved = resolveTemplate(template, variables, {
        prospect: mockProspect,
        company: mockCompany,
        sender: mockSender,
        custom: {},
      });

      expect(resolved).toBe('Applying for Software Engineer.');
    });
  });

  describe('plainTextToHtml and wrapEmailHtml', () => {
    it('escapes html entities in plain text and wraps paragraphs', () => {
      const text = 'Hello & team\n\nHow are you?';
      const html = plainTextToHtml(text);
      expect(html).toContain('Hello &amp; team');
      expect(html).toContain('<p style="margin:0 0 8px 0">&nbsp;</p>');
    });

    it('preserves existing html tags when detected', () => {
      const text = 'Hello <strong>Jane</strong>\n\nWelcome!';
      const html = plainTextToHtml(text);
      expect(html).toContain('Hello <strong>Jane</strong>');
    });

    it('wraps email html with tracking pixel when provided', () => {
      const html = wrapEmailHtml('<p>Test email</p>', 'https://crm.example.com/api/track/open/123');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<p>Test email</p>');
      expect(html).toContain('<img src="https://crm.example.com/api/track/open/123" width="1" height="1"');
    });
  });
});
