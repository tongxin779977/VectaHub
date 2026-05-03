import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMClient, createLLMConfig, createLLMEnhancedParser } from './llm.js';
import { loadConfig } from '../setup/first-run-wizard.js';

vi.mock('../setup/first-run-wizard.js', () => ({
  loadConfig: vi.fn(),
}));

const mockedLoadConfig = vi.mocked(loadConfig);

vi.mock('../utils/audit.js', () => ({
  audit: {
    securityAction: vi.fn(),
  },
}));

vi.mock('./templates/index.js', () => ({
  getAllIntentNames: () => ['FILE_FIND', 'GIT_WORKFLOW', 'FETCH_HOT_NEWS', 'SYSTEM_INFO'],
}));

describe('LLM Client', () => {
  beforeEach(() => {
    // 重置 mock
    mockedLoadConfig.mockReturnValue({
      ai_providers: {
        vectahub_llm: {
          provider: '',
          enabled: false,
        },
      },
    } as any);
  });

  describe('createLLMConfig', () => {
    it('returns null when no API key is set', () => {
      const originalOpenAI = process.env.OPENAI_API_KEY;
      const originalAnthropic = process.env.ANTHROPIC_API_KEY;
      const originalOllama = process.env.OLLAMA_API_KEY;
      const originalGroq = process.env.GROQ_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OLLAMA_API_KEY;
      delete process.env.GROQ_API_KEY;

      const config = createLLMConfig();
      expect(config).toBeNull();

      process.env.OPENAI_API_KEY = originalOpenAI as string;
      process.env.ANTHROPIC_API_KEY = originalAnthropic as string;
      process.env.OLLAMA_API_KEY = originalOllama as string;
      process.env.GROQ_API_KEY = originalGroq as string;
    });

    it('returns config with API key', () => {
      const original = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'test-key';

      const config = createLLMConfig();
      expect(config).not.toBeNull();
      expect(config?.provider).toBe('openai');
      expect(config?.model).toBeDefined();

      process.env.OPENAI_API_KEY = original as string;
    });

    it('returns config for groq with API key', () => {
      const originalProvider = process.env.VECTAHUB_LLM_PROVIDER;
      const originalGroq = process.env.GROQ_API_KEY;
      process.env.VECTAHUB_LLM_PROVIDER = 'groq';
      process.env.GROQ_API_KEY = 'test-groq-key';

      const config = createLLMConfig();
      expect(config).not.toBeNull();
      expect(config?.provider).toBe('groq');

      process.env.VECTAHUB_LLM_PROVIDER = originalProvider as string;
      process.env.GROQ_API_KEY = originalGroq as string;
    });

    it('returns null for groq without API key', () => {
      const originalProvider = process.env.VECTAHUB_LLM_PROVIDER;
      const originalGroq = process.env.GROQ_API_KEY;
      process.env.VECTAHUB_LLM_PROVIDER = 'groq';
      delete process.env.GROQ_API_KEY;

      const config = createLLMConfig();
      expect(config).toBeNull();

      process.env.VECTAHUB_LLM_PROVIDER = originalProvider as string;
      process.env.GROQ_API_KEY = originalGroq as string;
    });

    it('returns config for ollama without API key', () => {
      const originalProvider = process.env.VECTAHUB_LLM_PROVIDER;
      process.env.VECTAHUB_LLM_PROVIDER = 'ollama';

      const config = createLLMConfig();
      expect(config).not.toBeNull();
      expect(config?.provider).toBe('ollama');

      process.env.VECTAHUB_LLM_PROVIDER = originalProvider as string;
    });

    it('uses environment variables for configuration', () => {
      const originalProvider = process.env.VECTAHUB_LLM_PROVIDER;
      const originalModel = process.env.VECTAHUB_LLM_MODEL;
      const originalBaseUrl = process.env.VECTAHUB_LLM_BASE_URL;

      process.env.VECTAHUB_LLM_PROVIDER = 'anthropic';
      process.env.VECTAHUB_LLM_MODEL = 'claude-3';
      process.env.VECTAHUB_LLM_BASE_URL = 'https://custom.example.com';
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

      const config = createLLMConfig();
      expect(config?.provider).toBe('anthropic');
      expect(config?.model).toBe('claude-3');
      expect(config?.baseUrl).toBe('https://custom.example.com');

      process.env.VECTAHUB_LLM_PROVIDER = originalProvider as string;
      process.env.VECTAHUB_LLM_MODEL = originalModel as string;
      process.env.VECTAHUB_LLM_BASE_URL = originalBaseUrl as string;
    });

    it('loads config from config file when available', () => {
      // 模拟配置文件
      mockedLoadConfig.mockReturnValue({
        ai_providers: {
          vectahub_llm: {
            provider: 'openai',
            baseUrl: 'https://custom-api.example.com/v1',
            apiKey: 'sk-custom-key',
            model: 'custom-model',
            enabled: true,
          },
        },
      } as any);

      const config = createLLMConfig();
      expect(config).not.toBeNull();
      expect(config?.provider).toBe('openai');
      expect(config?.baseUrl).toBe('https://custom-api.example.com/v1');
      expect(config?.apiKey).toBe('sk-custom-key');
      expect(config?.model).toBe('custom-model');
    });

    it('loads ollama config from config file', () => {
      mockedLoadConfig.mockReturnValue({
        ai_providers: {
          vectahub_llm: {
            provider: 'ollama',
            baseUrl: 'http://localhost:11434/v1',
            model: 'llama3',
            enabled: true,
          },
        },
      } as any);

      const config = createLLMConfig();
      expect(config).not.toBeNull();
      expect(config?.provider).toBe('ollama');
      expect(config?.baseUrl).toBe('http://localhost:11434/v1');
      expect(config?.model).toBe('llama3');
    });
  });

  describe('LLMClient', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('parses OpenAI response correctly', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'FILE_FIND',
              confidence: 0.9,
              params: { pattern: '*.ts' },
              workflow: {
                name: 'Find TypeScript Files',
                steps: [{ type: 'exec', cli: 'find', args: ['.', '-name', '*.ts'] }],
              },
            }),
          },
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = new LLMClient({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' });
      const result = await client.complete('system prompt', 'find *.ts files');

      expect(result.intent).toBe('FILE_FIND');
      expect(result.confidence).toBe(0.9);
      expect(result.params.pattern).toBe('*.ts');
      expect(result.workflow.steps).toHaveLength(1);
    });

    it('parses Anthropic response correctly', async () => {
      const mockResponse = {
        content: [{
          text: JSON.stringify({
            intent: 'GIT_WORKFLOW',
            confidence: 0.85,
            params: { action: 'commit' },
            workflow: {
              name: 'Git Commit',
              steps: [{ type: 'exec', cli: 'git', args: ['commit', '-m', 'update'] }],
            },
          }),
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = new LLMClient({ provider: 'anthropic', model: 'claude-3', apiKey: 'test-key' });
      const result = await client.complete('system prompt', 'commit code');

      expect(result.intent).toBe('GIT_WORKFLOW');
      expect(result.confidence).toBe(0.85);
    });

    it('parses Groq response correctly', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'FETCH_HOT_NEWS',
              confidence: 0.88,
              params: {},
              workflow: {
                name: 'Fetch News',
                steps: [{ type: 'exec', cli: 'curl', args: ['https://news.example.com'] }],
              },
            }),
          },
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = new LLMClient({ provider: 'groq', model: 'llama3-8b-8192', apiKey: 'test-groq-key', baseUrl: 'https://api.groq.com/openai/v1' });
      const result = await client.complete('system prompt', 'fetch hot news');

      expect(result.intent).toBe('FETCH_HOT_NEWS');
      expect(result.confidence).toBe(0.88);
    });

    it('parses Ollama response correctly', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'SYSTEM_INFO',
              confidence: 0.9,
              params: {},
              workflow: {
                name: 'System Info',
                steps: [{ type: 'exec', cli: 'df', args: ['-h'] }],
              },
            }),
          },
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = new LLMClient({ provider: 'ollama', model: 'llama3', baseUrl: 'http://localhost:11434/v1' });
      const result = await client.complete('system prompt', 'show disk usage');

      expect(result.intent).toBe('SYSTEM_INFO');
      expect(result.confidence).toBe(0.9);
    });

    it('handles network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const client = new LLMClient({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' });
      
      await expect(client.complete('system prompt', 'test')).rejects.toThrow('LLM call failed');
    });

    it('handles API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const client = new LLMClient({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' });
      
      await expect(client.complete('system prompt', 'test')).rejects.toThrow('OpenAI API error');
    });

    it('handles invalid JSON response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'not valid json',
          },
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = new LLMClient({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' });
      
      await expect(client.complete('system prompt', 'test')).rejects.toThrow('Failed to parse LLM response');
    });

    it('sets session ID on client', async () => {
      const client = new LLMClient({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' });
      client.setSessionId('test-session-123');
    });

    it('handles missing intent in response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              confidence: 0.5,
              params: {},
              workflow: { name: 'Test', steps: [] },
            }),
          },
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = new LLMClient({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' });
      const result = await client.complete('system prompt', 'test');

      expect(result.intent).toBe('UNKNOWN');
      expect(result.confidence).toBe(0);
    });
  });

  describe('createLLMEnhancedParser', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('creates parser with correct interface', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'SYSTEM_INFO',
              confidence: 0.95,
              params: {},
              workflow: { name: 'System Info', steps: [] },
            }),
          },
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const parser = createLLMEnhancedParser({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' });
      const result = await parser.parse('show system info', 'session-123');
      expect(result.intent).toBe('SYSTEM_INFO');
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
