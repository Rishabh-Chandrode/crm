import { LlmProviderFactory } from '../llm/factory.js';
import {
  classifyEmailHeuristic,
  extractApplicationUpdateDetailsHeuristic,
  matchScoreHeuristic,
  type EmailIntent,
  type ApplicationUpdateDetails,
  type JobMatchDetails,
} from '../llm/heuristicFallback.js';
import type { CandidatePreferences, JobApplicationStatus, ExtractedJobOpportunity } from '../../types/index.js';
import {
  unwrapTrackingUrl,
  detectPlatformFromUrl,
  extractCandidateLinksFromHtml,
  extractJobOpportunitiesHeuristic,
} from './jobExtractor.js';

export async function extractJobOpportunitiesWithAi(
  subject: string,
  bodyText: string,
  fromHeader: string,
  bodyHtml?: string
): Promise<ExtractedJobOpportunity[]> {
  const candidateLinks = bodyHtml ? extractCandidateLinksFromHtml(bodyHtml) : [];
  const provider = LlmProviderFactory.getProvider();

  if (provider.isAvailable()) {
    try {
      const linksContext = candidateLinks
        .slice(0, 15)
        .map((l, idx) => `[Link ${idx + 1}] Text: "${l.text}" | URL: ${l.url}`)
        .join('\n');

      const prompt = `You are an expert AI recruiting assistant specializing in high-accuracy job data extraction.
Analyze this job email and extract all open job opportunities mentioned in it.

Email Subject: ${subject}
From: ${fromHeader}
Candidate Links in Email:
${linksContext || 'No candidate links identified from HTML.'}

Email Content:
${bodyText.slice(0, 8000)}

Instructions:
1. For each opportunity:
   - "title": Extract the specific job title (e.g. "Senior Software Engineer", "Product Manager").
   - "company": Extract the ACTUAL hiring company.
     * CRITICAL: Do NOT return job board or newsletter names like "LinkedIn", "Naukri", "Indeed", "Glassdoor", "ZipRecruiter", "Wellfound", "Google Alerts", or generic placeholders like "Company", "Client", or "Unknown" unless that is literally the hiring employer.
     * If this is a job alert from LinkedIn/Naukri recommending a role at "Stripe", the company is "Stripe".
     * If the company cannot be determined with high certainty, set isConfident: false.
   - "url": The direct job post or application URL. Match with one of the Candidate Links if applicable, or extract from the text. If no URL exists, return "#".
   - "platform": Platform name (e.g. "LinkedIn", "Greenhouse", "Lever", "Naukri", "Workday", "Ashby", "Email").
   - "location": Location or "Remote" if specified, or null.
   - "salaryRange": Salary/compensation if specified, or null.
   - "descriptionSnippet": 1-2 sentence summary of requirements or opening, or null.
   - "confidence": "high" | "medium" | "low".
   - "isConfident": boolean. Set to true ONLY if you are confident that the hiring company name, job title, and URL are accurate and represent the true job opportunity. If company is ambiguous or uncertain, set isConfident: false.
   - "isComplete": boolean. Set to true ONLY if all three: (a) a specific job title, (b) a verified specific hiring company name, and (c) a valid job URL (not "#") are present. Otherwise set isComplete: false.
   - "reasoning": 1 sentence explaining the extraction and confidence.

Return strictly valid JSON:
{
  "jobs": [
    {
      "title": string,
      "company": string,
      "url": string,
      "platform": string,
      "location": string | null,
      "salaryRange": string | null,
      "descriptionSnippet": string | null,
      "confidence": "high" | "medium" | "low",
      "isConfident": boolean,
      "isComplete": boolean,
      "reasoning": string
    }
  ]
}`;

      const res = await provider.generateJson<{ jobs?: ExtractedJobOpportunity[] }>(
        prompt,
        'You are an expert AI recruiting assistant specializing in high-accuracy job data extraction. Return strictly valid JSON.',
        { purpose: 'extract_job_opportunities' }
      );

      if (res && Array.isArray(res.jobs) && res.jobs.length > 0) {
        return res.jobs.map((job) => {
          const rawUrl = job.url?.trim() || '#';
          const cleanUrl = rawUrl.startsWith('http') ? unwrapTrackingUrl(rawUrl) : rawUrl;
          const platform = job.platform || (cleanUrl.startsWith('http') ? detectPlatformFromUrl(cleanUrl) : 'Email');
          const company = (job.company || '').trim();
          const title = (job.title || '').trim();
          const isGenericCompany = !company || ['company', 'unknown', 'various', 'client', 'confidential'].includes(company.toLowerCase());
          const isGenericTitle = !title || ['job', 'job opportunity', 'opening', 'role'].includes(title.toLowerCase());
          const hasValidUrl = cleanUrl.startsWith('http') && cleanUrl !== '#';

          const isConfident = Boolean(job.isConfident && !isGenericCompany && !isGenericTitle && (job.confidence === 'high' || job.confidence === 'medium'));
          const isComplete = Boolean(job.isComplete && !isGenericCompany && !isGenericTitle && hasValidUrl);

          return {
            title: title || 'Job Opportunity',
            company: isGenericCompany ? 'Unknown Company' : company,
            url: cleanUrl,
            platform,
            location: job.location || null,
            salaryRange: job.salaryRange || null,
            descriptionSnippet: job.descriptionSnippet || null,
            confidence: job.confidence || (isConfident ? 'high' : 'low'),
            isConfident,
            isComplete,
            reasoning: job.reasoning || '',
          };
        });
      }
    } catch {
      // Fallback to heuristic
    }
  }

  return extractJobOpportunitiesHeuristic(subject, bodyText, fromHeader, bodyHtml);
}

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
