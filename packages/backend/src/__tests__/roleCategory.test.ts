import { describe, it, expect } from 'vitest';
import { inferRoleCategory } from '../services/roleCategory.js';

describe('Role Category Inference', () => {
  it('correctly classifies HR and recruiting titles', () => {
    expect(inferRoleCategory('Technical Recruiter')).toBe('hr');
    expect(inferRoleCategory('Talent Acquisition Partner')).toBe('hr');
    expect(inferRoleCategory('Head of People Ops')).toBe('hr');
    expect(inferRoleCategory('Senior Staffing Specialist')).toBe('hr');
    expect(inferRoleCategory('HR Generalist')).toBe('hr');
  });

  it('correctly classifies engineering and tech roles', () => {
    expect(inferRoleCategory('Software Engineer')).toBe('engineer');
    expect(inferRoleCategory('Senior Frontend Developer')).toBe('engineer');
    expect(inferRoleCategory('Backend SDE II')).toBe('engineer');
    expect(inferRoleCategory('Full Stack Architect')).toBe('engineer');
    expect(inferRoleCategory('DevOps / SRE Lead')).toBe('engineer');
    expect(inferRoleCategory('Engineering Manager')).toBe('engineer');
    expect(inferRoleCategory('VP of Engineering')).toBe('engineer');
    expect(inferRoleCategory('Data Scientist')).toBe('engineer');
    expect(inferRoleCategory('Machine Learning Engineer')).toBe('engineer');
    expect(inferRoleCategory('iOS Developer')).toBe('engineer');
  });

  it('classifies other roles as "other"', () => {
    expect(inferRoleCategory('Product Manager')).toBe('other');
    expect(inferRoleCategory('Marketing Director')).toBe('other');
    expect(inferRoleCategory('Financial Analyst')).toBe('other');
    expect(inferRoleCategory('Legal Counsel')).toBe('other');
  });

  it('returns null for null, undefined, or empty titles', () => {
    expect(inferRoleCategory(null)).toBeNull();
    expect(inferRoleCategory(undefined)).toBeNull();
    expect(inferRoleCategory('   ')).toBeNull();
  });
});
