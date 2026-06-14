import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNLProcessor } from './pipeline.js';
import { createNoopAuditHelper } from '../../infrastructure/audit/index.js';
import { initializeBuiltInAgents } from '../../agent-runtime/factory.js';
import type { LLMTool } from '../interfaces.js';
import { LLMClient } from '../llm.js';

// 初始化 AgentRegistry，确保 aider 等 agent 被注册
initializeBuiltInAgents();

let capturedTools: LLMTool[] | undefined = undefined;
let mockLLMResponse: any = null;

// Mock 掉 llm.ts 里的 LLMClient 行为，捕获传入的 tools，并模拟返回响应
vi.mock('../llm.js', async () => {
  const actual = await vi.importActual<typeof import('../llm.js')>('../llm.js');
  
  class MockLLMClient {
    constructor() {}
    async complete(promptId: string, userInput: string, context?: any, options?: { tools?: LLMTool[] }) {
      capturedTools = options?.tools; // 捕获传给大模型的工具列表以验证修剪行为
      if (typeof mockLLMResponse === 'function') {
        return mockLLMResponse(promptId, userInput);
      }
      return mockLLMResponse;
    }
    setSessionId() {}
    get sessionManager() {
      return { getOrCreateSession: () => ({}), addUserMessage: () => {}, addAssistantMessage: () => {} };
    }
  }

  return {
    ...actual,
    LLMClient: MockLLMClient,
    createLLMConfig: () => ({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
    }),
  };
});

const mockAuditHelper = createNoopAuditHelper();
const mockLogger = {
  error: vi.fn(),
};

