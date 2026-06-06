/**
 * CLI 工具定义接口
 * 描述一个 CLI 工具的完整信息，包括名称、版本、命令列表等
 */
export interface CliTool {
  /** 工具名称，例如 'git'、'npm' */
  name: string;
  /** 工具描述 */
  description: string;
  /** 工具版本要求，使用 semver 格式 */
  version: string;
  /** 工具分类，例如 'version-control'、'package-management' */
  category?: string;
  /** 工具标签，用于搜索和过滤 */
  tags?: string[];
  /** 工具支持的命令列表 */
  commands: Record<string, CliCommand>;
  /** 危险命令列表，这些命令需要特殊处理或确认 */
  dangerousCommands?: string[];
  /** 工具使用示例 */
  examples?: ToolExample[];
  /** 相关工具列表 */
  relatedTools?: string[];
  /** 认证检查命令 */
  authCheckCommand?: string;
  /** 认证帮助信息 */
  authHelpMessage?: string;
  /** 工具能力列表 */
  capabilities?: string[];
  /** 是否为 Agent CLI 工具 */
  isAgentCLI?: boolean;
}

/**
 * 工具使用示例
 */
export interface ToolExample {
  /** 示例描述 */
  description: string;
  /** 示例命令 */
  command: string;
  /** 预期输出 */
  expectedOutput?: string;
}

/**
 * CLI 命令定义接口
 * 描述一个 CLI 命令的详细信息
 */
export interface CliCommand {
  /** 命令名称，例如 'commit'、'push' */
  name: string;
  /** 命令描述 */
  description: string;
  /** 命令用法，例如 'git commit -m "message"' */
  usage: string;
  /** 命令使用示例 */
  examples: string[];
  /** 命令选项列表 */
  options?: CliOption[];
  /** 是否为危险命令 */
  dangerous?: boolean;
  /** 危险等级 */
  dangerLevel?: 'critical' | 'high' | 'medium' | 'low';
  /** 是否需要确认 */
  requiresConfirmation?: boolean;
  /** 命令分类 */
  category?: string;
  /** 命令标签 */
  tags?: string[];
}

/**
 * CLI 选项定义接口
 * 描述一个 CLI 命令的选项
 */
export interface CliOption {
  /** 选项名称，例如 '--verbose'、'-v' */
  name: string;
  /** 选项别名 */
  alias?: string;
  /** 选项描述 */
  description: string;
  /** 是否为必需选项 */
  required?: boolean;
  /** 默认值 */
  defaultValue?: string | boolean | number;
  /** 选项类型 */
  type?: 'string' | 'boolean' | 'number';
}

/**
 * CLI 工具执行结果接口
 * 描述一个 CLI 命令的执行结果
 */
export interface CliToolResult {
  /** 是否执行成功 */
  success: boolean;
  /** 标准输出 */
  output: string;
  /** 错误信息 */
  error?: string;
  /** 退出码 */
  exitCode: number;
  /** 执行时长（毫秒） */
  duration: number;
  /** 执行上下文 */
  context?: Record<string, unknown>;
}

/**
 * CLI 工具执行器接口
 * 定义执行 CLI 命令的标准接口
 */
export interface CliToolExecutor {
  /** 执行命令 */
  execute(command: string, args: string[], options?: CliExecutionOptions): Promise<CliToolResult>;
  /** 检查工具是否可用 */
  isAvailable(): Promise<boolean>;
  /** 获取工具版本 */
  getVersion(): Promise<string>;
}

/**
 * CLI 执行选项接口
 * 描述执行 CLI 命令时的配置选项
 */
export interface CliExecutionOptions {
  /** 工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 是否为干运行模式 */
  dryRun?: boolean;
  /** 确认回调函数，用于危险命令的确认 */
  onConfirm?: () => Promise<boolean>;
  /** 执行上下文 */
  context?: Record<string, unknown>;
}

/**
 * CLI 工具注册表接口
 * 管理所有注册的 CLI 工具
 */
export interface CliToolRegistry {
  /** 注册一个工具 */
  register(tool: CliTool): void;
  /** 根据名称获取工具 */
  getTool(name: string): CliTool | undefined;
  /** 获取所有已注册的工具 */
  getAllTools(): CliTool[];
  /** 根据分类获取工具 */
  getToolsByCategory(category: string): CliTool[];
  /** 搜索工具 */
  searchTools(keyword: string): CliTool[];
  /** 搜索命令 */
  searchCommands(keyword: string): Array<{ tool: CliTool; command: CliCommand }>;
  /** 获取所有分类 */
  getAllCategories(): string[];
  /** 检查命令是否危险 */
  isCommandDangerous(toolName: string, command: string): boolean;
  /** 获取命令信息 */
  getCommandInfo(toolName: string, commandName: string): CliCommand | undefined;
}

/**
 * 工具链步骤接口
 * 描述工具链中的一个执行步骤
 */
export interface ToolStep {
  /** 工具名称 */
  tool: string;
  /** 命令名称 */
  command: string;
  /** 命令参数 */
  args: string[];
  /** 执行选项 */
  options?: CliExecutionOptions;
}

/**
 * 工具链执行结果接口
 * 描述工具链的完整执行结果
 */
export interface ToolChainResult {
  /** 是否执行成功 */
  success: boolean;
  /** 每个步骤的执行结果 */
  results: CliToolResult[];
  /** 总执行时长（毫秒） */
  totalDuration: number;
  /** 最终上下文 */
  context?: Record<string, unknown>;
  /** 错误信息 */
  error?: string;
  /** 失败的步骤索引 */
  failedStep?: number;
}
