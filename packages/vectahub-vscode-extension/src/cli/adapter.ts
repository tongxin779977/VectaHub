import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { getCliPath } from '../config/settings.js';
import { getGlobalCliPath } from '../extension.js';
import { CliResult, CliOptions } from './types.js';
import { logToOutput } from '../ui/output.js';
import path from 'path';
import { homedir } from 'os';
import { ProcessManager } from './process-manager.js';
import { createCliTraceEnv, createRootTraceContext, startSpan } from '../trace/index.js';

export function initCliAdapter(_context: vscode.ExtensionContext) {
  // Kept for extension activation compatibility.
}

function getActualCliPath(): string {
  const cachedPath = getGlobalCliPath();
  if (cachedPath) {
    return cachedPath;
  }
  return getCliPath();
}

export function getVectaHubHome(): string {
  return path.join(homedir(), '.vectahub');
}

export function parseCliPath(cliPath: string): { cmd: string; extraArgs: string[] } {
  const trimmed = cliPath.trim();
  if (trimmed.startsWith('node ')) {
    const rest = trimmed.slice(5).trim();
    return { cmd: 'node', extraArgs: [rest] };
  }
  return { cmd: trimmed, extraArgs: [] };
}

export function getActiveWorkspaceFolder(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (folder) return folder.uri.fsPath;
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export async function runCli<T = unknown>(args: string[], options: CliOptions = {}): Promise<CliResult<T>> {
  const baseTraceContext = options.traceContext || createRootTraceContext();
  const rootSpan = startSpan('vscode.cli.spawn', {
    context: baseTraceContext,
    source: 'vscode',
    attributes: {
      command: args[0] || '',
      argsCount: args.length,
    }
  });
  const cliPath = getActualCliPath();
  
  const { cmd: spawnCmd, extraArgs: spawnExtra } = parseCliPath(cliPath);
  const spawnArgs = [...spawnExtra, ...args];
  
  const cwd = options.cwd || getActiveWorkspaceFolder();

  const vectahubHome = getVectaHubHome();
  
  const env = {
    ...process.env,
    CI: '1',
    VECTAHUB_NON_INTERACTIVE: '1',
    VECTAHUB_HOME: vectahubHome,
    VECTAHUB_CLI_PATH: cliPath,
    ...options.env,
    ...createCliTraceEnv(baseTraceContext, rootSpan.spanId)
  };

  logToOutput(`Running CLI: ${cliPath} ${args.join(' ')}`);

  return new Promise((resolve) => {
    const child = spawn(spawnCmd, spawnArgs, {
      cwd,
      env,
      timeout: options.timeout || 30000,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    ProcessManager.getInstance().register(child);

    const MAX_STDOUT_LENGTH = 500000;
    const MAX_STDERR_LENGTH = 100000;

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const output = data.toString();
      logToOutput(output);
      if (stdout.length >= MAX_STDOUT_LENGTH) {
        return;
      }
      stdout += output;
      if (stdout.length > MAX_STDOUT_LENGTH) {
        stdout += '\n... (stdout truncated)';
      }
    });

    child.stderr.on('data', (data) => {
      const output = data.toString();
      logToOutput(output, 'error');
      if (stderr.length >= MAX_STDERR_LENGTH) {
        return;
      }
      stderr += output;
    });

    options.token?.onCancellationRequested(() => {
      child.kill();
      const cancelled = new Error('Command was cancelled by user');
      void startSpan('vscode.cli.cancel', {
        context: baseTraceContext,
        parentSpanId: rootSpan.spanId,
        source: 'vscode',
      }).fail(cancelled, { command: args[0] || '' });
      void rootSpan.fail(cancelled, {
        exitCode: null,
        stdoutLength: stdout.length,
        stderrLength: stderr.length,
      });
      resolve({
        ok: false,
        stdout,
        stderr,
        exitCode: null,
        error: { code: 'CANCELLED', message: 'Command was cancelled by user' }
      });
    });

    child.on('close', (code) => {
      const isJson = args.includes('--json');
      let data: T | undefined;
      let ok = code === 0;
      let error: CliResult['error'];

      if (isJson && stdout.trim()) {
        const parseSpan = startSpan('vscode.cli.parseJson', {
          context: baseTraceContext,
          parentSpanId: rootSpan.spanId,
          source: 'vscode',
        });
        const parsed = parseCliJsonOutput<T>(stdout.trim());
        if (parsed.ok) {
          void parseSpan.end({ stdoutLength: stdout.length });
          data = parsed.data;
          if (data && typeof data === 'object' && 'ok' in data) {
            const jsonResult = data as { ok?: boolean; status?: string; error?: string | { code?: string; message?: string } };
            if (jsonResult.ok === true || jsonResult.status === 'COMPLETED') {
              ok = true;
            } else if (jsonResult.ok === false) {
              ok = false;
              if (typeof jsonResult.error === 'string') {
                error = { code: 'CLI_ERROR', message: jsonResult.error };
              } else if (jsonResult.error) {
                error = { code: jsonResult.error.code || 'CLI_ERROR', message: jsonResult.error.message || 'Unknown error' };
              }
            }
          }
        } else {
          void parseSpan.fail(parsed.error, { stdoutLength: stdout.length });
          const parseError = parsed.error;
          logToOutput(`Failed to parse JSON output: ${parseError.message}`, 'error');
          if (ok) {
            ok = false;
            error = { code: 'INVALID_JSON', message: 'Failed to parse CLI JSON output', details: parseError.message };
          }
        }
      }

      const rootAttrs = {
        exitCode: code,
        stdoutLength: stdout.length,
        stderrLength: stderr.length,
        durationMs: undefined as unknown,
      };
      if (ok) {
        void rootSpan.end(rootAttrs);
      } else {
        void rootSpan.fail(error?.message || 'CLI command failed', rootAttrs);
      }

      resolve({
        ok,
        data,
        stdout,
        stderr,
        exitCode: code,
        error
      });
    });

    child.on('error', (err) => {
      logToOutput(`CLI Spawn Error: ${err.message}`, 'error');
      void startSpan('vscode.cli.spawnError', {
        context: baseTraceContext,
        parentSpanId: rootSpan.spanId,
        source: 'vscode',
      }).fail(err, { command: args[0] || '' });
      void rootSpan.fail(err, {
        exitCode: null,
        stdoutLength: 0,
        stderrLength: err.message.length,
      });
      resolve({
        ok: false,
        stdout: '',
        stderr: err.message,
        exitCode: null,
        error: { code: 'SPAWN_ERROR', message: err.message }
      });
    });
  });
}

type JsonParseResult<T> = { ok: true; data: T } | { ok: false; error: Error };

export function parseCliJsonOutput<T = unknown>(text: string): JsonParseResult<T> {
  const direct = tryParseJson<T>(text);
  if (direct.ok) return direct;

  const codeBlock = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (codeBlock?.[1]) {
    const parsed = tryParseJson<T>(codeBlock[1].trim());
    if (parsed.ok) return parsed;
  }

  for (const candidate of extractJsonValueCandidates(text)) {
    if (candidate === text) continue;
    const parsed = tryParseJson<T>(candidate);
    if (parsed.ok) return parsed;
  }

  return direct;
}

function tryParseJson<T>(text: string): JsonParseResult<T> {
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

function extractJsonValueCandidates(text: string): string[] {
  const candidates: string[] = [];

  for (let start = 0; start < text.length; start++) {
    const first = text[start];
    if (first !== '{' && first !== '[') continue;

    const expectedClosers: string[] = [];
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const char = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        expectedClosers.push('}');
      } else if (char === '[') {
        expectedClosers.push(']');
      } else if (char === '}' || char === ']') {
        if (expectedClosers.pop() !== char) break;
        if (expectedClosers.length === 0) {
          candidates.push(text.slice(start, i + 1));
          break;
        }
      }
    }
  }

  return candidates;
}
