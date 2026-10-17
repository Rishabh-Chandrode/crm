export interface LlmCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface ILlmProvider {
  readonly name: string;
  isAvailable(): boolean;
  generateText(prompt: string, systemPrompt?: string, options?: LlmCompletionOptions): Promise<string | null>;
  generateJson<T>(prompt: string, systemPrompt?: string, options?: LlmCompletionOptions): Promise<T | null>;
}
