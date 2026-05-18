/**
 * Agent Runtime 模块接口定义
 * 遵循 Interface-first 原则，不包含实现代码
 */

/**
 * Agent 适配器接口
 */
export interface IAgentAdapter {
  name: string;
  version: string;
  isAvailable(): Promise<boolean>;
  execute(
    command: string,
    args?: string[],
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      timeout?: number;
    }
  ): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
  getCapabilities(): Promise<string[]>;
}

/**
 * Agent 注册表接口
 */
export interface IAgentRegistry {
  register(adapter: IAgentAdapter): void;
  unregister(name: string): void;
  get(name: string): IAgentAdapter | undefined;
  list(): IAgentAdapter[];
  listAvailable(): Promise<IAgentAdapter[]>;
  select(name: string): IAgentAdapter | undefined;
}
