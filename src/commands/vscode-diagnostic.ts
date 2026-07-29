import { Command } from 'commander';
import { type InfrastructureContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';
import { createCliOutput, isCliOutputHandledError, markCliOutputHandled } from '../infrastructure/cli-output.js';

export interface VSCodeDiagnostic {
  message: string;
  severity: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  source?: string;
  code?: string | number;
}

export interface VSCodeDiagnosticFile {
  uri: string;
  filePath: string;
  diagnostics: VSCodeDiagnostic[];
}

export interface VSCodeBridgeResponse {
  ok: boolean;
  files: number;
  totalDiagnostics: number;
  data: VSCodeDiagnosticFile[];
  error?: string;
}

export interface BridgeInfo {
  port: number;
  token?: string;
}

export async function getBridgeInfo(context: InfrastructureContext): Promise<BridgeInfo> {
  const portFile = context.environment.getPath('bridge-port');
  const content = await context.environment.readFileAsync(portFile);
  const trimmed = content.trim();

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed.port === 'number' && parsed.port > 0) {
      return { port: parsed.port, token: parsed.token };
    }
  } catch {
    // fallback: plain number format (backward compatible)
  }

  const port = parseInt(trimmed, 10);
  if (isNaN(port) || port <= 0) {
    throw new VectaHubError(`Invalid bridge port: ${trimmed}`, ErrorType.RUNTIME);
  }
  return { port };
}

export async function getBridgePort(context: InfrastructureContext): Promise<number> {
  const info = await getBridgeInfo(context);
  return info.port;
}

export async function fetchDiagnosticsFromBridge(
  context: InfrastructureContext,
  options: {
    file?: string;
    severity?: string;
    port?: number;
  } = {},
): Promise<VSCodeBridgeResponse> {
  const info = await getBridgeInfo(context);
  const port = options.port ?? info.port;

  const url = new URL(`http://127.0.0.1:${port}/api/diagnostics`);
  if (options.file) {
    url.searchParams.set('file', options.file);
  }
  if (options.severity) {
    url.searchParams.set('severity', options.severity);
  }

  const headers: Record<string, string> = {};
  if (info.token) {
    headers['Authorization'] = `Bearer ${info.token}`;
  }

  const resp = await fetch(url.toString(), { headers });
  if (!resp.ok) {
    throw new VectaHubError(`Bridge returned HTTP ${resp.status}`, ErrorType.RUNTIME);
  }

  return (await resp.json()) as VSCodeBridgeResponse;
}

export function createVscodeDiagnosticCmd(context: InfrastructureContext): Command {
  const vscodeCmd = new Command('vscode')
    .description('VSCode IDE integration commands');

  vscodeCmd
    .command('diagnostic')
    .description('Fetch diagnostics (lint errors) from VSCode editor')
    .option('-f, --file <path>', 'Filter by file path')
    .option('-s, --severity <level>', 'Filter by severity (error, warning, information, hint)')
    .option('-p, --port <number>', 'Override bridge port', parseInt)
    .option('--json', 'Output as JSON')
    .action(async (options: { file?: string; severity?: string; port?: number; json?: boolean }) => {
      const output = createCliOutput({ json: Boolean(options.json) });
      try {
        const result = await fetchDiagnosticsFromBridge(context, {
          file: options.file,
          severity: options.severity,
          port: options.port,
        });

        if (options.json) {
          output.json(result, { space: 2 });
        } else {
          if (!result.ok) {
            output.error(`❌ Bridge error: ${result.error}`);
            throw markCliOutputHandled(new VectaHubError(`Bridge error: ${result.error}`, ErrorType.RUNTIME));
          }

          output.text(`📋 VSCode Diagnostics: ${result.totalDiagnostics} issues across ${result.files} files\n`);
          for (const file of result.data) {
            output.text(`  📄 ${file.filePath}`);
            for (const d of file.diagnostics) {
              const loc = `${d.range.start.line + 1}:${d.range.start.character + 1}`;
              const src = d.source ? ` [${d.source}]` : '';
              output.text(`    ${d.severity} ${loc}${src}: ${d.message}`);
            }
            output.blank();
          }
        }
      } catch (err) {
        if (isCliOutputHandledError(err)) {
          throw err;
        }

        const msg = err instanceof Error ? err.message : String(err);
        context.logger.getLogger('vscode-diagnostic').error({ error: err }, 'VSCode diagnostic command failed');
        if (options.json) {
          output.json({ ok: false, error: msg });
        } else {
          output.error(`❌ ${msg}`);
          output.error('💡 Make sure VSCode is open with the VectaHub extension active.');
        }
        if (err instanceof VectaHubError) {
          throw markCliOutputHandled(err);
        }
        throw markCliOutputHandled(new VectaHubError(`VSCode diagnostic failed: ${msg}`, ErrorType.RUNTIME, err));
      }
    });

  return vscodeCmd;
}
