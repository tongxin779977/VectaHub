import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMClient, createLLMConfig, createLLMConfigDigestSource, createLLMEnhancedParser, resolveLLMConfig, LLMTool, LLMToolCall } from './llm.js';
import { loadConfig } from '../setup/first-run-wizard.js';
import { createNoopAuditHelper } from '../infrastructure/audit/index.js';

vi.mock('../setup/first-run-wizard.js', () => ({
  loadConfig: vi.fn(),
}));

const mockedLoadConfig = vi.mocked(loadConfig);

const mockAuditHelper = createNoopAuditHelper();

vi.mock('./templates/index.js', () => ({
  getAllIntentNames: () => ['FILE_FIND', 'GIT_WORKFLOW', 'FETCH_HOT_NEWS', 'SYSTEM_INFO'],
  buildKeywordSummary: () => 'FILE_FIND:\n  核心词: 查找, 找出, 搜索\n  短语: 查找.*文件\n\n',
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

    it('throws for groq without API key when provider is explicitly configured', () => {
      const originalProvider = process.env.VECTAHUB_LLM_PROVIDER;
      const originalGroq = process.env.GROQ_API_KEY;
      process.env.VECTAHUB_LLM_PROVIDER = 'groq';
      delete process.env.GROQ_API_KEY;

      expect(() => createLLMConfig()).toThrow('Missing API key for LLM provider: groq');

      process.env.VECTAHUB_LLM_PROVIDER = originalProvider as string;
      process.env.GROQ_API_KEY = originalGroq as string;
    });

    it('throws on unsupported explicit provider instead of silently returning null', () => {
      const originalProvider = process.env.VECTAHUB_LLM_PROVIDER;
      process.env.VECTAHUB_LLM_PROVIDER = 'unsupported-provider';

      expect(() => createLLMConfig()).toThrow('Unsupported LLM provider');

      process.env.VECTAHUB_LLM_PROVIDER = originalProvider as string;
    });

    it('throws on missing API key when provider is explicitly configured', () => {
      const originalProvider = process.env.VECTAHUB_LLM_PROVIDER;
      const originalOpenAI = process.env.OPENAI_API_KEY;
      process.env.VECTAHUB_LLM_PROVIDER = 'openai';
      delete process.env.OPENAI_API_KEY;

      expect(() => createLLMConfig()).toThrow('Missing API key for LLM provider: openai');

      process.env.VECTAHUB_LLM_PROVIDER = originalProvider as string;
      process.env.OPENAI_API_KEY = originalOpenAI as string;
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

  describe('createLLMConfigDigestSource', () => {
    it('returns digest metadata from config file without requiring API key', () => {
      const originalTemperature = process.env.VECTAHUB_LLM_TEMPERATURE;
      process.env.VECTAHUB_LLM_TEMPERATURE = '0.3';
      mockedLoadConfig.mockReturnValue({
        ai_providers: {
          vectahub_llm: {
            provider: 'openai',
            model: 'custom-model',
            enabled: true,
          },
        },
      } as any);

      const source = createLLMConfigDigestSource();
      expect(source).toEqual({
        provider: 'openai',
        model: 'custom-model',
        temperature: 0.3,
      });

      process.env.VECTAHUB_LLM_TEMPERATURE = originalTemperature as string;
    });

    it('returns null when no explicit config signal exists', () => {
      const originalProvider = process.env.VECTAHUB_LLM_PROVIDER;
      const originalModel = process.env.VECTAHUB_LLM_MODEL;
      const originalBaseUrl = process.env.VECTAHUB_LLM_BASE_URL;
      const originalOpenAI = process.env.OPENAI_API_KEY;
      const originalAnthropic = process.env.ANTHROPIC_API_KEY;
      const originalGroq = process.env.GROQ_API_KEY;
      const originalOllama = process.env.OLLAMA_API_KEY;

      delete process.env.VECTAHUB_LLM_PROVIDER;
      delete process.env.VECTAHUB_LLM_MODEL;
      delete process.env.VECTAHUB_LLM_BASE_URL;
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GROQ_API_KEY;
      delete process.env.OLLAMA_API_KEY;

      mockedLoadConfig.mockReturnValue({
        ai_providers: {
          vectahub_llm: {
            provider: '',
            enabled: false,
          },
        },
      } as any);

      expect(createLLMConfigDigestSource()).toBeNull();

      process.env.VECTAHUB_LLM_PROVIDER = originalProvider as string;
      process.env.VECTAHUB_LLM_MODEL = originalModel as string;
      process.env.VECTAHUB_LLM_BASE_URL = originalBaseUrl as string;
      process.env.OPENAI_API_KEY = originalOpenAI as string;
      process.env.ANTHROPIC_API_KEY = originalAnthropic as string;
      process.env.GROQ_API_KEY = originalGroq as string;
      process.env.OLLAMA_API_KEY = originalOllama as string;
    });
  });

  describe('resolveLLMConfig', () => {
    it('returns unconfigured state when no config signal exists', () => {
      const originalProvider = process.env.VECTAHUB_LLM_PROVIDER;
      const originalModel = process.env.VECTAHUB_LLM_MODEL;
      const originalBaseUrl = process.env.VECTAHUB_LLM_BASE_URL;
      const originalOpenAI = process.env.OPENAI_API_KEY;
      const originalAnthropic = process.env.ANTHROPIC_API_KEY;
      const originalGroq = process.env.GROQ_API_KEY;
      const originalOllama = process.env.OLLAMA_API_KEY;
      delete process.env.VECTAHUB_LLM_PROVIDER;
      delete process.env.VECTAHUB_LLM_MODEL;
      delete process.env.VECTAHUB_LLM_BASE_URL;
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GROQ_API_KEY;
      delete process.env.OLLAMA_API_KEY;

      mockedLoadConfig.mockReturnValue({
        ai_providers: {
          vectahub_llm: {
            provider: '',
            enabled: false,
          },
        },
      } as any);

      expect(resolveLLMConfig()).toEqual({
        state: 'unconfigured',
        config: null,
      });

      process.env.VECTAHUB_LLM_PROVIDER = originalProvider as string;
      process.env.VECTAHUB_LLM_MODEL = originalModel as string;
      process.env.VECTAHUB_LLM_BASE_URL = originalBaseUrl as string;
      process.env.OPENAI_API_KEY = originalOpenAI as string;
      process.env.ANTHROPIC_API_KEY = originalAnthropic as string;
      process.env.GROQ_API_KEY = originalGroq as string;
      process.env.OLLAMA_API_KEY = originalOllama as string;
    });

    it('resolves apiKey from environment placeholders', () => {
      const originalProvider = process.env.VECTAHUB_LLM_PROVIDER;
      const originalModel = process.env.VECTAHUB_LLM_MODEL;
      const originalBaseUrl = process.env.VECTAHUB_LLM_BASE_URL;
      const originalOpenAI = process.env.OPENAI_API_KEY;
      delete process.env.VECTAHUB_LLM_PROVIDER;
      delete process.env.VECTAHUB_LLM_MODEL;
      delete process.env.VECTAHUB_LLM_BASE_URL;
      delete process.env.OPENAI_API_KEY;

      process.env.TEST_PLACEHOLDER_KEY = 'resolved-secret-value';

      mockedLoadConfig.mockReturnValue({
        ai_providers: {
          vectahub_llm: {
            provider: 'openai',
            enabled: true,
            apiKey: '${env:TEST_PLACEHOLDER_KEY}',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o-mini',
          },
        },
      } as any);

      const resolution = resolveLLMConfig();
      expect(resolution.state).toBe('configured');
      expect(resolution.config?.apiKey).toBe('resolved-secret-value');

      // Test with {env:VAR} format
      mockedLoadConfig.mockReturnValue({
        ai_providers: {
          vectahub_llm: {
            provider: 'openai',
            enabled: true,
            apiKey: '{env:TEST_PLACEHOLDER_KEY}',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o-mini',
          },
        },
      } as any);
      expect(resolveLLMConfig().config?.apiKey).toBe('resolved-secret-value');

      // Test with plain key
      mockedLoadConfig.mockReturnValue({
        ai_providers: {
          vectahub_llm: {
            provider: 'openai',
            enabled: true,
            apiKey: 'plain-text-key',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o-mini',
          },
        },
      } as any);
      expect(resolveLLMConfig().config?.apiKey).toBe('plain-text-key');

      delete process.env.TEST_PLACEHOLDER_KEY;
      process.env.VECTAHUB_LLM_PROVIDER = originalProvider as string;
      process.env.VECTAHUB_LLM_MODEL = originalModel as string;
      process.env.VECTAHUB_LLM_BASE_URL = originalBaseUrl as string;
      process.env.OPENAI_API_KEY = originalOpenAI as string;
    });
  });

  describe('LLMClient', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch as any;
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

      const client = new LLMClient({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' }, { auditHelper: mockAuditHelper });
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

      const client = new LLMClient({ provider: 'anthropic', model: 'claude-3', apiKey: 'test-key' }, { auditHelper: mockAuditHelper });
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

      const client = new LLMClient({ provider: 'groq', model: 'llama3-8b-8192', apiKey: 'test-groq-key', baseUrl: 'https://api.groq.com/openai/v1' }, { auditHelper: mockAuditHelper });
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

      const client = new LLMClient({ provider: 'ollama', model: 'llama3', baseUrl: 'http://localhost:11434/v1' }, { auditHelper: mockAuditHelper });
      const result = await client.complete('system prompt', 'show disk usage');

      expect(result.intent).toBe('SYSTEM_INFO');
      expect(result.confidence).toBe(0.9);
    });

    it('handles network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const client = new LLMClient({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' }, { auditHelper: mockAuditHelper });
      
      await expect(client.complete('system prompt', 'test')).rejects.toThrow('LLM call failed');
    });

    it('handles API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const client = new LLMClient({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' }, { auditHelper: mockAuditHelper });
      
      await expect(client.complete('system prompt', 'test')).rejects.toThrow('OpenAI API error');
    });

    it('handles invalid JSON response by falling back to reply', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'hello, I am an AI assistant',
          },
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = new LLMClient({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' }, { auditHelper: mockAuditHelper });
      
      const result = await client.complete('system prompt', 'test');
      expect(result.intent).toBe('UNKNOWN');
      expect(result.reply).toBe('hello, I am an AI assistant');
    });

    it('sets session ID on client', async () => {
      const client = new LLMClient({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' }, { auditHelper: mockAuditHelper });
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

      const client = new LLMClient({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' }, { auditHelper: mockAuditHelper });
      const result = await client.complete('system prompt', 'test');

      expect(result.intent).toBe('UNKNOWN');
      expect(result.confidence).toBe(0);
    });
  });

  describe('createLLMEnhancedParser', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch as any;
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

      const parser = createLLMEnhancedParser({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' }, { auditHelper: mockAuditHelper });
      const result = await parser.parse('show system info', 'session-123');
      expect(result.intent).toBe('SYSTEM_INFO');
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('LLMClient.embed()', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch as any;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('calls OpenAI embeddings endpoint and returns embedding vector', async () => {
      const embeddingVector = [0.1, 0.2, 0.3, 0.4];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: embeddingVector, index: 0 }],
        }),
      });

      const client = new LLMClient({ provider: 'openai', model: 'text-embedding-ada-002', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' }, { auditHelper: mockAuditHelper });
      const result = await client.embed('hello world');

      expect(result).toEqual(embeddingVector);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('https://api.openai.com/v1/embeddings');
      const body = JSON.parse(callArgs[1].body);
      expect(body.model).toBe('text-embedding-ada-002');
      expect(body.input).toBe('hello world');
    });

    it('works with ollama provider', async () => {
      const embeddingVector = [0.5, 0.6];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: embeddingVector, index: 0 }],
        }),
      });

      const client = new LLMClient({ provider: 'ollama', model: 'nomic-embed-text', baseUrl: 'http://localhost:11434/v1' }, { auditHelper: mockAuditHelper });
      const result = await client.embed('test text');

      expect(result).toEqual(embeddingVector);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('http://localhost:11434/v1/embeddings');
    });

    it('works with groq provider', async () => {
      const embeddingVector = [0.7, 0.8];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: embeddingVector, index: 0 }],
        }),
      });

      const client = new LLMClient({ provider: 'groq', model: 'embedding-model', apiKey: 'test-key', baseUrl: 'https://api.groq.com/openai/v1' }, { auditHelper: mockAuditHelper });
      const result = await client.embed('groq text');

      expect(result).toEqual(embeddingVector);
    });

    it('throws error for anthropic provider', async () => {
      const client = new LLMClient({ provider: 'anthropic', model: 'claude-3', apiKey: 'test-key' }, { auditHelper: mockAuditHelper });

      await expect(client.embed('test')).rejects.toThrow('Embedding is not supported by provider: anthropic');
    });

    it('caches results and does not make duplicate calls', async () => {
      const embeddingVector = [0.1, 0.2];
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ embedding: embeddingVector, index: 0 }],
        }),
      });

      const client = new LLMClient({ provider: 'openai', model: 'text-embedding-ada-002', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' }, { auditHelper: mockAuditHelper });

      const result1 = await client.embed('same text');
      const result2 = await client.embed('same text');

      expect(result1).toEqual(embeddingVector);
      expect(result2).toEqual(embeddingVector);
      // Only one fetch call should have been made due to caching
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('makes separate calls for different texts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1, 0.2], index: 0 }],
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.3, 0.4], index: 0 }],
        }),
      });

      const client = new LLMClient({ provider: 'openai', model: 'text-embedding-ada-002', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' }, { auditHelper: mockAuditHelper });

      const result1 = await client.embed('text A');
      const result2 = await client.embed('text B');

      expect(result1).toEqual([0.1, 0.2]);
      expect(result2).toEqual([0.3, 0.4]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('uses AbortController timeout pattern', async () => {
      const embeddingVector = [0.1];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: embeddingVector, index: 0 }],
        }),
      });

      const client = new LLMClient({ provider: 'openai', model: 'text-embedding-ada-002', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1', timeout: 5000 }, { auditHelper: mockAuditHelper });
      await client.embed('test');

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].signal).toBeDefined();
    });
  });

  describe('LLMClient complete() with tools', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    const sampleTools: LLMTool[] = [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get current weather',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'City name' },
            },
            required: ['location'],
          },
        },
      },
    ];

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch as any;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('passes tools in OpenAI-compatible request body', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'FILE_FIND',
              confidence: 0.9,
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

      const client = new LLMClient({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' }, { auditHelper: mockAuditHelper });
      await client.complete('system prompt', 'test', undefined, { tools: sampleTools });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.tools).toEqual(sampleTools);
      expect(body.tools[0].function.name).toBe('get_weather');
    });

    it('passes tool_choice in OpenAI-compatible request body', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'FILE_FIND',
              confidence: 0.9,
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

      const client = new LLMClient({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' }, { auditHelper: mockAuditHelper });
      await client.complete('system prompt', 'test', undefined, { tools: sampleTools, toolChoice: 'auto' });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.tool_choice).toBe('auto');
    });

    it('passes tools in Anthropic format', async () => {
      const mockResponse = {
        content: [{
          text: JSON.stringify({
            intent: 'FILE_FIND',
            confidence: 0.9,
            params: {},
            workflow: { name: 'Test', steps: [] },
          }),
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = new LLMClient({ provider: 'anthropic', model: 'claude-3', apiKey: 'test-key' }, { auditHelper: mockAuditHelper });
      await client.complete('system prompt', 'test', undefined, { tools: sampleTools });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.tools).toBeDefined();
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0].name).toBe('get_weather');
      expect(body.tools[0].description).toBe('Get current weather');
      expect(body.tools[0].input_schema).toEqual(sampleTools[0].function.parameters);
    });

    it('parses tool_calls from OpenAI response', async () => {
      const toolCalls: LLMToolCall[] = [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location":"Tokyo"}',
          },
        },
      ];

      const mockResponse = {
        choices: [{
          message: {
            content: null,
            tool_calls: toolCalls,
          },
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = new LLMClient({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' }, { auditHelper: mockAuditHelper });
      const result = await client.complete('system prompt', 'test', undefined, { tools: sampleTools });

      expect(result.tool_calls).toBeDefined();
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls![0].id).toBe('call_123');
      expect(result.tool_calls![0].function.name).toBe('get_weather');
      expect(result.tool_calls![0].function.arguments).toBe('{"location":"Tokyo"}');
    });

    it('returns tool_calls as undefined when not present in response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'FILE_FIND',
              confidence: 0.9,
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

      const client = new LLMClient({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' }, { auditHelper: mockAuditHelper });
      const result = await client.complete('system prompt', 'test');

      expect(result.tool_calls).toBeUndefined();
    });

    it('does not break existing complete() behavior when tools not provided', async () => {
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

      const client = new LLMClient({ provider: 'openai', model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' }, { auditHelper: mockAuditHelper });
      const result = await client.complete('system prompt', 'find *.ts files');

      expect(result.intent).toBe('FILE_FIND');
      expect(result.confidence).toBe(0.9);
      expect(result.params.pattern).toBe('*.ts');
    });
  });
});
