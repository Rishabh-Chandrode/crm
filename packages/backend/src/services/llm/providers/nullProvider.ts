import type { ILlmProvider, LlmCompletionOptions } from '../types.js';

/**
 * Null Object implementation of ILlmProvider.
 * Used when LLM is disabled, set to 'disabled', or has missing credentials.
 * Ensures the system never crashes and enables transparent heuristic fallback.
 */
export class NullLlmProvider implements ILlmProvider {
  readonly name = 'disabled';

  isAvailable(): boolean {
    return false;
  }

  async generateText(
    _prompt: string,
    _systemPrompt?: string,
    _options?: LlmCompletionOptions
  ): Promise<string | null> {
    return null;
  }

  async generateJson<T>(
    _prompt: string,
    _systemPrompt?: string,
    _options?: LlmCompletionOptions
  ): Promise<T | null> {
    return null;
  }
}
