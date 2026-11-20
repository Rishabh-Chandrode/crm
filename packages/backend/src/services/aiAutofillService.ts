import { pool } from '../db/index.js';
import { LlmProviderFactory } from './llm/factory.js';
import type {
  User,
  AiAutofillRequest,
  AiAutofillResponse,
  AiAutofillFieldQuery,
  AiAutofillFieldAnswer,
} from '../types/index.js';

export function resolveHeuristicAnswers(
  user: User,
  fields: AiAutofillFieldQuery[]
): AiAutofillFieldAnswer[] {
  const answers: AiAutofillFieldAnswer[] = [];

  for (const field of fields) {
    const text = `${field.label} ${field.name ?? ''} ${field.placeholder ?? ''}`.toLowerCase();

    // 1. Sponsorship / Visa Questions
    if (
      /\b(require|need)\b.*(visa|sponsorship)\b/i.test(text) ||
      /\b(visa|sponsorship)\b.*(require|need)\b/i.test(text)
    ) {
      const isAuthNoSponsorship =
        !user.work_authorization ||
        /citizen|permanent|green[\s_-]?card|authorized|no[\s_-]?sponsorship/i.test(
          user.work_authorization
        );
      const val = isAuthNoSponsorship ? 'No' : 'Yes';

      let optionIndex: number | undefined;
      let matchedVal = val;
      if (field.options && field.options.length > 0) {
        const idx = field.options.findIndex((opt) =>
          isAuthNoSponsorship
            ? /^no\b|^will not\b|^not require/i.test(opt.trim())
            : /^yes\b|^will require\b/i.test(opt.trim())
        );
        if (idx !== -1) {
          optionIndex = idx;
          matchedVal = field.options[idx]!;
        }
      }
      answers.push({
        id: field.id,
        value: matchedVal,
        optionIndex,
        reasoning: 'Heuristic: work authorization sponsorship check',
      });
      continue;
    }

    // 2. Legally Authorized to Work
    if (
      /\b(legally|authorized|eligible)\b.*(work|employ)/i.test(text) ||
      /\bwork\s+(auth|authorization|eligibility)\b/i.test(text)
    ) {
      let optionIndex: number | undefined;
      let matchedVal = 'Yes';
      if (field.options && field.options.length > 0) {
        const idx = field.options.findIndex((opt) =>
          /^yes\b|^authorized\b|^eligible\b/i.test(opt.trim())
        );
        if (idx !== -1) {
          optionIndex = idx;
          matchedVal = field.options[idx]!;
        }
      }
      answers.push({
        id: field.id,
        value: matchedVal,
        optionIndex,
        reasoning: 'Heuristic: legal work authorization',
      });
      continue;
    }

    // 3. Notice Period / Availability
    if (/\b(notice\s*period|availability|how soon can you start)\b/i.test(text)) {
      if (user.notice_period) {
        let optionIndex: number | undefined;
        let matchedVal = user.notice_period;
        if (field.options && field.options.length > 0) {
          const idx = field.options.findIndex((opt) =>
            opt.toLowerCase().includes(user.notice_period!.toLowerCase())
          );
          if (idx !== -1) {
            optionIndex = idx;
            matchedVal = field.options[idx]!;
          }
        }
        answers.push({
          id: field.id,
          value: matchedVal,
          optionIndex,
          reasoning: 'Heuristic: user notice period',
        });
        continue;
      }
    }

    // 4. Years of Experience
    if (/\b(years?\s+of\s+exp|total\s+exp|work\s+exp)/i.test(text)) {
      if (user.years_of_experience) {
        answers.push({
          id: field.id,
          value: String(user.years_of_experience),
          reasoning: 'Heuristic: years of experience',
        });
        continue;
      }
    }

    // 5. Expected CTC / Salary
    if (/\b(expected\s+(ctc|salary|comp)|desired\s+salary)\b/i.test(text)) {
      if (user.expected_ctc) {
        answers.push({
          id: field.id,
          value: String(user.expected_ctc),
          reasoning: 'Heuristic: expected CTC',
        });
        continue;
      }
    }

    // 6. Current CTC / Salary
    if (/\b(current\s+(ctc|salary|comp)|present\s+ctc)\b/i.test(text)) {
      if (user.current_ctc) {
        answers.push({
          id: field.id,
          value: String(user.current_ctc),
          reasoning: 'Heuristic: current CTC',
        });
        continue;
      }
    }

    // 7. Degree / Highest Education
    if (/\b(highest\s+education|degree|qualification)\b/i.test(text)) {
      if (user.education) {
        let optionIndex: number | undefined;
        let matchedVal = user.education;
        if (field.options && field.options.length > 0) {
          const idx = field.options.findIndex((opt) =>
            opt.toLowerCase().includes(user.education!.toLowerCase()) ||
            user.education!.toLowerCase().includes(opt.toLowerCase())
          );
          if (idx !== -1) {
            optionIndex = idx;
            matchedVal = field.options[idx]!;
          }
        }
        answers.push({
          id: field.id,
          value: matchedVal,
          optionIndex,
          reasoning: 'Heuristic: education degree',
        });
        continue;
      }
    }
  }

  return answers;
}

