import type { CandidatePreferences, JobApplicationStatus } from '../../types/index.js';

export type EmailIntent = 'job_recommendation' | 'application_update' | 'irrelevant';

export interface ApplicationUpdateDetails {
  companyName: string;
  status: JobApplicationStatus;
  note: string;
}

export interface JobMatchDetails {
  matchScore: number;
  matchReasons: string[];
  missingSkills: string[];
}

export function classifyEmailHeuristic(
  subject: string,
  bodyText: string,
  fromHeader: string
): EmailIntent {
  const text = `${subject} ${bodyText} ${fromHeader}`.toLowerCase();

  // Application Updates (rejections, interview invitations, confirmations)
  const applicationUpdateKeywords = [
    'thank you for applying',
    'thanks for applying',
    'application received',
    'application submitted',
    'update on your application',
    'status of your application',
    'invitation to interview',
    'interview invitation',
    'schedule an interview',
    'phone screen',
    'technical interview',
    'take-home assessment',
    'codesignal',
    'hackerrank',
    'unfortunately, we have decided',
    'not moving forward',
    'offer of employment',
    'job offer',
  ];

  for (const kw of applicationUpdateKeywords) {
    if (text.includes(kw)) {
      return 'application_update';
    }
  }

  // Job Recommendation / Alerts
  const jobAlertKeywords = [
    'jobs matching your profile',
    'recommended jobs',
    'top job picks',
    'new job recommendations',
    'job alert',
    'jobs you may be interested in',
    'hiring now',
    'open positions',
    'open roles',
    'naukri job alert',
    'linkedin job alert',
    'apply to these jobs',
  ];

  for (const kw of jobAlertKeywords) {
    if (text.includes(kw)) {
      return 'job_recommendation';
    }
  }

  // Check fromHeader hints
  const lowerFrom = fromHeader.toLowerCase();
  if (
    lowerFrom.includes('jobalerts-noreply@linkedin.com') ||
    lowerFrom.includes('naukrialerts') ||
    lowerFrom.includes('jobalerts@')
  ) {
    return 'job_recommendation';
  }

  if (
    lowerFrom.includes('greenhouse-mail.io') ||
    lowerFrom.includes('lever.co') ||
    lowerFrom.includes('myworkday.com') ||
    lowerFrom.includes('smartrecruiters.com') ||
    lowerFrom.includes('ashbyhq.com')
  ) {
    return 'application_update';
  }

  return 'irrelevant';
}

export function extractApplicationUpdateDetailsHeuristic(
  subject: string,
  bodyText: string,
  fromHeader: string
): ApplicationUpdateDetails | null {
  const combined = `${subject} ${bodyText}`.toLowerCase();

  let status: JobApplicationStatus = 'applied';
  let note = 'Application update detected from email.';

  if (
    combined.includes('interview') ||
    combined.includes('phone screen') ||
    combined.includes('schedule a call') ||
    combined.includes('next round')
  ) {
    status = 'interview';
    note = `Interview invitation or scheduling detected: "${subject.slice(0, 100)}"`;
  } else if (
    combined.includes('assessment') ||
    combined.includes('codesignal') ||
    combined.includes('hackerrank') ||
    combined.includes('test')
  ) {
    status = 'screening';
    note = `Assessment or screening detected: "${subject.slice(0, 100)}"`;
  } else if (
    combined.includes('offer letter') ||
    combined.includes('offer of employment') ||
    combined.includes('congratulations on your offer')
  ) {
    status = 'offer';
    note = `Job offer detected: "${subject.slice(0, 100)}"`;
  } else if (
    combined.includes('unfortunately') ||
    combined.includes('not moving forward') ||
    combined.includes('other candidates') ||
    combined.includes('pursuing other') ||
    combined.includes('position has been filled')
  ) {
    status = 'rejected';
    note = `Application rejected: "${subject.slice(0, 100)}"`;
  } else if (
    combined.includes('application received') ||
    combined.includes('thanks for applying') ||
    combined.includes('thank you for applying')
  ) {
    status = 'applied';
    note = `Application confirmed: "${subject.slice(0, 100)}"`;
  }

  // Infer company name
  let companyName = '';
  // Try pattern "at [Company]" or "with [Company]" in subject
  const atMatch = subject.match(/(?:at|with)\s+([A-Z][A-Za-z0-9&.\-_ ]{1,30})/);
  if (atMatch && atMatch[1]) {
    companyName = atMatch[1].trim();
  } else {
    // Try sender domain
    const emailMatch = fromHeader.match(/@([a-zA-Z0-9.-]+)/);
    if (emailMatch && emailMatch[1]) {
      const domain = emailMatch[1].toLowerCase();
      if (!['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'greenhouse-mail.io', 'lever.co'].includes(domain)) {
        const parts = domain.split('.');
        companyName = parts[0]!.charAt(0).toUpperCase() + parts[0]!.slice(1);
      }
    }
  }

  if (!companyName) {
    companyName = 'Unknown Company';
  }

  return { companyName, status, note };
}

export function matchScoreHeuristic(
  jobDescription: string,
  preferences?: CandidatePreferences | null
): JobMatchDetails {
  if (!preferences || (!preferences.target_skills?.length && !preferences.target_roles?.length)) {
    return {
      matchScore: 70,
      matchReasons: ['General opening (no candidate preferences configured yet)'],
      missingSkills: [],
    };
  }

  const desc = jobDescription.toLowerCase();
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const skill of preferences.target_skills || []) {
    const trimmed = skill.trim();
    if (!trimmed) continue;
    const regex = new RegExp(`\\b${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(desc)) {
      matchedSkills.push(trimmed);
    } else {
      missingSkills.push(trimmed);
    }
  }

  let roleScore = 20;
  let roleMatched = false;
  for (const role of preferences.target_roles || []) {
    const trimmed = role.trim();
    if (!trimmed) continue;
    const regex = new RegExp(`\\b${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(desc)) {
      roleScore = 40;
      roleMatched = true;
      break;
    }
  }

  const totalSkills = (preferences.target_skills || []).length;
  const skillRatio = totalSkills > 0 ? matchedSkills.length / totalSkills : 0.7;
  const skillScore = Math.round(skillRatio * 60);

  const matchScore = Math.min(100, Math.max(10, roleScore + skillScore));

  const matchReasons: string[] = [];
  if (roleMatched) {
    matchReasons.push('Matches target role title criteria');
  }
  if (matchedSkills.length > 0) {
    matchReasons.push(`Matches ${matchedSkills.length} key skill(s): ${matchedSkills.slice(0, 5).join(', ')}`);
  }
  if (preferences.remote_only && (desc.includes('remote') || desc.includes('work from home'))) {
    matchReasons.push('Offers remote work arrangement');
  }

  return {
    matchScore,
    matchReasons: matchReasons.length > 0 ? matchReasons : ['Partial keyword alignment with profile'],
    missingSkills: missingSkills.slice(0, 5),
  };
}
