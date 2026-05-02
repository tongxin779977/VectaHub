export * from './types.js';
export { validateOutput, extractCleanOutput, createRetryPrompt } from './validator.js';
export { createDialogController } from './dialog-controller.js';
export type { DialogController } from './dialog-controller.js';

import { createDialogController } from './dialog-controller.js';
import type {
  LLMConfig,
  LLMRequestOptions,
  OutputFormat,
  LLMResponse
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

export function createLLMDialogControlSkill(
  config?: Partial<LLMConfig>,
  options?: Partial<LLMRequestOptions>
) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  
  const controller = createDialogController(mergedConfig, mergedOptions);
  
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
  
  function createSession(sessionId: string, scope: string = 'default', maxHistoryLength: number = 10) {
    return controller.createSession(sessionId, scope, maxHistoryLength);
  }
  
  function getSession(sessionId: string) {
    return controller.getSession(sessionId);
  }
  
  function closeSession(sessionId: string) {
    return controller.closeSession(sessionId);
  }
  
  function getConfig() {
    return mergedConfig;
  }
  
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

export default createLLMDialogControlSkill;
