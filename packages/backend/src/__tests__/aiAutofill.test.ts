import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { pool } from '../db/index.js';
import { CONFIG } from '../config.js';
import { LlmProviderFactory } from '../services/llm/factory.js';
import { aiAutofillService, resolveHeuristicAnswers } from '../services/aiAutofillService.js';
import type { ILlmProvider } from '../services/llm/types.js';
import type { User, AiAutofillFieldQuery } from '../types/index.js';

describe('AI Autofill Service & API (/api/autofill/ai-fill)', () => {
  const testUserId = '33333333-3333-3333-3333-333333333333';
  const testUserToken = jwt.sign(
    { id: testUserId, username: 'test_candidate', role: 'user' },
    CONFIG.jwtSecret,
    { expiresIn: '1h' }
  );

  const mockUser: Partial<User> = {
    id: testUserId,
    username: 'test_candidate',
    email: 'candidate@example.com',
    first_name: 'John',
    last_name: 'Doe',
    job_title: 'Senior Software Engineer',
    current_company: 'Acme Corp',
    years_of_experience: '6',
    notice_period: '30 days',
    current_ctc: '$120,000',
    expected_ctc: '$150,000',
    work_authorization: 'US Citizen / Authorized without sponsorship',
    education: 'Bachelor of Science in Computer Science',
    skills: ['TypeScript', 'Node.js', 'React', 'PostgreSQL', 'Docker'],
    work_experiences: [
      {
        company: 'Acme Corp',
        title: 'Senior Software Engineer',
        start_date: '2021-01',
        end_date: null,
        description: 'Building microservices and full-stack web applications',
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    LlmProviderFactory.reset();
  });

  describe('resolveHeuristicAnswers unit tests', () => {
    it('resolves visa sponsorship and legal authorization questions', () => {
      const fields: AiAutofillFieldQuery[] = [
        {
          id: 'q1',
          label: 'Will you now or in the future require visa sponsorship?',
          type: 'radio',
          options: ['Yes, I will require sponsorship', 'No, I will not require sponsorship'],
        },
        {
          id: 'q2',
          label: 'Are you legally authorized to work in the United States?',
          type: 'select',
          options: ['Yes', 'No'],
        },
        {
          id: 'q3',
          label: 'Notice period in days',
          type: 'text',
        },
        {
          id: 'q4',
          label: 'Total years of experience',
          type: 'text',
        },
        {
          id: 'q5',
          label: 'Expected CTC / Salary',
          type: 'text',
        },
      ];

      const answers = resolveHeuristicAnswers(mockUser as User, fields);

      expect(answers).toHaveLength(5);
      expect(answers.find((a) => a.id === 'q1')?.value).toBe('No, I will not require sponsorship');
      expect(answers.find((a) => a.id === 'q1')?.optionIndex).toBe(1);

      expect(answers.find((a) => a.id === 'q2')?.value).toBe('Yes');
      expect(answers.find((a) => a.id === 'q2')?.optionIndex).toBe(0);

      expect(answers.find((a) => a.id === 'q3')?.value).toBe('30 days');
      expect(answers.find((a) => a.id === 'q4')?.value).toBe('6');
      expect(answers.find((a) => a.id === 'q5')?.value).toBe('$150,000');
    });
  });

  describe('POST /api/autofill/ai-fill API endpoint', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(app).post('/api/autofill/ai-fill').send({ fields: [] });
      expect(res.status).toBe(401);
    });

    it('returns 400 when fields parameter is not an array', async () => {
      const res = await request(app)
        .post('/api/autofill/ai-fill')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ fields: 'invalid' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('fields');
    });

    it('returns 200 with empty answers when fields array is empty', async () => {
      const res = await request(app)
        .post('/api/autofill/ai-fill')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ fields: [] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.answers).toEqual([]);
    });

    it('uses heuristic fallback when no LLM provider is active', async () => {
      vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      const res = await request(app)
        .post('/api/autofill/ai-fill')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          job_title: 'Full Stack Engineer',
          company_name: 'Stripe',
          fields: [
            {
              id: 'visa_q',
              label: 'Do you require sponsorship to work in this country?',
              type: 'radio',
              options: ['Yes', 'No'],
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.modelUsed).toBe('heuristic-fallback');
      expect(res.body.answers).toHaveLength(1);
      expect(res.body.answers[0].value).toBe('No');
      expect(res.body.answers[0].optionIndex).toBe(1);
    });

    it('calls active LLM provider when available and merges results', async () => {
      vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      const mockLlm: ILlmProvider = {
        name: 'gemini-mock',
        isAvailable: () => true,
        generateText: vi.fn(),
        generateJson: vi.fn().mockResolvedValue({
          answers: [
            {
              id: 'why_stripe',
              value: 'I admire Stripe’s developer-first infrastructure and look forward to contributing my 6 years of TypeScript and distributed backend experience.',
              reasoning: 'Tailored to Stripe and candidate profile',
            },
          ],
        }),
      };
      LlmProviderFactory.setProvider(mockLlm);

      const res = await request(app)
        .post('/api/autofill/ai-fill')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          job_title: 'Senior Backend Engineer',
          company_name: 'Stripe',
          job_description: 'We are looking for an experienced TypeScript and backend engineer...',
          fields: [
            {
              id: 'why_stripe',
              label: 'Why are you excited to join Stripe?',
              type: 'textarea',
            },
            {
              id: 'notice_q',
              label: 'What is your current notice period?',
              type: 'text',
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.modelUsed).toBe('gemini-mock');
      expect(res.body.answers).toHaveLength(2);

      const whyAnswer = res.body.answers.find((a: any) => a.id === 'why_stripe');
      expect(whyAnswer?.value).toContain('developer-first');

      const noticeAnswer = res.body.answers.find((a: any) => a.id === 'notice_q');
      expect(noticeAnswer?.value).toBe('30 days');
    });

    it('falls back to heuristics gracefully if LLM provider throws an exception', async () => {
      vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      const faultyLlm: ILlmProvider = {
        name: 'faulty-llm',
        isAvailable: () => true,
        generateText: vi.fn(),
        generateJson: vi.fn().mockRejectedValue(new Error('Rate limit exceeded')),
      };
      LlmProviderFactory.setProvider(faultyLlm);

      const res = await request(app)
        .post('/api/autofill/ai-fill')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          fields: [
            {
              id: 'notice_q',
              label: 'Notice period in days',
              type: 'text',
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.modelUsed).toBe('heuristic-fallback');
      expect(res.body.answers[0].value).toBe('30 days');
    });
  });
});
