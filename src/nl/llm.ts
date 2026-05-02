import { audit } from '../utils/audit.js';
import { getAllIntentNames } from './templates/index.js';
import createLLMDialogControlSkill from '../skills/llm-dialog-control/index.js';

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

const SYSTEM_PROMPT = `你是一个工作流解析专家。用户输入一段自然语言，你需要：
1. 识别用户意图（从以下列表中选择最匹配的）
2. 提取关键参数
3. 生成标准化的工作流步骤

支持的意图类型：
${INTENT_LIST.map(i => `- ${i}`).join('\n')}

请以 JSON 格式输出：
{
  "intent": "意图名称",
  "confidence": 0.0-1.0,
  "params": { "参数名": "参数值" },
  "workflow": {
    "name": "工作流名称",
    "steps": [
      { "type": "exec", "cli": "命令", "args": ["参数"] }
    ]
  }
}`;

const YAML_WORKFLOW_SYSTEM_PROMPT = `你是一个专业的工作流 YAML 生成专家，专门为 VectaHub 平台生成工作流。

## VectaHub 工作流规范：
- 步骤类型：
  - exec：执行本地命令
  - opencli：调用 OpenCLI 工具
  - for_each：循环
  - if：条件判断
  - parallel：并行执行

- opencli 步骤格式：
  id: <step-id>
  type: opencli
  site: <site-name>
  command: <command>
  args: [arg1, arg2, ...]

- exec 步骤格式：
  id: <step-id>
  type: exec
  cli: <command-line>
  args: [arg1, arg2, ...]

- YAML 必须包含：
  name: <workflow-name>
  description: <description>
  steps: [step1, step2, ...]
  mode: <strict|relaxed|consensus>

## 重要规则：
1. 请直接输出 YAML 内容，不要添加任何额外的说明文字或 Markdown 代码块标记！
2. 确保 YAML 格式完全正确，并且可以直接被 VectaHub 执行！
3. 使用 relaxed 作为默认的 mode！
4. 确保步骤逻辑合理、实用！

## 示例 YAML：

name: "查看 HackerNews 热榜并保存"
description: "查看 HackerNews 热榜，提取链接，保存到文件"
mode: relaxed
steps:
  - id: step1
    type: opencli
    site: hackernews
    command: top
    args: ["--limit", "10"]
  - id: step2
    type: exec
    cli: node
    args: ["-e", "console.log(JSON.parse(process.stdin.read()).map(i => i.url).join('\\n'))"]
  - id: step3
    type: exec
    cli: tee
    args: ["hn-top-urls.txt"]

---

现在请根据用户需求生成对应的 YAML 工作流！
`.trim();

export class LLMClient {
  private config: LLMConfig;
  private sessionId?: string;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  async complete(prompt: string, userInput: string): Promise<LLMResponse> {
    const startTime = Date.now();

    try {
      let response: Response;

      if (this.config.provider === 'openai' || this.config.provider === 'ollama' || this.config.provider === 'groq') {
        response = await this.callOpenAICompatible(userInput);
      } else if (this.config.provider === 'anthropic') {
        response = await this.callAnthropic(userInput);
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

  private async callOpenAICompatible(userInput: string): Promise<Response> {
    const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY || process.env.OLLAMA_API_KEY;
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
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

  private async callAnthropic(userInput: string): Promise<Response> {
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
        system: SYSTEM_PROMPT,
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
    const skill = createLLMDialogControlSkill(this.config, { maxRetries: 3 });
    
    const result = await skill.generateYAML(userInput, YAML_WORKFLOW_SYSTEM_PROMPT);
    
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

  return {
    async parse(input: string, sessionId?: string): Promise<LLMResponse> {
      client.setSessionId(sessionId || 'unknown');
      return client.complete(SYSTEM_PROMPT, input);
    },
  };
}

export function createLLMConfig(): LLMConfig | null {
  const provider = process.env.VECTAHUB_LLM_PROVIDER as LLMConfig['provider'] || 'openai';
  const model = process.env.VECTAHUB_LLM_MODEL || 'gpt-4o-mini';
  const baseUrl = process.env.VECTAHUB_LLM_BASE_URL;

  if (provider === 'openai' && !process.env.OPENAI_API_KEY && !process.env.OLLAMA_API_KEY) {
    return null;
  }

  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    return null;
  }

  return {
    provider,
    model,
    baseUrl,
  };
}

export function isLLMAvailable(): boolean {
  return createLLMConfig() !== null;
}
