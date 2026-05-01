import https from 'https';
import http from 'http';
import { URL } from 'url';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  baseUrl?: string;
  timeout?: number;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  ollama: 'http://localhost:11434/v1/chat/completions',
};

export function detectProvider(baseUrl: string): string {
  const url = baseUrl.toLowerCase();
  if (url.includes('openai')) return 'openai';
  if (url.includes('anthropic')) return 'anthropic';
  if (url.includes('gemini') || url.includes('google')) return 'gemini';
  if (url.includes('deepseek')) return 'deepseek';
  if (url.includes('ollama')) return 'ollama';
  return 'openai';
}

function httpPost(url: string, body: string, headers: Record<string, string>, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
      timeout,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeout}ms`));
    });

    req.write(body);
    req.end();
  });
}

async function callOpenAI(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse> {
  const body = JSON.stringify({
    model: options.model || 'gpt-4o-mini',
    messages,
    max_tokens: options.maxTokens || 2048,
    temperature: options.temperature ?? 0.1,
  });

  // 如果 baseUrl 已经是默认 OpenAI 格式的端点需要加上 /chat/completions
  let finalUrl = options.baseUrl || DEFAULT_BASE_URLS.openai;
  if (!finalUrl.endsWith('/chat/completions')) {
    finalUrl = finalUrl.endsWith('/') ? finalUrl + 'chat/completions' : finalUrl + '/chat/completions';
  }

  console.log(`[callOpenAI] Calling URL:`, finalUrl);
  console.log(`[callOpenAI] Request body:`, body);

  const result = await httpPost(finalUrl, body, {
    'Authorization': `Bearer ${options.apiKey}`,
  }, options.timeout || 30000);

  console.log(`[callOpenAI] Raw response:`, result);

  const parsed = JSON.parse(result);
  console.log(`[callOpenAI] Parsed response:`, parsed);

  return {
    content: parsed.choices?.[0]?.message?.content || '',
    usage: parsed.usage || undefined,
  };
}

async function callAnthropic(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse> {
  const systemMsg = messages.find(m => m.role === 'system');
  const userMsgs = messages.filter(m => m.role !== 'system');

  const body = JSON.stringify({
    model: options.model || 'claude-3-5-sonnet-20241022',
    system: systemMsg?.content,
    messages: userMsgs.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    max_tokens: options.maxTokens || 1024,
    temperature: options.temperature ?? 0.1,
  });

  const result = await httpPost(options.baseUrl!, body, {
    'x-api-key': options.apiKey,
    'anthropic-version': '2023-06-01',
  }, options.timeout || 30000);

  const parsed = JSON.parse(result);
  return {
    content: parsed.content?.[0]?.text || '',
    usage: parsed.usage || undefined,
  };
}

async function callGemini(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse> {
  const systemMsg = messages.find(m => m.role === 'system');
  const userMsgs = messages.filter(m => m.role !== 'system');
  const lastUser = userMsgs[userMsgs.length - 1];

  const model = options.model || 'gemini-2.0-flash';
  const url = `${options.baseUrl}/${model}:generateContent?key=${options.apiKey}`;

  const body = JSON.stringify({
    system_instruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
    contents: [{
      parts: [{ text: lastUser.content }],
    }],
    generationConfig: {
      maxOutputTokens: options.maxTokens || 1024,
      temperature: options.temperature ?? 0.1,
    },
  });

  const result = await httpPost(url, body, {}, options.timeout || 30000);
  const parsed = JSON.parse(result);
  return {
    content: parsed.candidates?.[0]?.content?.parts?.[0]?.text || '',
  };
}

async function callOllama(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse> {
  const body = JSON.stringify({
    model: options.model || 'qwen2.5',
    messages,
    stream: false,
    options: {
      temperature: options.temperature ?? 0.1,
      num_predict: options.maxTokens || 1024,
    },
  });

  const result = await httpPost(options.baseUrl!, body, {}, options.timeout || 60000);
  const parsed = JSON.parse(result);
  return {
    content: parsed.message?.content || parsed.response || '',
  };
}

export async function callLLM(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse> {
  const provider = detectProvider(options.baseUrl || DEFAULT_BASE_URLS.openai);
  const baseUrl = options.baseUrl || DEFAULT_BASE_URLS[provider] || DEFAULT_BASE_URLS.openai;

  const opts = { ...options, baseUrl };

  switch (provider) {
    case 'openai':
    case 'deepseek':
      return callOpenAI(messages, opts);
    case 'anthropic':
      return callAnthropic(messages, opts);
    case 'gemini':
      return callGemini(messages, opts);
    case 'ollama':
      return callOllama(messages, opts);
    default:
      return callOpenAI(messages, opts);
  }
}

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

function getVectaHubConfigPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
  return join(homeDir, '.vectahub', 'config.yaml');
}

function loadVectaHubConfig(): any {
  const configPath = getVectaHubConfigPath();
  if (!existsSync(configPath)) return null;

  try {
    const content = readFileSync(configPath, 'utf-8');
    return parse(content);
  } catch {
    return null;
  }
}

export function detectAPIKey(): { provider: string; key: string; baseUrl?: string; model?: string } | null {
  // 优先级 1: 从 VectaHub 配置文件读取
  const vectaHubConfig = loadVectaHubConfig();
  if (vectaHubConfig?.ai_providers?.vectahub_llm?.enabled) {
    const llmConfig = vectaHubConfig.ai_providers.vectahub_llm;
    return {
      provider: llmConfig.provider,
      key: llmConfig.apiKey,
      baseUrl: llmConfig.baseUrl,
      model: llmConfig.model,
    };
  }

  // 优先级 2: 从环境变量读取
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', key: process.env.OPENAI_API_KEY, baseUrl: process.env.OPENAI_BASE_URL };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: 'anthropic', key: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.GEMINI_API_KEY) {
    return { provider: 'gemini', key: process.env.GEMINI_API_KEY };
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return { provider: 'deepseek', key: process.env.DEEPSEEK_API_KEY, baseUrl: process.env.DEEPSEEK_BASE_URL };
  }
  if (process.env.OLLAMA_BASE_URL) {
    return { provider: 'ollama', key: '', baseUrl: process.env.OLLAMA_BASE_URL };
  }
  return null;
}
