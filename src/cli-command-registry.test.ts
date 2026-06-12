import { describe, it, expect, vi, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerLazyProxyCommands } from './cli-command-registry.js';
import { InfrastructureContext } from './infrastructure/context.js';

describe('registerLazyProxyCommands Parameter Routing', () => {
  const originalHas = Set.prototype.has;

  afterEach(() => {
    Set.prototype.has = originalHas;
    vi.restoreAllMocks();
  });

  it('should forward parameters correctly in standard CLI mode (cmdIndex !== -1)', async () => {
    let isInsideAction = false;
    
    // 模拟 loadedCommands.has('mode') 返回 true，避免触发真实的动态导入加载
    Set.prototype.has = function (this: Set<string>, value: string) {
      if (value === 'mode') {
        isInsideAction = true;
        return true;
      }
      return originalHas.call(this, value);
    };

    const mockArgv = ['node', 'cli.ts', 'mode', 'show', '--verbose'];
    const mockEnv = {
      getArgv: () => mockArgv,
      getHomePath: () => '/mock/home',
      getPath: (...args: string[]) => `/mock/home/${args.join('/')}`,
      resolvePath: (...args: string[]) => `/mock/cwd/${args.join('/')}`,
      joinPath: (...args: string[]) => args.join('/'),
    } as any;

    const ctx = new InfrastructureContext({ environment: mockEnv });
    const program = new Command();
    program.name('vectahub');
    program.exitOverride();

    // 注册代理命令
    registerLazyProxyCommands(program, ctx);

    // 准备一个 mock 的真实命令
    const mockRealModeCmd = new Command('mode').allowUnknownOption().arguments('[args...]');
    const parseAsyncSpy = vi.spyOn(mockRealModeCmd, 'parseAsync').mockResolvedValue(undefined as any);

    // 劫持 program.commands.find
    const originalFind = program.commands.find;
    vi.spyOn(program.commands, 'find').mockImplementation(function (this: any, ...args: any[]) {
      if (isInsideAction) {
        isInsideAction = false; // 重置
        return mockRealModeCmd;
      }
      return originalFind.apply(this, args);
    });

    // 模拟代理命令执行。lazyProxy 的 action 内部会检测 argv 并进行转发
    // 由于我们在 argv 中定义了 'mode'，cmdIndex !== -1 应该被触发
    await program.parseAsync(['node', 'cli.ts', 'mode', 'show', '--verbose']);

    // 验证转发参数是否正确（去掉了前面的 cli.ts 和 mode，剩下 show 和 --verbose）
    expect(parseAsyncSpy).toHaveBeenCalledTimes(1);
    expect(parseAsyncSpy.mock.calls[0][0]).toEqual(['show', '--verbose']);
  });

  it('should fallback to lazyProxyCmd.args in CommandBridge mode (cmdIndex === -1)', async () => {
    let isInsideAction = false;

    // 模拟 loadedCommands.has('mode') 返回 true，避免触发真实的动态导入加载
    Set.prototype.has = function (this: Set<string>, value: string) {
      if (value === 'mode') {
        isInsideAction = true;
        return true;
      }
      return originalHas.call(this, value);
    };

    // 在 REPL CommandBridge 下运行，进程全局 of argv 不包含 'mode'
    const mockArgv = ['node', 'cli.ts', 'chat'];
    const mockEnv = {
      getArgv: () => mockArgv,
      getHomePath: () => '/mock/home',
      getPath: (...args: string[]) => `/mock/home/${args.join('/')}`,
      resolvePath: (...args: string[]) => `/mock/cwd/${args.join('/')}`,
      joinPath: (...args: string[]) => args.join('/'),
    } as any;

    const ctx = new InfrastructureContext({ environment: mockEnv });
    const program = new Command();
    program.name('vectahub');
    program.exitOverride();

    // 注册代理命令
    registerLazyProxyCommands(program, ctx);

    // 准备一个 mock 的真实命令
    const mockRealModeCmd = new Command('mode').allowUnknownOption().arguments('[args...]');
    const parseAsyncSpy = vi.spyOn(mockRealModeCmd, 'parseAsync').mockResolvedValue(undefined as any);

    // 劫持 program.commands.find
    const originalFind = program.commands.find;
    vi.spyOn(program.commands, 'find').mockImplementation(function (this: any, ...args: any[]) {
      if (isInsideAction) {
        isInsideAction = false; // 重置
        return mockRealModeCmd;
      }
      return originalFind.apply(this, args);
    });

    // 在 CommandBridge.execute('mode show --verbose') 中，
    // 会直接调用 program.parseAsync(['mode', 'show', '--verbose'], { from: 'user' })
    await program.parseAsync(['mode', 'show', '--verbose'], { from: 'user' });

    // 验证转发参数是否正确，即便在全局 argv 中找不到 'mode'，依然能通过 fallback 获取到 'show', '--verbose'
    expect(parseAsyncSpy).toHaveBeenCalledTimes(1);
    expect(parseAsyncSpy.mock.calls[0][0]).toEqual(['show', '--verbose']);
  });
});
