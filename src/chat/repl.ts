import * as readline from 'node:readline';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import type { ChatInput, ChatOutput, SlashCommands, SlashCommandContext } from '../types/chat.js';
import type { NLProcessor } from '../nl/core/types.js';
import type { ContextBuilder } from '../infrastructure/context-builder.js';
import type { ModuleRegistry } from '../infrastructure/module-registry.js';
import type { SessionManager } from '../infrastructure/session/session-manager.js';

export interface REPLDeps {
  nlProcessor: NLProcessor;
  contextBuilder: ContextBuilder;
  moduleRegistry: ModuleRegistry;
  sessionManager: SessionManager;
  useLLM: boolean;
}

interface ParsedInput {
  type: 'nl' | 'shell' | 'slash-command';
  raw: string;
  parsed: string;
  args?: string[];
}

interface SlashCommandEntry {
  name: string;
  description: string;
  handler: (args: string[], ctx: SlashCommandContext) => Promise<string>;
}

const slashCommands = new Map<string, SlashCommandEntry>();

export function registerSlashCommand(name: string, handler: (args: string[], ctx: SlashCommandContext) => Promise<string>): void {
  slashCommands.set(name, { name, description: '', handler });
}

function initDefaultSlashCommands() {
  if (slashCommands.size > 0) return;

  registerSlashCommand('help', async () => {
    return 'Available commands:\n  /help - Show this help message\n  /modules - List registered AIModules\n  /history - Show conversation history\n  /config - Show configuration\n  /exit - Exit the REPL';
  });

  registerSlashCommand('modules', async (_, ctx) => {
    const modules = ctx.moduleRegistry?.list?.() ?? [];
    if (modules.length === 0) {
      return 'No modules registered';
    }
    return modules.map((m: any) => `${m.id}: ${m.name} (${m.version})`).join('\n');
  });

  registerSlashCommand('history', async (_, ctx) => {
    const session = ctx.sessionManager?.getSession?.(ctx.sessionId);
    if (!session?.history?.length) {
      return 'No conversation history';
    }
    return session.history.map((h: any) => `[${h.role}]: ${h.content}`).join('\n');
  });

  registerSlashCommand('config', async (_, ctx) => {
    const config = (ctx as any).config ?? {};
    const masked: Record<string, string> = {};
    for (const [k, v] of Object.entries(config)) {
      if (typeof v === 'string' && (v.startsWith('sk-') || v.startsWith('pk-') || v.startsWith('api_') || v.startsWith('token_'))) {
        masked[k] = v.slice(0, 2) + '***';
      } else {
        masked[k] = String(v);
      }
    }
    return Object.entries(masked).map(([k, v]) => `${k}: ${v}`).join('\n');
  });

  registerSlashCommand('exit', async () => '__EXIT__');
}

export function parseInput(input: string): ParsedInput {
  if (input.startsWith('!')) {
    return { type: 'shell', raw: input, parsed: input.slice(1).trim() };
  }
  if (input.startsWith('/')) {
    const parts = input.slice(1).trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);
    return { type: 'slash-command', raw: input, parsed: cmd, args };
  }
  return { type: 'nl', raw: input, parsed: input };
}

function getHistoryFile(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return `${home}/.vectahub_history`;
}

