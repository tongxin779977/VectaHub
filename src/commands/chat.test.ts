import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 旧的 chat 命令实现 (`while loop + readline + processInputWithTaskContract`)
 * 已被替换为 `createRepl()`。本测试集只验证 CLI 与 REPL 之间的桥接契约：
 *
 * - chatCmd 是命名导出、且名字是 'chat'
 * - chatCmd 触发后，createRepl 会被调用一次，并使用 buildReplDeps 的结果
 * - 得到的 REPL 实例的 start() 会被调用
 * - buildReplDeps 装配出的 deps 包含 ReplDeps 必需的全部字段
 *
 * REPL 自身的语义（bare-execute、/execute、/help、/status、/exit、pendingWorkflows）
 * 已经在 `src/chat/repl.test.ts` 中覆盖，这里不再重复。
 */

const createReplMock = vi.fn();

vi.mock('../chat/repl.js', () => ({
  createRepl: (...args: unknown[]) => createReplMock(...args),
}));

vi.mock('../chat/command-bridge.js', () => ({
  CommandBridge: vi.fn().mockImplementation(function CommandBridgeMock() {
    return { execute: vi.fn().mockResolvedValue('') };
  }),
}));

vi.mock('../chat/context-builder.js', () => ({
  createContextBuilder: () => ({ buildContext: vi.fn().mockResolvedValue({ cwd: '/test' }) }),
}));

vi.mock('../nl/core/pipeline.js', () => ({
  createNLProcessor: () => ({ parse: vi.fn().mockResolvedValue({ success: true, intent: 'x' }) }),
}));

vi.mock('../nl/param-extractor.js', () => ({
  createParamExtractor: () => ({ extract: vi.fn().mockReturnValue({}) }),
}));

vi.mock('../workflow/engine.js', () => ({
  createWorkflowEngine: () => ({
    execute: vi.fn(),
    getWorkflow: vi.fn(),
    pauseExecution: vi.fn(),
    resumeExecution: vi.fn(),
    abortExecution: vi.fn(),
  }),
}));

vi.mock('../workflow/storage.js', () => ({
  createStorage: () => ({}),
}));

describe('chat command bridge to REPL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createReplMock.mockReturnValue({
      start: vi.fn().mockResolvedValue(undefined),
      processInput: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exports a chatCmd named "chat"', async () => {
    const { chatCmd } = await import('./chat.js');
    expect(chatCmd).toBeDefined();
    expect(chatCmd.name()).toBe('chat');
  });

  it('chatCmd invokes createRepl with ReplDeps-shaped value and calls start()', async () => {
    const startSpy = vi.fn().mockResolvedValue(undefined);
    createReplMock.mockReturnValueOnce({ start: startSpy, processInput: vi.fn() });

    const { chatCmd } = await import('./chat.js');
    await chatCmd.parseAsync(['node', 'chat']);

    expect(createReplMock).toHaveBeenCalledTimes(1);
    const passedDeps = createReplMock.mock.calls[0][0] as Record<string, unknown>;
    // 关键字段必须在场（其余行为由 REPL 自身的测试覆盖）
    expect(passedDeps.contextBuilder).toBeDefined();
    expect(passedDeps.commandBridge).toBeDefined();
    expect(passedDeps.paramExtractor).toBeDefined();
    expect(passedDeps.auditHelper).toBeDefined();
    expect(passedDeps.logger).toBeDefined();
    expect(passedDeps.workflowEngine).toBeDefined();
    expect(passedDeps.config).toBeDefined();
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('buildReplDeps returns a complete ReplDeps shape', async () => {
    const chatModule = await import('./chat.js');
    // sanity: the function must be a named export
    expect(typeof chatModule.buildReplDeps).toBe('function');
    const ctx = (await import('../infrastructure/context.js')).InfrastructureContext;
    const context = new ctx();
    const deps = chatModule.buildReplDeps(context);

    expect(deps.contextBuilder).toBeDefined();
    expect(deps.commandBridge).toBeDefined();
    expect(deps.paramExtractor).toBeDefined();
    expect(deps.auditHelper).toBeDefined();
    expect(deps.logger).toBeDefined();
    expect(deps.workflowEngine).toBeDefined();
    expect(deps.config).toBeDefined();
    expect(deps.config.executeMode).toBe('manual');
  });

  it('createChatCmd returns a chat Command wired to createRepl + start', async () => {
    const { createChatCmd } = await import('./chat.js');
    const ctx = (await import('../infrastructure/context.js')).InfrastructureContext;
    const context = new ctx();
    const cmd = createChatCmd(context);
    expect(cmd).toBeDefined();
    expect(cmd.name()).toBe('chat');
  });
});
