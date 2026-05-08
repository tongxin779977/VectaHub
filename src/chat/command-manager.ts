import type { SlashCommandContext, SlashCommand, ChatInput } from './types.js';

export class CommandManager {
  private slashCommands = new Map<string, SlashCommand>();

  constructor() {
    this.initDefaultSlashCommands();
  }

  registerSlashCommand(name: string, handler: SlashCommand['handler'], description = ''): void {
    this.slashCommands.set(name, { name, description, handler });
  }

  getSlashCommand(name: string): SlashCommand | undefined {
    return this.slashCommands.get(name);
  }

  getAllSlashCommands(): Map<string, SlashCommand> {
    return this.slashCommands;
  }

  parseInput(input: string): ChatInput {
    const trimmed = input.trim();
    if (trimmed.startsWith('!')) {
      return { type: 'shell', raw: trimmed, parsed: trimmed.slice(1).trim() };
    }
    if (trimmed.startsWith('/')) {
      const parts = trimmed.slice(1).trim().split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1);
      return { type: 'slash-command', raw: trimmed, parsed: cmd, args };
    }
    return { type: 'nl', raw: trimmed, parsed: trimmed };
  }

  private initDefaultSlashCommands() {
    this.registerSlashCommand('help', async () => {
      return 'Available commands:\n  /help - Show this help message\n  /history - Show conversation history\n  /config - Show configuration\n  /exit - Exit the REPL\n  /status - Show current session status\n  /execute - Manually execute the pending workflow';
    }, 'Show help message');

    this.registerSlashCommand('history', async (_, ctx) => {
      const sm = ctx.sessionManager;
      const session = sm?.getSession(ctx.sessionId);
      if (!session?.history?.length) {
        return 'No conversation history';
      }
      return session.history.map((h) => `[${h.role}]: ${h.content}`).join('\n');
    }, 'Show conversation history');

    this.registerSlashCommand('config', async (_, ctx) => {
      const config = ctx.config;
      const masked: Record<string, string> = {};
      for (const [k, v] of Object.entries(config)) {
        if (typeof v === 'string' && (v.startsWith('sk-') || v.startsWith('pk-') || v.startsWith('api_') || v.startsWith('token_'))) {
          masked[k] = v.slice(0, 2) + '***';
        } else {
          masked[k] = String(v);
        }
      }
      return Object.entries(masked).map(([k, v]) => `${k}: ${v}`).join('\n');
    }, 'Show current configuration');

    this.registerSlashCommand('exit', async () => '__EXIT__', 'Exit the REPL');

    this.registerSlashCommand('status', async () => {
      return '__STATUS__';
    }, 'Show session status');

    this.registerSlashCommand('execute', async () => {
      return '__EXECUTE__';
    }, 'Execute the pending workflow');
  }
}

export function createCommandManager(): CommandManager {
  return new CommandManager();
}
