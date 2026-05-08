import type { ChatConfig } from './config.js';
import type { SessionContext, Workflow } from '../types/index.js';
import type { NLProcessor } from '../nl/core/types.js';
import type { SessionManager } from '../nl/session-manager.js';

export type ChatInputType = 'nl' | 'shell' | 'slash-command';

export interface ChatInput {
  type: ChatInputType;
  raw: string;
  parsed: string;
  args?: string[];
}

export type ChatOutputType = 'text' | 'workflow' | 'error' | 'command-result';

export interface ChatOutput {
  type: ChatOutputType;
  content: string;
  metadata?: Record<string, unknown> & {
    exit?: boolean;
    executionId?: string;
    status?: string;
    duration?: number;
    exitCode?: number;
    stderr?: string;
  };
}

export interface SlashCommandContext {
  sessionId: string;
  sessionManager?: SessionManager;
  config: ChatConfig;
}

export interface SlashCommand {
  name: string;
  description: string;
  handler: (args: string[], context: SlashCommandContext) => Promise<string | '__EXIT__' | '__EXECUTE__' | '__STATUS__'>;
}

export interface PendingWorkflow {
  workflow: Workflow;
  yaml: string;
  intent?: string;
  confidence?: number;
  createdAt: Date;
  params?: Record<string, unknown>;
}

export interface UIRenderer {
  render(output: ChatOutput): void;
  renderInfo(message: string): void;
  renderError(message: string): void;
  renderSuccess(message: string): void;
  renderWarning(message: string): void;
}

export interface ReplDeps {
  nlProcessor: NLProcessor;
  contextBuilder: { buildContext(sessionId?: string): Promise<unknown> };
  sessionManager?: SessionManager;
  useLLM: boolean;
  llmConfig: any; // Add this line
  workflowEngine?: any; // Keep any for now if not easily typeable, but we should fix it later
  commandExecutor?: any;
  commandBridge: any;
  paramExtractor: any;
  config: ChatConfig;
}

export type REPLDeps = ReplDeps;

export interface Repl {
  start: () => Promise<void>;
  processInput: (input: string) => Promise<ChatOutput>;
  getSlashCommands: () => Map<string, SlashCommand>;
}
