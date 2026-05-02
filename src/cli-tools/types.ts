export interface CliTool {
  name: string;
  description: string;
  version: string;
  category?: string;
  tags?: string[];
  commands: Record<string, CliCommand>;
  dangerousCommands?: string[];
  examples?: ToolExample[];
  relatedTools?: string[];
}

export interface ToolExample {
  description: string;
  command: string;
  expectedOutput?: string;
}

export interface CliCommand {
  name: string;
  description: string;
  usage: string;
  examples: string[];
  options?: CliOption[];
  dangerous?: boolean;
  dangerLevel?: 'critical' | 'high' | 'medium' | 'low';
  requiresConfirmation?: boolean;
  category?: string;
  tags?: string[];
}

export interface CliOption {
  name: string;
  alias?: string;
  description: string;
  required?: boolean;
  defaultValue?: string | boolean | number;
  type?: 'string' | 'boolean' | 'number';
}

export interface CliToolResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  duration: number;
  context?: Record<string, any>;
}

export interface CliToolExecutor {
  execute(command: string, args: string[], options?: CliExecutionOptions): Promise<CliToolResult>;
  isAvailable(): Promise<boolean>;
  getVersion(): Promise<string>;
}

export interface CliExecutionOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  dryRun?: boolean;
  onConfirm?: () => Promise<boolean>;
  context?: Record<string, any>;
}

export interface CliToolRegistry {
  register(tool: CliTool): void;
  getTool(name: string): CliTool | undefined;
  getAllTools(): CliTool[];
  getToolsByCategory(category: string): CliTool[];
  searchTools(keyword: string): CliTool[];
  searchCommands(keyword: string): Array<{ tool: CliTool; command: CliCommand }>;
  getAllCategories(): string[];
  isCommandDangerous(toolName: string, command: string): boolean;
  getCommandInfo(toolName: string, commandName: string): CliCommand | undefined;
}

export interface ToolStep {
  tool: string;
  command: string;
  args: string[];
  options?: CliExecutionOptions;
}

export interface ToolChainResult {
  success: boolean;
  results: CliToolResult[];
  totalDuration: number;
  context?: Record<string, any>;
  error?: string;
  failedStep?: number;
}
