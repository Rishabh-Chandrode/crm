import type { ILlmProvider, LlmCompletionOptions } from '../types.js';

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
    this.defaultModel = config.defaultModel || 'gemini-2.5-flash';
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0);
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

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.warn(`[GeminiProvider] API error HTTP ${res.status}: ${errorText.slice(0, 300)}`);
        return null;
      }

      const data = await res.json() as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      return text ? text.trim() : null;
    } catch (err) {
      console.warn('[GeminiProvider] Network or timeout error:', err instanceof Error ? err.message : err);
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

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.warn(`[GeminiProvider] API error HTTP ${res.status}: ${errorText.slice(0, 300)}`);
        return null;
      }

      const data = await res.json() as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) return null;

      const cleanJson = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      return JSON.parse(cleanJson) as T;
    } catch (err) {
      console.warn('[GeminiProvider] JSON parse or network error:', err instanceof Error ? err.message : err);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
