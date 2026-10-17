import { CONFIG } from '../../config.js';
import type { ILlmProvider } from './types.js';
import { NullLlmProvider } from './providers/nullProvider.js';
import { GeminiProvider } from './providers/geminiProvider.js';
import { OpenAiProvider } from './providers/openaiProvider.js';

export class LlmProviderFactory {
  private static instance: ILlmProvider | null = null;

  public static getProvider(): ILlmProvider {
    if (this.instance) {
      return this.instance;
    }

    if (!CONFIG.llmEnabled || CONFIG.llmProvider === 'disabled') {
      this.instance = new NullLlmProvider();
      return this.instance;
    }

    switch (CONFIG.llmProvider.toLowerCase()) {
      case 'openai':
        if (CONFIG.openaiApiKey) {
          this.instance = new OpenAiProvider({
            apiKey: CONFIG.openaiApiKey,
            defaultModel: CONFIG.llmModel || 'gpt-4o-mini',
          });
        } else {
          this.instance = new NullLlmProvider();
        }
        break;

      case 'gemini':
      default:
        if (CONFIG.geminiApiKey) {
          this.instance = new GeminiProvider({
            apiKey: CONFIG.geminiApiKey,
            defaultModel: CONFIG.llmModel || 'gemini-2.5-flash',
          });
        } else {
          this.instance = new NullLlmProvider();
        }
        break;
    }

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
  }
}
