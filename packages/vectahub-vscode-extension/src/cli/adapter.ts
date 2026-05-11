import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { getCliPath } from '../config/settings.js';
import { getGlobalCliPath } from '../extension.js';
import { CliResult, CliOptions } from './types.js';
import { logToOutput } from '../ui/output.js';
import path from 'path';
import { homedir } from 'os';
import { ProcessManager } from './process-manager.js';

let globalContext: vscode.ExtensionContext;

export function initCliAdapter(context: vscode.ExtensionContext) {
  globalContext = context;
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
  const cliPath = getActualCliPath();
  
  let spawnCmd = cliPath;
  let spawnArgs = args;
  
  if (cliPath.startsWith('node ')) {
    spawnCmd = 'node';
    spawnArgs = [cliPath.slice(5), ...args];
  }
  
  const cwd = options.cwd || getActiveWorkspaceFolder();

  const vectahubHome = getVectaHubHome();
  
  const env = {
    ...process.env,
    CI: '1',
    VECTAHUB_NON_INTERACTIVE: '1',
    VECTAHUB_HOME: vectahubHome,
    VECTAHUB_CLI_PATH: cliPath,
    ...options.env
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

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      logToOutput(output);
    });

    child.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      logToOutput(output, 'error');
    });

    options.token?.onCancellationRequested(() => {
      child.kill();
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
        try {
          data = JSON.parse(stdout.trim());
          if (data && typeof data === 'object' && 'ok' in data) {
            const jsonResult = data as { ok?: boolean; status?: string; error?: { code?: string; message?: string } };
            if (jsonResult.ok === true || jsonResult.status === 'COMPLETED') {
              ok = true;
            } else if (jsonResult.ok === false) {
              ok = false;
              if (jsonResult.error) {
                error = { code: jsonResult.error.code || 'CLI_ERROR', message: jsonResult.error.message || 'Unknown error' };
              }
            }
          }
        } catch (e: unknown) {
          const parseError = e as Error;
          logToOutput(`Failed to parse JSON output: ${parseError.message}`, 'error');
          if (ok) {
            const repaired = tryRepairTruncatedJson(stdout.trim());
            if (repaired) {
              try {
                data = JSON.parse(repaired);
                logToOutput('Successfully repaired truncated JSON');
              } catch { /* repair failed too */ }
            }
          }
          if (ok && !data) {
            ok = false;
            error = { code: 'INVALID_JSON', message: 'Failed to parse CLI JSON output', details: parseError.message };
          }
        }
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

function tryRepairTruncatedJson(s: string): string | null {
  const lastBrace = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (lastBrace < 0) return null;
  return s.slice(0, lastBrace + 1);
}
