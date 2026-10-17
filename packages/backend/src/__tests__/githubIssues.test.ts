import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { githubIssueService } from '../services/githubIssueService.js';
import { pool } from '../db/index.js';
import { CONFIG } from '../config.js';

describe('GitHub Issues Automated Error Reporting Service', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(pool, 'query').mockResolvedValue({ rows: [], rowCount: 0 } as any);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('generates consistent deterministic fingerprint for same error details', () => {
    const errorA = {
      message: 'Failed to connect to redis',
      errorName: 'RedisConnectionError',
      stackTrace: 'RedisConnectionError: Failed to connect\n    at createClient (/app/redis.ts:10:5)',
      path: '/api/cache',
    };

    const errorB = {
      message: 'Failed to connect to redis',
      errorName: 'RedisConnectionError',
      stackTrace: 'RedisConnectionError: Failed to connect\n    at createClient (/app/redis.ts:10:5)',
      path: '/api/cache',
    };

    const errorDifferent = {
      message: 'Invalid syntax error',
      errorName: 'SyntaxError',
      stackTrace: 'SyntaxError: Unexpected token\n    at parse (/app/json.ts:5:2)',
      path: '/api/parse',
    };

    const fpA = githubIssueService.generateFingerprint(errorA);
    const fpB = githubIssueService.generateFingerprint(errorB);
    const fpDiff = githubIssueService.generateFingerprint(errorDifferent);

    expect(fpA).toBe(fpB);
    expect(fpA).not.toBe(fpDiff);
    expect(fpA).toHaveLength(10);
  });

  it('skips reporting when service is not configured with GITHUB_TOKEN', async () => {
    // If not configured, should return null and not attempt network request
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const result = await githubIssueService.reportError({
      message: 'Test unhandled error',
      errorName: 'TestError',
    });

    if (!githubIssueService.isConfigured()) {
      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  });

  it('creates a new GitHub issue and links it to system_logs when configured', async () => {
    // Force configured state for testing
    vi.spyOn(githubIssueService, 'isConfigured').mockReturnValue(true);

    const mockFetch = vi.fn()
      // First call: search existing issues (none found)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as any)
      // Second call: create issue
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          html_url: 'https://github.com/Rishabh-Chandrode/crm/issues/101',
        }),
      } as any);

    global.fetch = mockFetch;

    const issueUrl = await githubIssueService.reportError({
      logId: 'log-uuid-1234',
      message: 'Unhandled database connection crash',
      errorName: 'PostgresCrashError',
      stackTrace: 'PostgresCrashError: Connection closed\n    at Client.connect (/db.ts:4:2)',
      path: '/api/prospects',
      method: 'GET',
      statusCode: 500,
    });

    expect(issueUrl).toBe('https://github.com/Rishabh-Chandrode/crm/issues/101');
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify it updated the database row
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE system_logs SET github_issue_url = $1 WHERE id = $2'),
      ['https://github.com/Rishabh-Chandrode/crm/issues/101', 'log-uuid-1234']
    );
  });

  it('deduplicates error reports and reuses cached issue URL for identical errors', async () => {
    vi.spyOn(githubIssueService, 'isConfigured').mockReturnValue(true);

    const mockFetch = vi.fn()
      // Search
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as any)
      // Create
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          html_url: 'https://github.com/Rishabh-Chandrode/crm/issues/102',
        }),
      } as any);

    global.fetch = mockFetch;

    const errorPayload = {
      message: 'Repeated network error',
      errorName: 'NetworkError',
      stackTrace: 'NetworkError: ETIMEDOUT\n    at fetch (/net.ts:1:1)',
      path: '/api/sync',
    };

    // First occurrence
    const firstUrl = await githubIssueService.reportError(errorPayload);
    expect(firstUrl).toBe('https://github.com/Rishabh-Chandrode/crm/issues/102');
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Second occurrence of same error immediately after
    const secondUrl = await githubIssueService.reportError(errorPayload);
    expect(secondUrl).toBe('https://github.com/Rishabh-Chandrode/crm/issues/102');

    // Should NOT have made additional fetch calls due to in-memory fingerprint cache
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('discovers open existing issues on GitHub and does not create duplicates', async () => {
    vi.spyOn(githubIssueService, 'isConfigured').mockReturnValue(true);

    const errorPayload = {
      message: 'Unique unhandled failure',
      errorName: 'UniqueError',
      stackTrace: 'UniqueError: Boom\n    at run (/worker.ts:5:5)',
      path: '/api/worker',
    };

    const fingerprint = githubIssueService.generateFingerprint(errorPayload);

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          title: `[CRM Bug] UniqueError: Unique failure [CRM-ERR-${fingerprint}]`,
          html_url: 'https://github.com/Rishabh-Chandrode/crm/issues/99',
        },
      ],
    } as any);

    global.fetch = mockFetch;

    const issueUrl = await githubIssueService.reportError(errorPayload);
    expect(issueUrl).toBe('https://github.com/Rishabh-Chandrode/crm/issues/99');
    // Only search was called, create was NOT called!
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
