import { pool } from '../db/index.js';
import { githubIssueService } from './githubIssueService.js';
import type {
  SystemLog,
  SystemLogLevel,
  SystemLogsFilter,
  SystemLogsResponse,
  SystemLogStats,
} from '../types/index.js';

interface LogOptions {
  source?: string;
  context?: Record<string, unknown>;
  errorName?: string;
  stackTrace?: string;
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  userId?: string;
  ip?: string;
  skipGithubIssue?: boolean;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'new_password',
  'old_password',
  'confirm_password',
  'token',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'id_token',
  'idtoken',
  'jwt',
  'crm_token',
  'crmtoken',
  'google_token',
  'googletoken',
  'app_password',
  'apppassword',
  'authorization',
  'auth',
  'secret',
  'client_secret',
  'clientsecret',
  'secret_key',
  'secretkey',
  'private_key',
  'privatekey',
  'cookie',
  'credentials',
  'api_key',
  'apikey',
  'session',
  'session_token',
  'sessiontoken',
]);

export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (SENSITIVE_KEYS.has(lower)) return true;

  // Non-sensitive token count & limit parameters commonly found in LLM configurations & responses
  if (
    lower.endsWith('tokens') ||
    lower.endsWith('tokencount') ||
    lower.includes('tokencount') ||
    lower === 'maxtokens' ||
    lower === 'maxoutputtokens'
  ) {
    return false;
  }

  if (
    lower.includes('password') ||
    lower.includes('secret') ||
    lower.includes('token') ||
    lower.includes('apikey') ||
    lower.includes('api_key') ||
    lower.includes('credential')
  ) {
    return true;
  }
  return false;
}

/**
 * Recursively redacts sensitive keys from log context.
 */
export function sanitizeLogData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeLogData(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

/**
 * Recursively truncates large strings and large arrays/objects
 * to prevent excessive payload sizes in Postgres JSONB logs.
 */
export function truncatePayload(data: unknown, maxDepth = 10): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    if (data.length > 10000) {
      return data.slice(0, 10000) + '... [TRUNCATED]';
    }
    return data;
  }
  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }
  if (Array.isArray(data)) {
    const MAX_ITEMS = 50;
    const items = data.slice(0, MAX_ITEMS).map((item) => truncatePayload(item, maxDepth - 1));
    if (data.length > MAX_ITEMS) {
      items.push(`[... ${data.length - MAX_ITEMS} more items truncated]`);
    }
    return items;
  }
  if (typeof data === 'object') {
    if (maxDepth <= 0) return '[Object truncated: max depth]';
    const result: Record<string, unknown> = {};
    const entries = Object.entries(data as Record<string, unknown>);
    const MAX_KEYS = 50;
    for (const [k, v] of entries.slice(0, MAX_KEYS)) {
      result[k] = truncatePayload(v, maxDepth - 1);
    }
    if (entries.length > MAX_KEYS) {
      result['__truncated_keys_count__'] = entries.length - MAX_KEYS;
    }
    return result;
  }
  return String(data);
}

