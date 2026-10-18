import type { ILlmProvider, LlmCompletionOptions } from '../types.js';
import type { SystemLogLevel } from '../../../types/index.js';
import { systemLogger, truncatePayload } from '../../systemLogger.js';

export interface GeminiProviderConfig {
  apiKey: string;
  defaultModel?: string;
}

export class GeminiProvider implements ILlmProvider {
  readonly name = 'gemini';
  private readonly apiKey: string;
  private readonly defaultModel: string;

  constructor(config: GeminiProviderConfig) {
    this.apiKey = config.apiKey.trim();
    this.defaultModel = config.defaultModel || 'gemini-3.8-flash';
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0);
  }

  private logGeminiCall(
    model: string,
    requestBody: unknown,
    responseBody: unknown,
    statusCode: number,
    durationMs: number,
    error?: string,
    purpose?: string
  ): void {
    const level: SystemLogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    const path = `/v1beta/models/${model}:generateContent`;
    const purposeTag = purpose ? ` [${purpose}]` : '';
    const message = error
      ? `Gemini API${purposeTag} POST /models/${model}:generateContent error: ${error} (${durationMs}ms)`
      : `Gemini API${purposeTag} POST /models/${model}:generateContent ${statusCode} (${durationMs}ms)`;

    void systemLogger.log(level, message, {
      source: 'gemini',
      method: 'POST',
      path,
      statusCode,
      context: {
        purpose,
        durationMs,
        model,
        requestBody: truncatePayload(requestBody),
        responseBody: truncatePayload(responseBody),
      },
      skipGithubIssue: true,
    });
  }

  async generateText(
    prompt: string,
    systemPrompt?: string,
    options?: LlmCompletionOptions
  ): Promise<string | null> {
    if (!this.isAvailable()) return null;

    const model = options?.model || this.defaultModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const contents = [];
    if (systemPrompt) {
      contents.push({
        role: 'user',
        parts: [{ text: `System Instruction:\n${systemPrompt}` }],
      });
      contents.push({
        role: 'model',
        parts: [{ text: 'Understood. I will strictly follow these instructions.' }],
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: prompt }],
    });

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.2,
        maxOutputTokens: options?.maxTokens ?? 2048,
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const startTime = Date.now();

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const durationMs = Date.now() - startTime;

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.warn(`[GeminiProvider] API error HTTP ${res.status}: ${errorText.slice(0, 300)}`);
        let errorPayload: unknown = errorText;
        try {
          errorPayload = JSON.parse(errorText);
        } catch {
          // keep as string
        }
        this.logGeminiCall(model, body, errorPayload, res.status, durationMs, undefined, options?.purpose);
        return null;
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      this.logGeminiCall(model, body, data, res.status, durationMs, undefined, options?.purpose);

      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      return text ? text.trim() : null;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('[GeminiProvider] Network or timeout error:', errMsg);
      this.logGeminiCall(model, body, { error: errMsg }, 500, durationMs, errMsg, options?.purpose);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateJson<T>(
    prompt: string,
    systemPrompt?: string,
    options?: LlmCompletionOptions
  ): Promise<T | null> {
    if (!this.isAvailable()) return null;

    const model = options?.model || this.defaultModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const contents = [];
    if (systemPrompt) {
      contents.push({
        role: 'user',
        parts: [{ text: `System Instruction:\n${systemPrompt}\nIMPORTANT: Output MUST be valid JSON only without markdown code fences.` }],
      });
      contents.push({
        role: 'model',
        parts: [{ text: 'Understood. I will return strictly raw JSON.' }],
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: prompt }],
    });

    const body = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.1,
        maxOutputTokens: options?.maxTokens ?? 2048,
        responseMimeType: 'application/json',
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const startTime = Date.now();

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const durationMs = Date.now() - startTime;

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.warn(`[GeminiProvider] API error HTTP ${res.status}: ${errorText.slice(0, 300)}`);
        let errorPayload: unknown = errorText;
        try {
          errorPayload = JSON.parse(errorText);
        } catch {
          // keep as string
        }
        this.logGeminiCall(model, body, errorPayload, res.status, durationMs, undefined, options?.purpose);
        return null;
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      this.logGeminiCall(model, body, data, res.status, durationMs, undefined, options?.purpose);

      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) return null;

      const cleanJson = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      return JSON.parse(cleanJson) as T;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('[GeminiProvider] JSON parse or network error:', errMsg);
      this.logGeminiCall(model, body, { error: errMsg }, 500, durationMs, errMsg, options?.purpose);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