export class AiAutofillService {
  public async resolveFormFields(
    userId: string,
    req: AiAutofillRequest
  ): Promise<AiAutofillResponse> {
    if (!req.fields || !Array.isArray(req.fields) || req.fields.length === 0) {
      return { success: true, answers: [] };
    }

    // Bound maximum input fields per request
    const boundedFields = req.fields.slice(0, 30);

    const userRes = await pool.query<User>(
      `SELECT id, username, email, first_name, last_name, current_company, job_title,
              phone, phone_country_code, website, bio, linkedin_url, github_url,
              city, state, country, address_line1, postal_code, work_authorization,
              location, hometown, years_of_experience, notice_period, current_ctc,
              expected_ctc, education, college_name, graduation_year, skills,
              target_roles, projects, work_experiences, gender, veteran_status
       FROM users WHERE id = $1`,
      [userId]
    );

    const user = userRes.rows[0];
    if (!user) {
      return { success: false, answers: [], error: 'User profile not found' };
    }

    const provider = LlmProviderFactory.getProvider();

    if (!provider.isAvailable()) {
      const fallbackAnswers = resolveHeuristicAnswers(user, boundedFields);
      return {
        success: true,
        answers: fallbackAnswers,
        modelUsed: 'heuristic-fallback',
      };
    }

    const candidateProfile = {
      fullName: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username,
      email: user.email,
      phone: user.phone,
      location: user.location || [user.city, user.state, user.country].filter(Boolean).join(', '),
      currentCompany: user.current_company,
      jobTitle: user.job_title,
      yearsOfExperience: user.years_of_experience,
      skills: user.skills,
      targetRoles: user.target_roles,
      workAuthorization: user.work_authorization,
      noticePeriod: user.notice_period,
      currentCtc: user.current_ctc,
      expectedCtc: user.expected_ctc,
      education: user.education,
      collegeName: user.college_name,
      graduationYear: user.graduation_year,
      workExperiences: user.work_experiences,
      bio: user.bio,
      linkedinUrl: user.linkedin_url,
      githubUrl: user.github_url,
      website: user.website,
    };

    const systemPrompt = `You are an expert AI recruiting and job application assistant. Your job is to fill out job application screening questions and form fields accurately on behalf of a job candidate.

Strict Rules:
1. Answer truthfully based strictly on the candidate's profile, work experience, skills, and work authorization status.
2. Never invent fake past employers, degrees, or certifications not in the candidate's profile.
3. For open-ended questions (e.g. "Why do you want to work here?", "Describe a project", "Cover letter / summary"): provide a compelling, professional, concise response (2-4 sentences) connecting the candidate's genuine background with the role requirements.
4. For select / radio fields with provided "options": you MUST choose the best option from the list. Set "value" to the chosen option string and "optionIndex" to its 0-based index.
5. For work authorization & visa sponsorship questions:
   - If the candidate's work authorization status is authorized/citizen/no sponsorship required, answer "Yes" to authorization and "No" to requiring sponsorship.
6. Return strictly valid JSON: { "answers": [ { "id": "field_id", "value": "answer text", "optionIndex": 0, "reasoning": "brief rationale" } ] }`;

    const prompt = `Candidate Profile:
${JSON.stringify(candidateProfile, null, 2)}

Target Job Info:
Company: ${req.company_name || 'N/A'}
Role: ${req.job_title || 'N/A'}
Job Description Snippet:
${req.job_description ? req.job_description.slice(0, 3000) : 'N/A'}

Form Fields to Resolve:
${JSON.stringify(boundedFields, null, 2)}

Generate the answers JSON:`;

    try {
      const generated = await provider.generateJson<{ answers?: AiAutofillFieldAnswer[] }>(
        prompt,
        systemPrompt,
        { purpose: 'autofill-screening', temperature: 0.2 }
      );

      const aiAnswers = Array.isArray(generated?.answers) ? generated!.answers : [];

      // Combine with heuristic fallback for any fields the LLM might have omitted
      const heuristicAnswers = resolveHeuristicAnswers(user, boundedFields);
      const answerMap = new Map<string, AiAutofillFieldAnswer>();

      for (const h of heuristicAnswers) {
        answerMap.set(h.id, h);
      }
      for (const a of aiAnswers) {
        if (a && typeof a.id === 'string' && a.value !== undefined) {
          answerMap.set(a.id, a);
        }
      }

      return {
        success: true,
        answers: Array.from(answerMap.values()),
        modelUsed: provider.name,
      };
    } catch (err) {
      console.warn('[AiAutofillService] LLM generation error, using heuristics:', err);
      const fallbackAnswers = resolveHeuristicAnswers(user, boundedFields);
      return {
        success: true,
        answers: fallbackAnswers,
        modelUsed: 'heuristic-fallback',
      };
    }
  }
}

export const aiAutofillService = new AiAutofillService();
