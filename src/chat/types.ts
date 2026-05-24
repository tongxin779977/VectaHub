import type { ChatConfig } from './config.js';
import type { Workflow } from '../types/index.js';
import type { NLProcessor } from '../nl/core/types.js';
import type { SessionManager } from '../nl/session-manager.js';
import type { LLMConfig } from '../nl/llm.js';
import type { WorkflowEngine } from '../workflow/engine.js';
import type { CommandBridge } from './command-bridge.js';
import type { ParamExtractor } from '../nl/param-extractor.js';
import type { ContextBuilderResult } from './context-builder.js';
import type { CommandExecutor } from '../nl/executor/command-executor.js';
import type { AuditHelper } from '../infrastructure/audit/index.js';
import type pino from 'pino';

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
  metadata?: {
    exit?: boolean;
    executionId?: string;
    status?: string;
    duration?: number;
    exitCode?: number;
    stderr?: string;
    intent?: string;
    confidence?: number;
    path?: string;
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
  contextBuilder: { buildContext(sessionId?: string): Promise<ContextBuilderResult> };
  sessionManager?: SessionManager;
  useLLM: boolean;
  llmConfig?: LLMConfig | null;
  auditHelper: AuditHelper;
  workflowEngine?: WorkflowEngine;
  commandExecutor?: CommandExecutor;
  commandBridge: CommandBridge;
  paramExtractor: ParamExtractor;
  config: ChatConfig;
  logger: pino.Logger;
}

export type REPLDeps = ReplDeps;

export interface Repl {
  start: () => Promise<void>;
  processInput: (input: string) => Promise<ChatOutput>;
  getSlashCommands: () => Map<string, SlashCommand>;
}
