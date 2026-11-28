import { systemLogger, truncatePayload, isAutoTelemetryEnabled } from './systemLogger.js';

export interface LoggedFetchOptions extends RequestInit {
  source: string;
  purpose?: string;
  userId?: string;
  logResponseBody?: boolean;
}

/**
 * Wrapper around global fetch that measures latency and logs third-party API
 * requests and responses to systemLogger with automatic secret redaction.
 */
export async function loggedFetch(
  url: string,
  options: LoggedFetchOptions
): Promise<Response> {
  const { source, purpose, userId, logResponseBody = true, ...fetchInit } = options;
  const method = (fetchInit.method || 'GET').toUpperCase();
  const startTime = Date.now();

  let parsedPath = url;
  try {
    const u = new URL(url);
    parsedPath = `${u.origin}${u.pathname}`;
  } catch {
    // Keep raw string if URL parsing fails
  }

  let parsedReqBody: unknown;
  if (typeof fetchInit.body === 'string') {
    try {
      parsedReqBody = JSON.parse(fetchInit.body);
    } catch {
      parsedReqBody = fetchInit.body;
    }
  }

  try {
    const res = await fetch(url, fetchInit);
    const durationMs = Date.now() - startTime;
    const statusCode = typeof res.status === 'number' ? res.status : (res.ok ? 200 : 500);
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    let responsePreview: unknown;
    if (logResponseBody && typeof res.clone === 'function') {
      try {
        const cloned = res.clone();
        const text = await cloned.text();
        try {
          responsePreview = JSON.parse(text);
        } catch {
          responsePreview = text;
        }
      } catch {
        // Ignore clone/read failures on mocked responses
      }
    }

    const purposeTag = purpose ? ` [${purpose}]` : '';
    if (isAutoTelemetryEnabled()) {
      void systemLogger.log(
        level,
        `${source.toUpperCase()} API${purposeTag} ${method} ${parsedPath} ${statusCode} (${durationMs}ms)`,
        {
          source,
          method,
          path: parsedPath,
          statusCode,
          userId,
          skipGithubIssue: true,
          context: {
            purpose,
            durationMs,
            requestBody: parsedReqBody !== undefined ? truncatePayload(parsedReqBody) : undefined,
            responseBody: responsePreview !== undefined ? truncatePayload(responsePreview) : undefined,
          },
        }
      );
    }

    return res;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errMsg = err instanceof Error ? err.message : String(err);

    if (isAutoTelemetryEnabled()) {
      void systemLogger.log(
        'error',
        `${source.toUpperCase()} API${purpose ? ` [${purpose}]` : ''} ${method} ${parsedPath} failed: ${errMsg} (${durationMs}ms)`,
        {
          source,
          method,
          path: parsedPath,
          statusCode: 500,
          userId,
          errorName: err instanceof Error ? err.name : 'FetchError',
          stackTrace: err instanceof Error ? err.stack : undefined,
          skipGithubIssue: true,
          context: {
            purpose,
            durationMs,
            requestBody: parsedReqBody !== undefined ? truncatePayload(parsedReqBody) : undefined,
            error: errMsg,
          },
        }
      );
    }

    throw err;
  }
}
