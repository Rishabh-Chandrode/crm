import type { ILlmProvider, LlmCompletionOptions } from '../types.js';

export interface OpenAiProviderConfig {
  apiKey: string;
  defaultModel?: string;
  baseUrl?: string;
}

export class OpenAiProvider implements ILlmProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl: string;

  constructor(config: OpenAiProviderConfig) {
    this.apiKey = config.apiKey.trim();
    this.defaultModel = config.defaultModel || 'gpt-4o-mini';
    this.baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
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

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options?.model || this.defaultModel,
          messages,
          temperature: options?.temperature ?? 0.2,
          max_tokens: options?.maxTokens ?? 2048,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.warn(`[OpenAiProvider] API error HTTP ${res.status}: ${errorText.slice(0, 300)}`);
        return null;
      }

      const data = await res.json() as {
        choices?: Array<{
          message?: { content?: string };
        }>;
      };

      const content = data.choices?.[0]?.message?.content;
      return content ? content.trim() : null;
    } catch (err) {
      console.warn('[OpenAiProvider] Network or timeout error:', err instanceof Error ? err.message : err);
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

    const messages = [];
    const effectiveSystemPrompt = [
      systemPrompt || '',
      'IMPORTANT: Respond ONLY with valid, raw JSON without any markdown formatting.',
    ].filter(Boolean).join('\n\n');

    messages.push({ role: 'system', content: effectiveSystemPrompt });
    messages.push({ role: 'user', content: prompt });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options?.model || this.defaultModel,
          messages,
          temperature: options?.temperature ?? 0.1,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.warn(`[OpenAiProvider] API error HTTP ${res.status}: ${errorText.slice(0, 300)}`);
        return null;
      }

      const data = await res.json() as {
        choices?: Array<{
          message?: { content?: string };
        }>;
      };

      const raw = data.choices?.[0]?.message?.content;
      if (!raw) return null;

      const cleanJson = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      return JSON.parse(cleanJson) as T;
    } catch (err) {
      console.warn('[OpenAiProvider] JSON parse or network error:', err instanceof Error ? err.message : err);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
