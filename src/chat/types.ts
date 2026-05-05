import type { AIModuleRegistry } from '../skills/ai-modules/types.js';

export interface ChatConfig {
  prompt: string;
  historyLimit: number;
  sessionDir: string;
}

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
  metadata?: Record<string, unknown>;
}

export interface SlashCommand {
  name: string;
  description: string;
  handler: (args: string[], context: SlashCommandContext) => Promise<string>;
}

export interface SlashCommandContext {
  sessionId?: string;
  moduleRegistry?: AIModuleRegistry;
  sessionManager?: unknown;
  config?: Record<string, unknown>;
}

export interface ReplDeps {
  nlProcessor: { parse(context: unknown): Promise<unknown> };
  contextBuilder: { buildContext(sessionId?: string): Promise<unknown> };
  executor?: { execute(workflow: unknown, options?: unknown): Promise<unknown> };
  moduleRegistry?: AIModuleRegistry;
  sandboxManager?: unknown;
  config?: Partial<ChatConfig>;
}

export interface Repl {
  start: () => Promise<void>;
  processInput: (input: string) => Promise<ChatOutput>;
  getSlashCommands: () => Map<string, SlashCommand>;
}
