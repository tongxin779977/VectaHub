import * as readline from 'node:readline';
import { spawn } from 'node:child_process';
import type { ChatInput, ChatOutput, ReplDeps, SlashCommand, SlashCommandContext } from './types.js';

export function parseInput(raw: string): ChatInput {
  if (raw.startsWith('!')) {
    return { type: 'shell', raw, parsed: raw.slice(1) };
  }
  if (raw.startsWith('/')) {
    const parts = raw.slice(1).split(/\s+/);
    return {
      type: 'slash-command',
      raw,
      parsed: parts[0],
      args: parts.slice(1),
    };
  }
  return { type: 'nl', raw, parsed: raw };
}

function maskSensitive(value: unknown): string {
  if (typeof value !== 'string') return String(value);
  if (value.length <= 4) return '***';
  return value.slice(0, 3) + '***';
}

function isSensitiveKey(key: string): boolean {
  const sensitivePatterns = ['key', 'token', 'secret', 'password', 'credential', 'auth'];
  return sensitivePatterns.some((p) => key.toLowerCase().includes(p));
}

function formatConfig(config: Record<string, unknown>, indent = ''): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      lines.push(`${indent}${key}:`);
      lines.push(formatConfig(value as Record<string, unknown>, indent + '  '));
    } else if (isSensitiveKey(key)) {
      lines.push(`${indent}${key}: ${maskSensitive(value)}`);
    } else {
      lines.push(`${indent}${key}: ${value}`);
    }
  }
  return lines.join('\n');
}

export function createRepl(deps: ReplDeps, options?: { sessionId?: string; sessionManager?: unknown }) {
  const prompt = deps.config?.prompt ?? 'vectahub> ';
  const sessionId = options?.sessionId;
  const sessionManager = options?.sessionManager;

  const slashCommands = new Map<string, SlashCommand>();

  const helpCommand: SlashCommand = {
    name: 'help',
    description: 'List all available commands',
    handler: async () => {
      const lines: string[] = ['Available commands:'];
      for (const [, cmd] of slashCommands) {
        lines.push(`  /${cmd.name} - ${cmd.description}`);
      }
      return lines.join('\n');
    },
  };

  const modulesCommand: SlashCommand = {
    name: 'modules',
    description: 'List registered AIModules',
    handler: async (_args, context) => {
      const registry = context.moduleRegistry ?? deps.moduleRegistry;
      if (!registry) {
        return 'No module registry available. Start chat with module support to enable this feature.';
      }
      const modules = registry.list();
      if (modules.length === 0) {
        return 'No AIModules registered.';
      }
      const lines = modules.map((m: { id: string; name: string; version: string }) =>
        `  ${m.id} - ${m.name} (v${m.version})`
      );
      return `Registered AIModules (${modules.length}):\n${lines.join('\n')}`;
    },
  };

  const historyCommand: SlashCommand = {
    name: 'history',
    description: 'Show conversation history',
    handler: async (_args, context) => {
      const sm = context.sessionManager ?? sessionManager;
      const sid = context.sessionId ?? sessionId;
      if (!sm || !sid) {
        return 'No session active. Start chat with a session to enable history.';
      }
      const smAny = sm as { getSession?: (id: string) => { history: Array<{ role: string; content: string }> } | undefined };
      const session = smAny.getSession?.(sid);
      if (!session || session.history.length === 0) {
        return 'No conversation history.';
      }
      const lines = session.history.map((msg: { role: string; content: string }) =>
        `${msg.role === 'user' ? 'You' : 'Assistant'}: ${msg.content}`
      );
      return `Conversation history:\n${lines.join('\n')}`;
    },
  };

  const configCommand: SlashCommand = {
    name: 'config',
    description: 'Show AI configuration (keys masked)',
    handler: async (_args, context) => {
      const cfg = context.config;
      if (!cfg || Object.keys(cfg).length === 0) {
        return 'No configuration available.';
      }
      return `AI Configuration:\n${formatConfig(cfg)}`;
    },
  };

  const exitCommand: SlashCommand = {
    name: 'exit',
    description: 'Exit the chat session',
    handler: async () => '__EXIT__',
  };

  slashCommands.set('help', helpCommand);
  slashCommands.set('modules', modulesCommand);
  slashCommands.set('history', historyCommand);
  slashCommands.set('config', configCommand);
  slashCommands.set('exit', exitCommand);

  async function processInput(input: string): Promise<ChatOutput> {
    const parsed = parseInput(input.trim());

    if (parsed.type === 'shell') {
      return executeShellCommand(parsed.parsed);
    }

    if (parsed.type === 'slash-command') {
      const cmd = slashCommands.get(parsed.parsed);
      if (!cmd) {
        return { type: 'error', content: `Unknown command: /${parsed.parsed}. Type /help for available commands.` };
      }
      const ctx: SlashCommandContext = {
        sessionId,
        moduleRegistry: deps.moduleRegistry,
        sessionManager,
      };
      const result = await cmd.handler(parsed.args ?? [], ctx);
      if (result === '__EXIT__') {
        return { type: 'text', content: result, metadata: { exit: true } };
      }
      return { type: 'text', content: result };
    }

    const context = await deps.contextBuilder.buildContext(sessionId);
    const nlResult = await deps.nlProcessor.parse({ input: parsed.parsed, context });
    return { type: 'workflow', content: JSON.stringify(nlResult), metadata: nlResult as Record<string, unknown> };
  }

  function executeShellCommand(command: string): Promise<ChatOutput> {
    return new Promise((resolve) => {
      const parts = command.split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1);

      const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code: number) => {
        resolve({
          type: 'command-result',
          content: stdout || stderr,
          metadata: { exitCode: code, stderr },
        });
      });

      child.on('error', (err: Error) => {
        resolve({
          type: 'error',
          content: `Shell command failed: ${err.message}`,
        });
      });
    });
  }

  async function start(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt,
    });

    rl.prompt();

    for await (const line of rl) {
      const trimmed = line.trim();

      if (trimmed === 'exit' || trimmed === 'quit') {
        console.log('Goodbye!');
        rl.close();
        break;
      }

      const output = await processInput(trimmed);
      console.log(output.content);

      if (output.metadata?.exit) {
        console.log('Goodbye!');
        rl.close();
        break;
      }

      rl.prompt();
    }
  }

  return {
    start,
    processInput,
    getSlashCommands: () => slashCommands,
  };
}