export function createREPL(deps: REPLDeps, sessionId: string): (input: string) => Promise<ChatOutput> {
  const { nlProcessor, contextBuilder, moduleRegistry, sessionManager, useLLM } = deps;

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

    console.log(`[REPL DEBUG] Building context for sessionId: ${sessionId}`);
    const context = await deps.contextBuilder.buildContext(sessionId);
    console.log(`[REPL DEBUG] Context built successfully`);
    
    console.log(`[REPL DEBUG] Parsing input: "${parsed.parsed}"`);
    let nlResult;
    try {
      nlResult = await deps.nlProcessor.parse({
        input: parsed.parsed,
        sessionId,
        options: { useLLM },
      });
      console.log(`[REPL DEBUG] nlResult:`, JSON.stringify(nlResult, null, 2));
    } catch (err) {
      console.error(`[REPL DEBUG] nlProcessor.parse error:`, err instanceof Error ? err.message : String(err));
      console.error(`[REPL DEBUG] Error stack:`, err instanceof Error ? err.stack : 'No stack');
      throw err;
    }
    
    const matchedIntent = nlResult.intent || nlResult.taskList?.intent;

    if (matchedIntent === 'DIALOG_GREETING') {
      return {
        type: 'text',
        content: '👋 你好！我是 VectaHub，你的智能工作流助手。\n\n我可以帮助你执行各种开发任务，例如：\n  - 运行命令: vectahub run "npm test"\n  - 查找文件: vectahub run "查找所有ts文件"\n  - Git操作: vectahub run "git status"\n\n请问有什么可以帮你的？'
      };
    }

    if (nlResult.workflowYAML) {
      const intentInfo = nlResult.intent ? `\n🎯 识别意图: ${nlResult.intent}` : '';
      const confidenceInfo = `\n📊 置信度: ${((nlResult.confidence || 0) * 100).toFixed(0)}%`;

      return {
        type: 'text',
        content: `✅ 工作流已生成！${intentInfo}${confidenceInfo}\n\n\`\`\`yaml\n${nlResult.workflowYAML}\n\`\`\``,
        metadata: nlResult as Record<string, unknown>
      };
    }

    if (nlResult.taskList?.tasks && nlResult.taskList.tasks.length > 0) {
      const tasks = nlResult.taskList.tasks.map((task: any) => {
        const commands = task.commands?.map((cmd: any) =>
          `${cmd.cli} ${cmd.args?.join(' ') || ''}`
        ).join('\n    ');
        return `📋 Task: ${task.description}\n    Commands:\n    ${commands}`;
      }).join('\n\n');

      const intentInfo = nlResult.intent ? `\n🎯 识别意图: ${nlResult.intent}` : '';
      const confidenceInfo = `\n📊 置信度: ${((nlResult.confidence || 0) * 100).toFixed(0)}%`;

      return {
        type: 'text',
        content: `✅ 工作流已生成！${intentInfo}${confidenceInfo}\n\n${tasks}`,
        metadata: nlResult as Record<string, unknown>
      };
    }

    return { type: 'workflow', content: JSON.stringify(nlResult), metadata: nlResult as Record<string, unknown> };
  }

  function executeShellCommand(command: string): Promise<ChatOutput> {
    return new Promise((resolve) => {
      const parts = command.split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1);

      const child = spawn(cmd, args);
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
          content: `Command execution failed: ${err.message}`,
        });
      });
    });
  }

  return processInput;
}

export function createRepl(deps: REPLDeps, options?: { sessionId?: string; sessionManager?: SessionManager }): { start: () => Promise<void>; getSlashCommands: () => Map<string, unknown>; processInput: (input: string) => Promise<ChatOutput> } {
  initDefaultSlashCommands();
  const sessionId = options?.sessionId ?? `chat-${Date.now()}`;
  const processInputFn = createREPL(deps, sessionId);

  return {
    start: async () => {
      const historyFile = getHistoryFile();
      let isProcessing = false;
      let pendingClose = false;

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'vectahub> ',
        history: [],
        historySize: 100,
      });

      try {
        if (require('node:fs').existsSync(historyFile)) {
          const history = require('node:fs').readFileSync(historyFile, 'utf-8').split('\n').filter(Boolean);
          history.forEach((line: string) => rl.history.push(line));
        }
      } catch {
        // ignore history errors
      }

      const sessionId = `chat-${Date.now()}`;
      console.log(`[${new Date().toISOString()}] INFO (chat): Starting chat session: ${sessionId}`);

      rl.prompt();

      rl.on('line', async (line: string) => {
        const input = line.trim();
        console.log(`[REPL DEBUG] Received input: "${input}"`);
        
        if (!input) {
          rl.prompt();
          return;
        }

        if (input === 'exit' || input === 'quit' || input === 'q') {
          rl.close();
          return;
        }

        isProcessing = true;
        try {
          console.log(`[REPL DEBUG] Calling processInputFn...`);
          const output = await processInputFn(input);
          
          console.debug(`[REPL DEBUG] Output type: ${output.type}`);
          console.debug(`[REPL DEBUG] Output metadata:`, JSON.stringify(output.metadata));

          if (output.type === 'text') {
            console.log(output.content);
          } else if (output.type === 'command-result') {
            if (output.content) console.log(output.content);
            if (output.metadata?.stderr) console.error(output.metadata.stderr);
          } else if (output.type === 'workflow') {
            console.log(output.content);
          } else if (output.type === 'error') {
            console.error(output.content);
          } else {
            console.log(`[REPL DEBUG] Unknown output type: ${output.type}`);
            if (output.content) console.log(output.content);
          }
          
          if (output.metadata?.exit) {
            console.log('[REPL DEBUG] Exit flag detected, closing...');
            rl.close();
            return;
          }
        } catch (err) {
          console.error('Fatal error in REPL:', err instanceof Error ? err.message : String(err));
          console.error('Error stack:', err instanceof Error ? err.stack : 'No stack');
        } finally {
          isProcessing = false;
          if (pendingClose) {
            console.log('Goodbye!');
            process.exit(0);
          }
        }

        rl.prompt();
      });

      rl.on('close', () => {
        if (isProcessing) {
          console.log('[REPL DEBUG] Operation in progress, waiting to close...');
          pendingClose = true;
        } else {
          console.log('Goodbye!');
          process.exit(0);
        }
      });
    },
    getSlashCommands: () => slashCommands as Map<string, unknown>,
    processInput: processInputFn
  };
}