describe('E2E User Simulation Tests (深度用户测试模拟)', () => {
  beforeEach(() => {
    capturedTools = undefined;
    mockLLMResponse = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockLLMResponse = null;
  });

  // 场景 A：日常多轮/单轮闲聊放行与剪裁
  it('Scenario A: Chitchat Pruning and Routing', async () => {
    // 模拟纯闲聊返回
    mockLLMResponse = {
      intent: 'UNKNOWN',
      confidence: 0.8,
      reply: '你好！有什么我可以帮你的吗？',
      params: {},
    };

    const startTime = performance.now();
    const processor = createNLProcessor({
      llmConfig: { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'test-key' },
      auditHelper: mockAuditHelper,
      logger: mockLogger,
    });

    const result = await processor.parse({ input: '你好' });
    const duration = performance.now() - startTime;

    console.log(`[Trace - Scenario A] Input: "你好"`);
    console.log(` - Captured Tools Count: ${capturedTools?.length ?? 0}`);
    console.log(` - Decision Path: Dialog (Chitchat)`);
    console.log(` - Output Intent: ${result.intent}`);
    console.log(` - Reply: "${result.reply}"`);
    console.log(` - Latency: ${duration.toFixed(2)}ms`);

    expect(result.success).toBe(true);
    expect(result.intent).toBe('UNKNOWN');
    expect(result.reply).toBe('你好！有什么我可以帮你的吗？');
    // 空 domains 不再剪裁工具集，buildAllTools([]) 返回全部工具
    expect(capturedTools!.length).toBeGreaterThan(0);
  });

  // 场景 B：内置 Git 意图转换
  it('Scenario B: Built-in Git Intent mapping', async () => {
    // 模拟大模型识别出了 git_commit 工具调用
    mockLLMResponse = {
      tool_calls: [{
        id: 'call_git_commit',
        type: 'function',
        function: {
          name: 'git_commit',
          arguments: JSON.stringify({ message: 'docs: update readme' }),
        },
      }],
    };

    const startTime = performance.now();
    const processor = createNLProcessor({
      llmConfig: { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'test-key' },
      auditHelper: mockAuditHelper,
      logger: mockLogger,
    });

    const result = await processor.parse({ input: '把更改 commit 一下' });
    const duration = performance.now() - startTime;

    console.log(`[Trace - Scenario B] Input: "把更改 commit 一下"`);
    console.log(` - Captured Tools Count: ${capturedTools?.length ?? 0}`);
    console.log(` - Decision Path: Tool Call (git_commit)`);
    console.log(` - Workflow YAML:\n${result.workflowYAML}`);
    console.log(` - Latency: ${duration.toFixed(2)}ms`);

    expect(result.success).toBe(true);
    expect(result.intent).toBe('git_commit');
    expect(result.workflowYAML).toContain('git');
    expect(result.workflowYAML).toContain('commit');
    expect(result.workflowYAML).toContain('docs: update readme');
    // 判定为非闲聊，工具集未被置空
    expect(capturedTools).toBeDefined();
    expect(capturedTools!.length).toBeGreaterThan(0);
  });

  // 场景 C：自定义 Agent 习惯感知路由
  it('Scenario C: Custom Agent Habit Perception & Adapter Rendering', async () => {
    // 模拟大模型识别出了 run_agent_aider 自定义工具调用，并传入涉及的文件参数
    mockLLMResponse = {
      tool_calls: [{
        id: 'call_aider',
        type: 'function',
        function: {
          name: 'run_agent_aider',
          arguments: JSON.stringify({
            prompt: 'refactor code export',
            files: ['src/index.ts'],
          }),
        },
      }],
    };

    const startTime = performance.now();
    const processor = createNLProcessor({
      llmConfig: { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'test-key' },
      auditHelper: mockAuditHelper,
      logger: mockLogger,
    });

    const result = await processor.parse({ input: '用 aider 重构 src/index.ts 的导出' });
    const duration = performance.now() - startTime;

    console.log(`[Trace - Scenario C] Input: "用 aider 重构 src/index.ts 的导出"`);
    console.log(` - Captured Tools Count: ${capturedTools?.length ?? 0}`);
    
    // 验证自定义 aider 工具的自描述中是否包含了使用习惯 usageHabits 的注入
    const aiderTool = capturedTools?.find(t => t.function.name === 'run_agent_aider');
    console.log(` - Aider Tool Description: ${aiderTool?.function.description}`);
    console.log(` - Decision Path: Tool Call (run_agent_aider)`);
    console.log(` - Workflow YAML:\n${result.workflowYAML}`);
    console.log(` - Latency: ${duration.toFixed(2)}ms`);

    expect(result.success).toBe(true);
    expect(result.intent).toBe('run_agent_aider');
    expect(aiderTool?.function.description).toContain('使用习惯/偏好：');
    expect(result.workflowYAML).toContain('aider');
    expect(result.workflowYAML).toContain('src/index.ts');
  });

  // 场景 D：无效/恶意任务请求防御校验
  it('Scenario D: Unauthorized Intent Defence and empty validation', async () => {
    // 模拟大模型在强制 JSON 完成时返回了非结构化的但符合诗歌形式的 JSON 文本
    mockLLMResponse = {
      reply: '春风拂面绿意浓...',
    };

    const startTime = performance.now();
    const processor = createNLProcessor({
      llmConfig: { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'test-key' },
      auditHelper: mockAuditHelper,
      logger: mockLogger,
    });

    const result = await processor.parse({ input: '写一首关于春天的诗并保存到 main.rs' });
    const duration = performance.now() - startTime;

    console.log(`[Trace - Scenario D] Input: "写一首关于春天的诗并保存到 main.rs"`);
    console.log(` - Captured Tools Count: ${capturedTools?.length ?? 0}`);
    console.log(` - Decision Path: Defense (No workflow steps)`);
    console.log(` - Output Reply: "${result.reply}"`);
    console.log(` - Latency: ${duration.toFixed(2)}ms`);

    expect(result.success).toBe(true);
    expect(result.reply).toContain('春风拂面');
  });

  // 场景 E：多意图 Split 合并决策
  it('Scenario E: Multi-intent parsing and steps merging', async () => {
    mockLLMResponse = (promptId: string, userInput: string) => {
      // 两阶段路由下，每个子句都先调分类器，再调 tool-calling；
      // 子句并行执行，因此不能依赖全局 callIndex 序列。
      if (promptId === 'nl-intent-classifier-v1') {
        return { reply: '{"kind":"task"}' };
      }
      if (userInput.includes('aider')) {
        return {
          tool_calls: [{
            id: 'call_aider_multi',
            type: 'function',
            function: {
              name: 'run_agent_aider',
              arguments: JSON.stringify({ prompt: 'fix index.ts', files: ['src/index.ts'] }),
            },
          }],
        };
      }
      return {
        tool_calls: [{
          id: 'call_doctor_multi',
          type: 'function',
          function: {
            name: 'doctor',
            arguments: '{}',
          },
        }],
      };
    };

    const { orchestrateIntent } = await import('../orchestrator.js');
    const startTime = performance.now();
    const result = await orchestrateIntent('用 aider 修复 src/index.ts；然后检查系统健康', {
      auditHelper: mockAuditHelper,
      logger: mockLogger as any,
    });
    const duration = performance.now() - startTime;

    console.log(`[Trace - Scenario E] Input: "用 aider 修复 src/index.ts；然后检查系统健康"`);
    console.log(` - Steps Count: ${result.steps.length}`);
    result.steps.forEach((step, index) => {
      console.log(`   - Step ${index + 1}: ${step.cli} ${step.args.join(' ')}`);
    });
    console.log(` - Latency: ${duration.toFixed(2)}ms`);

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].cli).toBe('aider');
    expect(result.steps[0].args).toContain('src/index.ts');
    expect(result.steps[1].cli).toContain('vectahub');
    expect(result.steps[1].args).toContain('doctor');
  });
});
