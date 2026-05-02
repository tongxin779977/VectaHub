import type {
  LLMConfig,
  LLMProvider,
  Message,
  LLMRequestOptions,
  LLMResponse,
  ConversationContext,
  OutputFormat
} from './types.js';
import { validateOutput, extractCleanOutput, createRetryPrompt } from './validator.js';

export function createDialogController(
  defaultConfig: LLMConfig,
  defaultOptions?: Partial<LLMRequestOptions>
) {
  const activeSessions = new Map<string, ConversationContext>();
  
  function createSession(sessionId: string, scope: string, maxHistoryLength: number = 10): ConversationContext {
    const context: ConversationContext = {
      sessionId,
      messages: [],
      maxHistoryLength,
      scope,
      createdAt: new Date()
    };
    activeSessions.set(sessionId, context);
    return context;
  }
  
  function getSession(sessionId: string): ConversationContext | undefined {
    return activeSessions.get(sessionId);
  }
  
  function closeSession(sessionId: string): void {
    activeSessions.delete(sessionId);
  }
  
  function addMessage(sessionId: string, message: Message): void {
    const context = activeSessions.get(sessionId);
    if (context) {
      context.messages.push(message);
      if (context.messages.length > context.maxHistoryLength) {
        context.messages = context.messages.slice(-context.maxHistoryLength);
      }
    }
  }
  
  async function executeWithRetry(
    prompt: string,
    options: LLMRequestOptions & { config?: LLMConfig; sessionId?: string; systemPrompt?: string }
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    const config = options.config || defaultConfig;
    let attempt = 0;
    let lastError: string | undefined;
    let currentPrompt = prompt;
    
    while (attempt < options.maxRetries) {
      attempt++;
      
      try {
        const response = await callLLM(config, currentPrompt, options.format, options.systemPrompt);
        
        if (options.validateOutput) {
          const validation = validateOutput(response, options.format);
          if (!validation.valid) {
            lastError = validation.error;
            currentPrompt = createRetryPrompt(prompt, validation.error!, attempt);
            continue;
          }
        }
        
        const cleanOutput = extractCleanOutput(response, options.format);
        
        const duration = Date.now() - startTime;
        
        if (options.sessionId) {
          if (!activeSessions.has(options.sessionId)) {
            createSession(options.sessionId, 'default', 10);
          }
          if (options.systemPrompt) {
            addMessage(options.sessionId, { role: 'system', content: options.systemPrompt });
          }
          addMessage(options.sessionId, { role: 'user', content: prompt });
          addMessage(options.sessionId, { role: 'assistant', content: cleanOutput });
        }
        
        return {
          success: true,
          output: cleanOutput,
          rawResponse: response,
          attemptCount: attempt,
          duration
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt < options.maxRetries) {
          currentPrompt = createRetryPrompt(prompt, lastError, attempt);
          await sleep(100 * attempt);
        }
      }
    }
    
    const duration = Date.now() - startTime;
    
    return {
      success: false,
      output: '',
      rawResponse: '',
      attemptCount: attempt,
      duration,
      error: `Failed after ${attempt} attempts. Last error: ${lastError}`
    };
  }
  
  async function callLLM(
    config: LLMConfig,
    prompt: string,
    format: OutputFormat,
    systemPrompt?: string
  ): Promise<string> {
    const messages: Message[] = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    messages.push({ role: 'user', content: prompt });
    
    if (config.provider === 'openai' || config.provider === 'ollama' || config.provider === 'groq') {
      return callOpenAICompatible(config, messages);
    } else if (config.provider === 'anthropic') {
      return callAnthropic(config, messages);
    } else {
      throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }
  
  async function callOpenAICompatible(
    config: LLMConfig,
    messages: Message[]
  ): Promise<string> {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY || process.env.OLLAMA_API_KEY;
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature || 0.3,
        max_tokens: config.maxTokens || 2048
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || '';
  }
  
  async function callAnthropic(
    config: LLMConfig,
    messages: Message[]
  ): Promise<string> {
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens || 2048,
        ...(systemMessage ? { system: systemMessage.content } : {}),
        messages: userMessages
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json() as any;
    return data.content?.[0]?.text || '';
  }
  
  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  return {
    createSession,
    getSession,
    closeSession,
    addMessage,
    executeWithRetry
  };
}

export type DialogController = ReturnType<typeof createDialogController>;
