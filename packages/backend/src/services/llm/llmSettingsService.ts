import { pool } from '../../db/index.js';
import type {
  LlmConfigSettings,
  UpdateLlmConfigPayload,
  TestLlmConnectionPayload,
  TestLlmConnectionResult,
  LlmProviderType,
} from '../../types/index.js';
import { GeminiProvider } from './providers/geminiProvider.js';
import { OpenAiProvider } from './providers/openaiProvider.js';
import { LlmProviderFactory } from './factory.js';

const SETTINGS_KEYS = [
  'llm_enabled',
  'llm_provider',
  'llm_model',
  'llm_temperature',
  'llm_max_tokens',
  'gemini_api_key',
  'openai_api_key',
] as const;

function maskApiKey(key: string | null | undefined): string | undefined {
  if (!key || typeof key !== 'string') return undefined;
  const trimmed = key.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= 8) return '••••••••';
  return `••••••••${trimmed.slice(-4)}`;
}

export interface RawLlmSettings {
  enabled: boolean;
  provider: LlmProviderType;
  model: string;
  temperature: number;
  maxTokens: number;
  geminiApiKey: string;
  openaiApiKey: string;
}

export class LlmSettingsService {
  /**
   * Retrieves raw unmasked settings for internal engine use.
   * All LLM settings are managed via the settings table in PostgreSQL.
   */
  async getRawSettings(): Promise<RawLlmSettings> {
    const res = await pool.query<{ key: string; value: string }>(
      `SELECT key, value FROM settings WHERE key = ANY($1)`,
      [SETTINGS_KEYS]
    );

    const map = new Map<string, string>();
    for (const row of res.rows) {
      map.set(row.key, row.value);
    }

    const enabled = map.has('llm_enabled')
      ? map.get('llm_enabled') === 'true'
      : true;

    const providerRaw = map.get('llm_provider') ?? 'gemini';
    const provider: LlmProviderType =
      providerRaw === 'openai' || providerRaw === 'disabled' ? providerRaw : 'gemini';

    const defaultModel = provider === 'openai' ? 'gpt-4o-mini' : 'gemini-3.8-flash';
    const model = (map.get('llm_model') || defaultModel).trim();

    const tempParsed = parseFloat(map.get('llm_temperature') ?? '0.2');
    const temperature = Number.isFinite(tempParsed) && tempParsed >= 0 && tempParsed <= 1 ? tempParsed : 0.2;

    const tokensParsed = parseInt(map.get('llm_max_tokens') ?? '2048', 10);
    const maxTokens = Number.isFinite(tokensParsed) && tokensParsed > 0 ? tokensParsed : 2048;

    const geminiApiKey = (map.get('gemini_api_key') ?? '').trim();
    const openaiApiKey = (map.get('openai_api_key') ?? '').trim();

    return {
      enabled,
      provider,
      model,
      temperature,
      maxTokens,
      geminiApiKey,
      openaiApiKey,
    };
  }

  /**
   * Retrieves sanitized LLM settings with masked API keys for the Admin Panel UI.
   */
  async getSettings(): Promise<LlmConfigSettings> {
    const raw = await this.getRawSettings();

    return {
      enabled: raw.enabled,
      provider: raw.provider,
      model: raw.model,
      temperature: raw.temperature,
      maxTokens: raw.maxTokens,
      hasGeminiKey: Boolean(raw.geminiApiKey),
      hasOpenAiKey: Boolean(raw.openaiApiKey),
      geminiApiKeyMasked: maskApiKey(raw.geminiApiKey),
      openaiApiKeyMasked: maskApiKey(raw.openaiApiKey),
    };
  }

  /**
   * Persists updated LLM settings into the settings table and triggers factory cache refresh.
   */
  async updateSettings(payload: UpdateLlmConfigPayload): Promise<LlmConfigSettings> {
    const updates: Array<{ key: string; value: string }> = [];

    if (typeof payload.enabled === 'boolean') {
      updates.push({ key: 'llm_enabled', value: payload.enabled ? 'true' : 'false' });
    }

    if (payload.provider && ['gemini', 'openai', 'disabled'].includes(payload.provider)) {
      updates.push({ key: 'llm_provider', value: payload.provider });
    }

    if (typeof payload.model === 'string' && payload.model.trim()) {
      updates.push({ key: 'llm_model', value: payload.model.trim() });
    }

    if (typeof payload.temperature === 'number' && payload.temperature >= 0 && payload.temperature <= 1) {
      updates.push({ key: 'llm_temperature', value: payload.temperature.toString() });
    }

    if (typeof payload.maxTokens === 'number' && payload.maxTokens > 0) {
      updates.push({ key: 'llm_max_tokens', value: Math.min(32000, payload.maxTokens).toString() });
    }

    if (typeof payload.geminiApiKey === 'string') {
      const trimmed = payload.geminiApiKey.trim();
      if (trimmed) {
        updates.push({ key: 'gemini_api_key', value: trimmed });
      }
    }

    if (typeof payload.openaiApiKey === 'string') {
      const trimmed = payload.openaiApiKey.trim();
      if (trimmed) {
        updates.push({ key: 'openai_api_key', value: trimmed });
      }
    }

    for (const { key, value } of updates) {
      await pool.query(
        `INSERT INTO settings (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value]
      );
    }

    // Immediately reload factory cache with newly persisted settings
    await LlmProviderFactory.refresh();

    return this.getSettings();
  }

  /**
   * Live test execution against the specified or currently configured LLM provider.
   */
  async testConnection(payload: TestLlmConnectionPayload = {}): Promise<TestLlmConnectionResult> {
    const raw = await this.getRawSettings();
    const providerType = payload.provider || raw.provider;

    if (providerType === 'disabled') {
      return {
        success: false,
        error: 'Cannot test connection because LLM provider is set to disabled.',
      };
    }

    let apiKey = payload.apiKey?.trim();
    if (!apiKey) {
      apiKey = providerType === 'openai' ? raw.openaiApiKey : raw.geminiApiKey;
    }

    if (!apiKey) {
      return {
        success: false,
        error: `No API key provided or configured for ${providerType}.`,
      };
    }

    const model = payload.model?.trim() || raw.model;
    const testPrompt = 'Respond with "LLM connection successful."';
    const startTime = Date.now();

    try {
      if (providerType === 'openai') {
        const testProvider = new OpenAiProvider({ apiKey, defaultModel: model });
        const result = await testProvider.generateText(testPrompt, undefined, {
          model,
          temperature: 0.1,
          maxTokens: 50,
        });

        const latencyMs = Date.now() - startTime;
        if (!result) {
          return {
            success: false,
            error: 'OpenAI returned an empty or failed response. Please check your API key and model name.',
          };
        }

        return {
          success: true,
          latencyMs,
          message: result,
        };
      }

      // Gemini provider
      const testProvider = new GeminiProvider({ apiKey, defaultModel: model });
      const result = await testProvider.generateText(testPrompt, undefined, {
        model,
        temperature: 0.1,
        maxTokens: 50,
      });

      const latencyMs = Date.now() - startTime;
      if (!result) {
        return {
          success: false,
          error: 'Gemini returned an empty or failed response. Please check your API key and model name.',
        };
      }

      return {
        success: true,
        latencyMs,
        message: result,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Connection test failed: ${errMsg}`,
      };
    }
  }
}

export const llmSettingsService = new LlmSettingsService();
