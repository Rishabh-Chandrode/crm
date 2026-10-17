import type { ILlmProvider } from './types.js';
import type { LlmProviderType } from '../../types/index.js';
import { NullLlmProvider } from './providers/nullProvider.js';
import { GeminiProvider } from './providers/geminiProvider.js';
import { OpenAiProvider } from './providers/openaiProvider.js';

export interface CachedLlmConfig {
  enabled: boolean;
  provider: LlmProviderType;
  apiKey: string;
  defaultModel: string;
  temperature?: number;
  maxTokens?: number;
}

export class LlmProviderFactory {
  private static instance: ILlmProvider | null = null;
  private static cachedConfig: CachedLlmConfig | null = null;

  public static setCachedConfig(config: CachedLlmConfig | null): void {
    this.cachedConfig = config;
    this.instance = null;
  }

  public static async refresh(): Promise<void> {
    const { llmSettingsService } = await import('./llmSettingsService.js');
    const raw = await llmSettingsService.getRawSettings();
    const apiKey = raw.provider === 'openai' ? raw.openaiApiKey : raw.geminiApiKey;

    this.cachedConfig = {
      enabled: raw.enabled,
      provider: raw.provider,
      apiKey,
      defaultModel: raw.model,
      temperature: raw.temperature,
      maxTokens: raw.maxTokens,
    };
    this.instance = null;
  }

  public static getProvider(): ILlmProvider {
    if (this.instance) {
      return this.instance;
    }

    // 1. If dynamic database-backed cached config is loaded, use it
    if (this.cachedConfig) {
      if (!this.cachedConfig.enabled || this.cachedConfig.provider === 'disabled' || !this.cachedConfig.apiKey) {
        this.instance = new NullLlmProvider();
        return this.instance;
      }

      if (this.cachedConfig.provider === 'openai') {
        this.instance = new OpenAiProvider({
          apiKey: this.cachedConfig.apiKey,
          defaultModel: this.cachedConfig.defaultModel || 'gpt-4o-mini',
        });
        return this.instance;
      }

      this.instance = new GeminiProvider({
        apiKey: this.cachedConfig.apiKey,
        defaultModel: this.cachedConfig.defaultModel || 'gemini-3.8-flash',
      });
      return this.instance;
    }

    // 2. Default to NullLlmProvider if database config has not been initialized or keys not set
    this.instance = new NullLlmProvider();
    return this.instance;
  }

  /**
   * For testing or dynamic reconfiguration at runtime.
   */
  public static setProvider(provider: ILlmProvider | null): void {
    this.instance = provider;
  }

  public static reset(): void {
    this.instance = null;
    this.cachedConfig = null;
  }
}
