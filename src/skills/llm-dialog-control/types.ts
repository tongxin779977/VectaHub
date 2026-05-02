export type LLMProvider = 'openai' | 'anthropic' | 'ollama' | 'groq';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ConversationContext {
  sessionId: string;
  messages: Message[];
  maxHistoryLength: number;
  scope: string;
  createdAt: Date;
}

export interface OutputFormat {
  type: 'json' | 'yaml' | 'text';
  schema?: string;
  validation?: (output: string) => boolean;
}

export interface LLMRequestOptions {
  maxRetries: number;
  timeout: number;
  validateOutput: boolean;
  format: OutputFormat;
}

export interface LLMResponse {
  success: boolean;
  output: string;
  rawResponse: string;
  attemptCount: number;
  duration: number;
  validationError?: string;
  error?: string;
}

export interface DialogControlConfig {
  defaultProvider: LLMProvider;
  defaultModel: string;
  maxRetries: number;
  defaultTimeout: number;
  maxHistoryLength: number;
  strictOutput: boolean;
  enabledScopes: string[];
}

export type ValidationResult = {
  valid: boolean;
  error?: string;
};