export class SystemLoggerService {
  /**
   * Persists a log entry to database asynchronously.
   * Never throws — falls back to console.error on failure to avoid disrupting application flow.
   */
  async log(
    level: SystemLogLevel,
    message: string,
    options: LogOptions = {}
  ): Promise<void> {
    try {
      const sanitizedContext = options.context ? (sanitizeLogData(options.context) as Record<string, unknown>) : null;
      const source = options.source || 'backend';

      const isValidUuid = typeof options.userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.userId);
      const userIdParam = isValidUuid ? options.userId : null;

      if (options.userId && !isValidUuid && sanitizedContext) {
        sanitizedContext['raw_user_id'] = options.userId;
      }

      const res = await pool.query<{ id: string }>(
        `INSERT INTO system_logs (
          level, message, source, context, error_name, stack_trace,
          request_id, method, path, status_code, user_id, ip
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          level,
          message,
          source,
          sanitizedContext ? JSON.stringify(sanitizedContext) : null,
          options.errorName || null,
          options.stackTrace || null,
          options.requestId || null,
          options.method || null,
          options.path || null,
          options.statusCode || null,
          userIdParam,
          options.ip || null,
        ]
      );

      const logId = res.rows[0]?.id;

      if (level === 'error' && !options.skipGithubIssue && githubIssueService.isConfigured()) {
        void githubIssueService.reportError({
          logId,
          message,
          errorName: options.errorName,
          stackTrace: options.stackTrace,
          path: options.path,
          method: options.method,
          statusCode: options.statusCode,
          userId: options.userId,
          ip: options.ip,
          context: options.context,
        });
      }
    } catch (dbErr) {
      // Fallback: Ensure log is not lost even if database insert fails
      console.error('[SystemLogger DB Write Error]', dbErr);
      console.error(`[${level.toUpperCase()}] ${message}`, options);
    }
  }

  info(message: string, options: LogOptions = {}): void {
    // Fire-and-forget to keep non-blocking
    void this.log('info', message, options);
  }

  warn(message: string, options: LogOptions = {}): void {
    void this.log('warn', message, options);
  }

  error(message: string, err?: unknown, options: LogOptions = {}): void {
    let errorName = options.errorName;
    let stackTrace = options.stackTrace;

    if (err instanceof Error) {
      errorName = errorName || err.name;
      stackTrace = stackTrace || err.stack;
    } else if (typeof err === 'string') {
      stackTrace = stackTrace || err;
    }

    void this.log('error', message, {
      ...options,
      errorName,
      stackTrace,
    });
  }

  debug(message: string, options: LogOptions = {}): void {
    void this.log('debug', message, options);
  }

  /**
   * Retrieves paginated system logs with optional filtering.
   */
  async getLogs(filter: SystemLogsFilter = {}): Promise<SystemLogsResponse> {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 25));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter.level) {
      conditions.push(`level = $${paramIndex++}`);
      values.push(filter.level);
    }

    if (filter.source) {
      conditions.push(`source = $${paramIndex++}`);
      values.push(filter.source);
    }

    if (filter.search) {
      conditions.push(`(message ILIKE $${paramIndex} OR error_name ILIKE $${paramIndex} OR path ILIKE $${paramIndex})`);
      values.push(`%${filter.search}%`);
      paramIndex++;
    }

    if (filter.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(filter.startDate);
    }

    if (filter.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(filter.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) AS total FROM system_logs ${whereClause}`;
    const countRes = await pool.query<{ total: string }>(countQuery, values);
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    const dataQuery = `
      SELECT id, level, message, source, context, error_name, stack_trace,
             request_id, method, path, status_code, user_id, ip, github_issue_url, created_at
      FROM system_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const dataRes = await pool.query<SystemLog>(dataQuery, [...values, limit, offset]);

    return {
      data: dataRes.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Retrieves log statistics (total, errors, warnings, info, last 24h).
   */
  async getStats(): Promise<SystemLogStats> {
    const res = await pool.query<{
      total: string;
      errors: string;
      warnings: string;
      info: string;
      last_24h: string;
    }>(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE level = 'error') AS errors,
        COUNT(*) FILTER (WHERE level = 'warn') AS warnings,
        COUNT(*) FILTER (WHERE level = 'info') AS info,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS last_24h
      FROM system_logs
    `);

    const row = res.rows[0];
    return {
      total: parseInt(row?.total || '0', 10),
      errors: parseInt(row?.errors || '0', 10),
      warnings: parseInt(row?.warnings || '0', 10),
      info: parseInt(row?.info || '0', 10),
      last24Hours: parseInt(row?.last_24h || '0', 10),
    };
  }

  /**
   * Prunes logs older than retentionDays (default: 30 days).
   */
  async pruneOldLogs(retentionDays = 30): Promise<number> {
    const res = await pool.query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM system_logs
         WHERE created_at < NOW() - ($1 || ' days')::INTERVAL
         RETURNING id
       )
       SELECT COUNT(*) AS count FROM deleted`,
      [retentionDays]
    );

    const deletedCount = parseInt(res.rows[0]?.count || '0', 10);
    if (deletedCount > 0) {
      console.log(`[SystemLogger] Pruned ${deletedCount} logs older than ${retentionDays} days`);
    }
    return deletedCount;
  }

  /**
   * Clears logs, optionally before a specific date.
   */
  async clearLogs(beforeDate?: Date): Promise<number> {
    let query = 'DELETE FROM system_logs RETURNING id';
    const params: unknown[] = [];

    if (beforeDate) {
      query = 'DELETE FROM system_logs WHERE created_at <= $1 RETURNING id';
      params.push(beforeDate.toISOString());
    }

    const res = await pool.query(query, params);
    return res.rowCount || 0;
  }
}

export const systemLogger = new SystemLoggerService();
