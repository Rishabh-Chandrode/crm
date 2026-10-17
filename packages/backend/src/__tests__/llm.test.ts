import { describe, it, expect, beforeEach } from 'vitest';
import { LlmProviderFactory } from '../services/llm/factory.js';
import { NullLlmProvider } from '../services/llm/providers/nullProvider.js';
import { GeminiProvider } from '../services/llm/providers/geminiProvider.js';
import { OpenAiProvider } from '../services/llm/providers/openaiProvider.js';
import {
  classifyEmailHeuristic,
  matchScoreHeuristic,
  extractApplicationUpdateDetailsHeuristic,
} from '../services/llm/heuristicFallback.js';
import type { CandidatePreferences } from '../types/index.js';

describe('LLM Module & Heuristic Fallback', () => {
  beforeEach(() => {
    LlmProviderFactory.reset();
  });

  describe('NullLlmProvider (Disabled / Fallback)', () => {
    it('returns isAvailable = false and safe null responses', async () => {
      const provider = new NullLlmProvider();
      expect(provider.name).toBe('disabled');
      expect(provider.isAvailable()).toBe(false);

      const text = await provider.generateText('hello');
      expect(text).toBeNull();

      const json = await provider.generateJson('hello');
      expect(json).toBeNull();
    });
  });

  describe('LlmProviderFactory', () => {
    it('allows setting custom provider instance at runtime', () => {
      const mockProvider = new NullLlmProvider();
      LlmProviderFactory.setProvider(mockProvider);
      expect(LlmProviderFactory.getProvider()).toBe(mockProvider);
    });

    it('returns NullLlmProvider when keys are missing or disabled', () => {
      LlmProviderFactory.reset();
      const provider = LlmProviderFactory.getProvider();
      expect(provider).toBeDefined();
    });
  });

  describe('GeminiProvider & OpenAiProvider Availability', () => {
    it('GeminiProvider reports available when API key is provided', () => {
      const provider = new GeminiProvider({ apiKey: 'test-key' });
      expect(provider.name).toBe('gemini');
      expect(provider.isAvailable()).toBe(true);

      const emptyProvider = new GeminiProvider({ apiKey: '' });
      expect(emptyProvider.isAvailable()).toBe(false);
    });

    it('OpenAiProvider reports available when API key is provided', () => {
      const provider = new OpenAiProvider({ apiKey: 'sk-test' });
      expect(provider.name).toBe('openai');
      expect(provider.isAvailable()).toBe(true);

      const emptyProvider = new OpenAiProvider({ apiKey: '' });
      expect(emptyProvider.isAvailable()).toBe(false);
    });
  });

  describe('classifyEmailHeuristic', () => {
    it('detects job recommendation emails', () => {
      const intent = classifyEmailHeuristic(
        '10 new recommended jobs for you: Senior Full Stack Engineer',
        'Check out these jobs matching your profile at Stripe, Swiggy, and Uber',
        'jobalerts-noreply@linkedin.com'
      );
      expect(intent).toBe('job_recommendation');
    });

    it('detects application confirmation emails', () => {
      const intent = classifyEmailHeuristic(
        'Thank you for applying to Stripe',
        'Your application for Software Engineer has been received.',
        'jobs@stripe.com'
      );
      expect(intent).toBe('application_update');
    });

    it('detects interview invitation emails', () => {
      const intent = classifyEmailHeuristic(
        'Invitation to interview with Acme Corp',
        'We would like to schedule a technical interview for the backend role.',
        'recruiting@acme.com'
      );
      expect(intent).toBe('application_update');
    });

    it('detects rejection emails', () => {
      const intent = classifyEmailHeuristic(
        'Update on your application with TechCorp',
        'Unfortunately, we have decided to pursue other candidates.',
        'no-reply@greenhouse-mail.io'
      );
      expect(intent).toBe('application_update');
    });

    it('classifies unrelated emails as irrelevant', () => {
      const intent = classifyEmailHeuristic(
        'Your Amazon order has shipped',
        'Package will arrive by tomorrow 5 PM.',
        'auto-confirm@amazon.com'
      );
      expect(intent).toBe('irrelevant');
    });
  });

  describe('extractApplicationUpdateDetailsHeuristic', () => {
    it('extracts interview status and company name', () => {
      const details = extractApplicationUpdateDetailsHeuristic(
        'Invitation to interview at Figma',
        'Hi, we would like to schedule a phone screen interview next week.',
        'recruiter@figma.com'
      );

      expect(details).not.toBeNull();
      expect(details?.companyName).toBe('Figma');
      expect(details?.status).toBe('interview');
    });

    it('extracts rejection status', () => {
      const details = extractApplicationUpdateDetailsHeuristic(
        'Update on your application at Datadog',
        'Unfortunately we are not moving forward at this time.',
        'careers@datadog.com'
      );

      expect(details).not.toBeNull();
      expect(details?.companyName).toBe('Datadog');
      expect(details?.status).toBe('rejected');
    });
  });

  describe('matchScoreHeuristic', () => {
    const preferences: CandidatePreferences = {
      target_roles: ['Full Stack Engineer', 'Backend Developer'],
      target_skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
      preferred_locations: ['Remote'],
      remote_only: true,
    };

    it('calculates high match score for well-aligned job', () => {
      const jobDesc = `
        We are hiring a Full Stack Engineer to build scalable microservices.
        Requirements:
        - 3+ years experience with React, Node.js, TypeScript, and PostgreSQL.
        - This is a 100% remote role.
      `;

      const match = matchScoreHeuristic(jobDesc, preferences);
      expect(match.matchScore).toBeGreaterThanOrEqual(80);
      expect(match.matchReasons.some(r => r.includes('target role'))).toBe(true);
      expect(match.matchReasons.some(r => r.includes('remote'))).toBe(true);
      expect(match.missingSkills.length).toBe(0);
    });

    it('identifies missing skills and lower score for mismatched role', () => {
      const jobDesc = `
        Looking for a Senior Python / Django Developer.
        Skills required: Python, Django, Redis, Celery.
        On-site in Chicago.
      `;

      const match = matchScoreHeuristic(jobDesc, preferences);
      expect(match.matchScore).toBeLessThan(60);
      expect(match.missingSkills).toContain('React');
      expect(match.missingSkills).toContain('TypeScript');
    });
  });
});
