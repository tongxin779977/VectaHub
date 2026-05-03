import { audit } from '../utils/audit.js';
import { getAllIntentNames } from './templates/index.js';
import createLLMDialogControlSkill from '../skills/llm-dialog-control/index.js';
import { loadConfig } from '../setup/first-run-wizard.js';
import {
  createPromptManager,
  DEFAULT_INTENT_PARSER_ID,
  DEFAULT_WORKFLOW_YAML_ID,
} from './prompt-manager.js';

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'groq';
  apiKey?: string;
  baseUrl?: string;
  model: string;
}

export interface LLMResponse {
  intent: string;
  confidence: number;
  params: Record<string, unknown>;
  workflow: {
    name: string;
    steps: {
      type: 'exec' | 'for_each' | 'if' | 'parallel';
      cli?: string;
      args?: string[];
      condition?: string;
      items?: string;
      body?: unknown[];
    }[];
  };
}

const INTENT_LIST = getAllIntentNames();

export class LLMClient {
  private config: LLMConfig;
  private sessionId?: string;
  private promptManager;

  constructor(config: LLMConfig) {
    this.config = config;
    this.promptManager = createPromptManager();
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
    // 确保创建会话
    this.promptManager.sessionManager.getOrCreateSession(sessionId);
  }

  // 便捷访问会话管理器
  get sessionManager() {
    return this.promptManager.sessionManager;
  }

  async complete(promptId: string, userInput: string, context?: Record<string, string>): Promise<LLMResponse> {
    const startTime = Date.now();

    try {
      const systemPrompt = this.promptManager.buildSystemPrompt(promptId, context, this.sessionId);
      // 记录用户消息
      if (this.sessionId) {
        this.promptManager.sessionManager.addUserMessage(this.sessionId, userInput);
      }
      let response: Response;

      if (this.config.provider === 'openai' || this.config.provider === 'ollama' || this.config.provider === 'groq') {
        response = await this.callOpenAICompatible(userInput, systemPrompt);
      } else if (this.config.provider === 'anthropic') {
        response = await this.callAnthropic(userInput, systemPrompt);
      } else {
        throw new Error(`Unsupported provider: ${this.config.provider}`);
      }

      const data = await response.json();
      const duration = Date.now() - startTime;

      audit.securityAction('LLM_CALL', `${this.config.provider}/${this.config.model}`, 'COMPLETED', this.sessionId || 'unknown');

      return this.parseResponse(data);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      audit.securityAction('LLM_CALL', `${this.config.provider}/${this.config.model}`, 'FAILED', this.sessionId || 'unknown');

      throw new Error(`LLM call failed: ${errorMessage}`);
    }
  }

  private async callOpenAICompatible(userInput: string, systemPrompt: string): Promise<Response> {
    let apiKey: string | undefined;
    if (this.config.provider === 'groq') {
      apiKey = this.config.apiKey || process.env.GROQ_API_KEY;
    } else if (this.config.provider === 'ollama') {
      apiKey = this.config.apiKey || process.env.OLLAMA_API_KEY;
    } else {
      apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
    }
    
    const baseUrl = this.config.baseUrl || (
      this.config.provider === 'groq' ? 'https://api.groq.com/openai/v1' :
      this.config.provider === 'ollama' ? 'http://localhost:11434/v1' :
      'https://api.openai.com/v1'
    );

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userInput },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    return response;
  }

  private async callAnthropic(userInput: string, systemPrompt: string): Promise<Response> {
    const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userInput },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    return response;
  }

  private parseResponse(data: unknown): LLMResponse {
    let content: string;

    if (this.config.provider === 'anthropic') {
      const anthropicData = data as { content?: { text?: string }[] };
      content = anthropicData.content?.[0]?.text || '';
    } else {
      const openAIData = data as { choices?: { message?: { content?: string } }[] };
      content = openAIData.choices?.[0]?.message?.content || '';
    }

    // 记录助手消息
    if (this.sessionId && content) {
      this.promptManager.sessionManager.addAssistantMessage(this.sessionId, content);
    }

    try {
      const parsed = JSON.parse(content) as LLMResponse;

      if (!parsed.intent || !INTENT_LIST.includes(parsed.intent)) {
        parsed.intent = 'UNKNOWN';
        parsed.confidence = 0;
      }

      return parsed;
    } catch {
      throw new Error(`Failed to parse LLM response as JSON: ${content.substring(0, 100)}...`);
    }
  }

  async generateYAMLWorkflow(userInput: string): Promise<string> {
    const systemPrompt = this.promptManager.buildSystemPrompt(DEFAULT_WORKFLOW_YAML_ID);
    const skill = createLLMDialogControlSkill(this.config, { maxRetries: 3 });
    
    const result = await skill.generateYAML(userInput, systemPrompt);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to generate YAML workflow');
    }
    
    return result.output;
  }
}

