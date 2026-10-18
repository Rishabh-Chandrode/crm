import { LlmProviderFactory } from '../llm/factory.js';
import {
  classifyEmailHeuristic,
  extractApplicationUpdateDetailsHeuristic,
  matchScoreHeuristic,
  type EmailIntent,
  type ApplicationUpdateDetails,
  type JobMatchDetails,
} from '../llm/heuristicFallback.js';
import type { CandidatePreferences, JobApplicationStatus } from '../../types/index.js';

export async function classifyEmail(
  subject: string,
  bodyText: string,
  fromHeader: string
): Promise<EmailIntent> {
  const provider = LlmProviderFactory.getProvider();

  if (provider.isAvailable()) {
    try {
      const prompt = `Classify this email into exactly one of three categories:
1. "job_recommendation" (emails containing open job listings, newsletters with job links, or job alert recommendations)
2. "application_update" (emails from companies regarding an application you submitted: e.g. "application received", interview requests, assessment tests, offers, or rejections)
3. "irrelevant" (general newsletters, receipts, notifications unrelated to jobs or applications)

Email Subject: ${subject}
From: ${fromHeader}
Email Content:
${bodyText.slice(0, 10000)}

Return JSON:
{
  "category": "job_recommendation" | "application_update" | "irrelevant",
  "reasoning": "brief reason"
}`;

      const res = await provider.generateJson<{ category?: EmailIntent }>(
        prompt,
        'You are an expert career email assistant. Return strictly valid JSON.',
        { purpose: 'classify_email' }
      );

      if (res?.category && ['job_recommendation', 'application_update', 'irrelevant'].includes(res.category)) {
        return res.category;
      }
    } catch {
      // Fallback to heuristic
    }
  }

  return classifyEmailHeuristic(subject, bodyText, fromHeader);
}

export async function scoreJobAgainstPreferences(
  jobTitle: string,
  company: string,
  description: string,
  preferences?: CandidatePreferences | null
): Promise<JobMatchDetails> {
  const provider = LlmProviderFactory.getProvider();

  if (provider.isAvailable() && preferences) {
    try {
      const prompt = `Evaluate how well this job opportunity matches the candidate preferences.

Candidate Target Roles: ${(preferences.target_roles || []).join(', ') || 'Not specified'}
Candidate Target Skills: ${(preferences.target_skills || []).join(', ') || 'Not specified'}
Experience: ${preferences.min_experience_years ?? 0} to ${preferences.max_experience_years ?? 'Any'} years
Locations / Remote: ${(preferences.preferred_locations || []).join(', ') || 'Any'} (Remote Only: ${preferences.remote_only ? 'Yes' : 'No'})

Job Title: ${jobTitle}
Company: ${company}
Job Description:
${description.slice(0, 3000)}

Return JSON:
{
  "matchScore": number between 0 and 100,
  "matchReasons": ["array", "of", "strongest", "matching", "points"],
  "missingSkills": ["array", "of", "required", "skills", "the", "candidate", "lacks"]
}`;

      const res = await provider.generateJson<{
        matchScore?: number;
        matchReasons?: string[];
        missingSkills?: string[];
      }>(
        prompt,
        'You are an objective technical recruiter scoring job fit. Return strictly valid JSON.',
        { purpose: 'score_job_preferences' }
      );

      if (typeof res?.matchScore === 'number') {
        return {
          matchScore: Math.min(100, Math.max(0, Math.round(res.matchScore))),
          matchReasons: Array.isArray(res.matchReasons) ? res.matchReasons.slice(0, 5) : ['Good fit based on role criteria'],
          missingSkills: Array.isArray(res.missingSkills) ? res.missingSkills.slice(0, 5) : [],
        };
      }
    } catch {
      // Fallback to heuristic
    }
  }

  return matchScoreHeuristic(description, preferences);
}

export async function extractApplicationUpdateDetails(
  subject: string,
  bodyText: string,
  fromHeader: string
): Promise<ApplicationUpdateDetails | null> {
  const provider = LlmProviderFactory.getProvider();

  if (provider.isAvailable()) {
    try {
      const prompt = `Extract application status update details from this email:

From: ${fromHeader}
Subject: ${subject}
Body:
${bodyText.slice(0, 10000)}

Allowed status values:
- "applied" (application confirmed or received)
- "screening" (coding assessment, questionnaire, or HR screen)
- "interview" (technical or behavioral interview invitation / scheduled)
- "offer" (job offer extended)
- "rejected" (declined / position filled / not moving forward)

Return JSON:
{
  "companyName": "extracted company name",
  "status": "applied" | "screening" | "interview" | "offer" | "rejected",
  "note": "one sentence summary of the update"
}`;

      const res = await provider.generateJson<{
        companyName?: string;
        status?: JobApplicationStatus;
        note?: string;
      }>(
        prompt,
        'You extract job application tracking updates. Return strictly valid JSON.',
        { purpose: 'extract_application_update' }
      );

      if (res?.companyName && res.status && ['applied', 'screening', 'interview', 'offer', 'rejected'].includes(res.status)) {
        return {
          companyName: res.companyName.trim(),
          status: res.status,
          note: res.note?.trim() || `Status updated to ${res.status}`,
        };
      }
    } catch {
      // Fallback to heuristic
    }
  }

  return extractApplicationUpdateDetailsHeuristic(subject, bodyText, fromHeader);
}
