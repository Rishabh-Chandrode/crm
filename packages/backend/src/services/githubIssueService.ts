import crypto from 'node:crypto';
import { CONFIG } from '../config.js';
import { pool } from '../db/index.js';
import { sanitizeLogData } from './systemLogger.js';

export interface ReportErrorOptions {
  logId?: string;
  message: string;
  errorName?: string;
  stackTrace?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  userId?: string;
  ip?: string;
  context?: Record<string, unknown>;
}

export class GithubIssueService {
  // In-memory cache of fingerprint -> { issueUrl, timestamp } to prevent duplicates
  private recentIssues = new Map<string, { issueUrl: string; timestamp: number }>();
  // Rolling hourly timestamp tracker for rate limiting
  private issueCreationTimestamps: number[] = [];
  private readonly MAX_ISSUES_PER_HOUR = 5;
  private readonly COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Generates a deterministic hash from the error name, top stack frame, and request path.
   */
  generateFingerprint(options: ReportErrorOptions): string {
    const errorName = options.errorName || 'Error';
    let topFrame = '';
    if (options.stackTrace) {
      const lines = options.stackTrace.split('\n');
      topFrame = lines.slice(1, 3).map((l) => l.trim()).join(' ');
    }
    const path = options.path || '';
    const raw = `${errorName}:${topFrame}:${path}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 10);
  }

  isConfigured(): boolean {
    return Boolean(CONFIG.githubIssuesEnabled && CONFIG.githubToken && CONFIG.githubRepo);
  }

  /**
   * Checks if an issue was created recently for this fingerprint.
   */
  getCachedIssue(fingerprint: string): string | null {
    const cached = this.recentIssues.get(fingerprint);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > this.COOLDOWN_MS) {
      this.recentIssues.delete(fingerprint);
      return null;
    }
    return cached.issueUrl;
  }

  /**
   * Checks rolling hourly rate limit.
   */
  private isRateLimited(): boolean {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.issueCreationTimestamps = this.issueCreationTimestamps.filter((t) => t > oneHourAgo);
    return this.issueCreationTimestamps.length >= this.MAX_ISSUES_PER_HOUR;
  }

  /**
   * Automatically creates or links a GitHub issue for an error.
   * Never throws — fails gracefully without interrupting application flow.
   */
  async reportError(options: ReportErrorOptions): Promise<string | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const fingerprint = this.generateFingerprint(options);

      // 1. Check local cache
      const cachedUrl = this.getCachedIssue(fingerprint);
      if (cachedUrl) {
        if (options.logId) {
          await this.attachIssueUrlToLog(options.logId, cachedUrl);
        }
        return cachedUrl;
      }

      // 2. Check rate limit
      if (this.isRateLimited()) {
        console.warn(`[GitHubIssues] Rate limit reached (${this.MAX_ISSUES_PER_HOUR} issues/hr). Skipping issue creation for [CRM-ERR-${fingerprint}]`);
        return null;
      }

      // 3. Search GitHub for an open issue with this fingerprint
      const existingUrl = await this.findExistingGithubIssue(fingerprint);
      if (existingUrl) {
        this.recentIssues.set(fingerprint, { issueUrl: existingUrl, timestamp: Date.now() });
        if (options.logId) {
          await this.attachIssueUrlToLog(options.logId, existingUrl);
        }
        return existingUrl;
      }

      // 4. Create new issue
      const newIssueUrl = await this.createNewIssue(fingerprint, options);
      if (newIssueUrl) {
        this.recentIssues.set(fingerprint, { issueUrl: newIssueUrl, timestamp: Date.now() });
        this.issueCreationTimestamps.push(Date.now());
        if (options.logId) {
          await this.attachIssueUrlToLog(options.logId, newIssueUrl);
        }
        console.log(`[GitHubIssues] Created automated issue: ${newIssueUrl}`);
      }

      return newIssueUrl;
    } catch (err) {
      console.error('[GitHubIssues] Failed to report error to GitHub:', err);
      return null;
    }
  }

  private async findExistingGithubIssue(fingerprint: string): Promise<string | null> {
    const [owner, repo] = CONFIG.githubRepo.split('/');
    if (!owner || !repo) return null;

    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues?state=open&labels=automated-error&per_page=30`,
        {
          headers: {
            Authorization: `Bearer ${CONFIG.githubToken}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'CRM-Automated-Error-Reporter',
          },
        }
      );

      if (!res.ok) return null;

      const issues = (await res.json()) as Array<{ title: string; html_url: string }>;
      const tag = `[CRM-ERR-${fingerprint}]`;
      const match = issues.find((issue) => issue.title && issue.title.includes(tag));
      return match ? match.html_url : null;
    } catch {
      return null;
    }
  }

  private async createNewIssue(
    fingerprint: string,
    options: ReportErrorOptions
  ): Promise<string | null> {
    const [owner, repo] = CONFIG.githubRepo.split('/');
    if (!owner || !repo) return null;

    const errorName = options.errorName || 'Unhandled Error';
    const cleanMessage = (options.message || 'Unknown error').split('\n')[0]?.trim();
    const title = `[CRM Bug] ${errorName}: ${cleanMessage} [CRM-ERR-${fingerprint}]`;

    const sanitizedContext = options.context ? sanitizeLogData(options.context) : null;

    const body = `### Automated Error Report

An unhandled error was recorded by the CRM application.

| Attribute | Details |
| :--- | :--- |
| **Error Type** | \`${errorName}\` |
| **Timestamp** | ${new Date().toISOString()} |
| **Route** | \`${options.method || 'GET'} ${options.path || 'N/A'}\` |
| **HTTP Status** | \`${options.statusCode || 500}\` |
| **Fingerprint** | \`CRM-ERR-${fingerprint}\` |

---

### Message
\`\`\`
${options.message}
\`\`\`

${
  options.stackTrace
    ? `<details><summary><b>Stack Trace</b></summary>

\`\`\`
${options.stackTrace}
\`\`\`

</details>`
    : ''
}

${
  sanitizedContext
    ? `<details><summary><b>Context Metadata</b></summary>

\`\`\`json
${JSON.stringify(sanitizedContext, null, 2)}
\`\`\`

</details>`
    : ''
}

---
*Created automatically by Outreach CRM Observability Engine.*
`;

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CONFIG.githubToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'CRM-Automated-Error-Reporter',
      },
      body: JSON.stringify({
        title,
        body,
        labels: ['bug', 'automated-error'],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[GitHubIssues] GitHub API error (${res.status}):`, errText);
      return null;
    }

    const data = (await res.json()) as { html_url: string };
    return data.html_url || null;
  }

  private async attachIssueUrlToLog(logId: string, issueUrl: string): Promise<void> {
    try {
      await pool.query('UPDATE system_logs SET github_issue_url = $1 WHERE id = $2', [
        issueUrl,
        logId,
      ]);
    } catch {
      // Ignore DB attach error
    }
  }
}

export const githubIssueService = new GithubIssueService();