export interface NLParserWithLLM {
  parse(input: string, sessionId?: string): Promise<LLMResponse>;
}

export function createLLMEnhancedParser(config: LLMConfig): NLParserWithLLM {
  const client = new LLMClient(config);
  const promptContext = {
    intentList: INTENT_LIST.map(i => `- ${i}`).join('\n'),
  };

  return {
    async parse(input: string, sessionId?: string): Promise<LLMResponse> {
      client.setSessionId(sessionId || 'unknown');
      return client.complete(DEFAULT_INTENT_PARSER_ID, input, promptContext);
    },
  };
}

export function createLLMConfig(): LLMConfig | null {
  // 优先从配置文件读取
  try {
    const config = loadConfig();
    const llmConfig = config.ai_providers?.vectahub_llm;
    
    if (llmConfig?.enabled && llmConfig.provider) {
      // 验证提供商是否支持
      const supportedProviders = ['openai', 'anthropic', 'ollama', 'groq'];
      const provider = llmConfig.provider.toLowerCase();
      
      if (supportedProviders.includes(provider)) {
        // 检查必要的 API key
        if ((provider === 'openai' || provider === 'groq') && !llmConfig.apiKey) {
          // API key 缺失，尝试环境变量
        } else if (provider === 'anthropic' && !llmConfig.apiKey) {
          // API key 缺失，尝试环境变量
        } else {
          // Ollama 不需要 API key，或者其他提供商已有配置
          return {
            provider: provider as any,
            apiKey: llmConfig.apiKey,
            baseUrl: llmConfig.baseUrl,
            model: llmConfig.model || getDefaultModel(provider),
          };
        }
      }
    }
  } catch {
    // 配置文件读取失败，回退到环境变量
  }

  // 从环境变量读取配置
  const provider = process.env.VECTAHUB_LLM_PROVIDER as LLMConfig['provider'] || 'openai';
  const model = process.env.VECTAHUB_LLM_MODEL || getDefaultModel(provider);
  const baseUrl = process.env.VECTAHUB_LLM_BASE_URL;

  // OpenAI 需要 API key
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    return null;
  }

  // Anthropic 需要 API key
  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    return null;
  }

  // Groq 需要 API key
  if (provider === 'groq' && !process.env.GROQ_API_KEY) {
    return null;
  }

  // Ollama 不需要 API key（本地运行），但推荐配置 baseUrl
  if (provider === 'ollama' && !baseUrl) {
    // Ollama 默认使用 http://localhost:11434
  }

  return {
    provider,
    model,
    baseUrl,
  };
}

function getDefaultModel(provider: string): string {
  switch (provider.toLowerCase()) {
    case 'openai':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-3-5-sonnet-20241022';
    case 'groq':
      return 'llama3-8b-8192';
    case 'ollama':
      return 'llama3';
    default:
      return 'gpt-4o-mini';
  }
}

export function isLLMAvailable(): boolean {
  return createLLMConfig() !== null;
}
