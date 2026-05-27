export * from './types.js';
export { validateOutput, extractCleanOutput, createRetryPrompt } from './validator.js';
export { createDialogController } from './dialog-controller.js';
export type { DialogController } from './dialog-controller.js';
export { httpRequest } from './http-client.js';

import { createDialogController } from './dialog-controller.js';
import type {
  LLMConfig,
  LLMRequestOptions,
  LLMResponse,
} from './types.js';

const DEFAULT_CONFIG: LLMConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  temperature: 0.3
};

const DEFAULT_OPTIONS: LLMRequestOptions = {
  maxRetries: 3,
  timeout: 30000,
  validateOutput: true,
  format: { type: 'text' }
};

/**
 * Creates an LLM Dialog Control skill
 * @param config - Partial LLM configuration
 * @param options - Partial LLM request options
 * @returns LLMDialogControlSkill instance
 */
export function createLLMDialogControlSkill(
  config?: Partial<LLMConfig>,
  options?: Partial<LLMRequestOptions>
) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  
  const controller = createDialogController(mergedConfig, mergedOptions);
  
  /**
   * Generates JSON output from the LLM
   * @param prompt - The user prompt
   * @param systemPrompt - Optional system prompt
   * @param customOptions - Optional custom request options
   * @returns LLMResponse with JSON output
   */
  async function generateJSON(
    prompt: string,
    systemPrompt?: string,
    customOptions?: Partial<LLMRequestOptions>
  ): Promise<LLMResponse> {
    const options: LLMRequestOptions = {
      ...mergedOptions,
      ...customOptions,
      format: { type: 'json' }
    };
    
    return controller.executeWithRetry(prompt, {
      ...options,
      systemPrompt,
      config: mergedConfig
    });
  }
  
  /**
   * Generates YAML output from the LLM
   * @param prompt - The user prompt
   * @param systemPrompt - Optional system prompt
   * @param customOptions - Optional custom request options
   * @returns LLMResponse with YAML output
   */
  async function generateYAML(
    prompt: string,
    systemPrompt?: string,
    customOptions?: Partial<LLMRequestOptions>
  ): Promise<LLMResponse> {
    const options: LLMRequestOptions = {
      ...mergedOptions,
      ...customOptions,
      format: { type: 'yaml' }
    };
    
    return controller.executeWithRetry(prompt, {
      ...options,
      systemPrompt,
      config: mergedConfig
    });
  }
  
  /**
   * Generates text output from the LLM
   * @param prompt - The user prompt
   * @param systemPrompt - Optional system prompt
   * @param customOptions - Optional custom request options with validation
   * @returns LLMResponse with text output
   */
  async function generateText(
    prompt: string,
    systemPrompt?: string,
    customOptions?: Partial<LLMRequestOptions> & { validation?: (text: string) => boolean }
  ): Promise<LLMResponse> {
    const { validation, ...restOptions } = customOptions || {};
    const options: LLMRequestOptions = {
      ...mergedOptions,
      ...restOptions,
      format: { type: 'text', validation }
    };
    
    return controller.executeWithRetry(prompt, {
      ...options,
      systemPrompt,
      config: mergedConfig
    });
  }
  
  /**
   * Creates a new conversation session
   * @param sessionId - Unique session identifier
   * @param scope - Session scope (default: 'default')
   * @param maxHistoryLength - Maximum number of messages to keep in history (default: 10)
   * @returns ConversationContext instance
   */
  function createSession(sessionId: string, scope: string = 'default', maxHistoryLength: number = 10) {
    return controller.createSession(sessionId, scope, maxHistoryLength);
  }
  
  /**
   * Gets an existing conversation session
   * @param sessionId - Unique session identifier
   * @returns ConversationContext or undefined if not found
   */
  function getSession(sessionId: string) {
    return controller.getSession(sessionId);
  }
  
  /**
   * Closes a conversation session
   * @param sessionId - Unique session identifier
   */
  function closeSession(sessionId: string) {
    return controller.closeSession(sessionId);
  }
  
  /**
   * Gets the current LLM configuration
   * @returns LLMConfig instance
   */
  function getConfig() {
    return mergedConfig;
  }
  
  /**
   * Gets the current LLM request options
   * @returns LLMRequestOptions instance
   */
  function getOptions() {
    return mergedOptions;
  }
  
  return {
    generateJSON,
    generateYAML,
    generateText,
    createSession,
    getSession,
    closeSession,
    getConfig,
    getOptions,
    controller
  };
}

export type LLMDialogControlSkill = ReturnType<typeof createLLMDialogControlSkill>;
