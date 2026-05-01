export interface CliTool {
  name: string;
  description: string;
  version: string;
  commands: Record<string, CliCommand>;
  dangerousCommands?: string[];
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
}

export interface CliOption {
  name: string;
  alias?: string;
  description: string;
  required?: boolean;
  defaultValue?: string | boolean;
  type?: 'string' | 'boolean' | 'number';
}

export interface CliToolResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  duration: number;
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
}

export interface CliToolRegistry {
  register(tool: CliTool): void;
  getTool(name: string): CliTool | undefined;
  getAllTools(): CliTool[];
  isCommandDangerous(toolName: string, command: string): boolean;
  getCommandInfo(toolName: string, commandName: string): CliCommand | undefined;
}
