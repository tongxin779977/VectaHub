import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { getVectaHubPath } from '../utils/paths.js';

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

export async function getBridgeInfo(): Promise<BridgeInfo> {
  const portFile = getVectaHubPath('bridge-port');
  const content = await readFile(portFile, 'utf-8');
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
    throw new Error(`Invalid bridge port: ${trimmed}`);
  }
  return { port };
}

export async function getBridgePort(): Promise<number> {
  const info = await getBridgeInfo();
  return info.port;
}

export async function fetchDiagnosticsFromBridge(options: {
  file?: string;
  severity?: string;
  port?: number;
} = {}): Promise<VSCodeBridgeResponse> {
  const info = await getBridgeInfo();
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
    throw new Error(`Bridge returned HTTP ${resp.status}`);
  }

  return (await resp.json()) as VSCodeBridgeResponse;
}

export const vscodeDiagnosticCmd = new Command('vscode')
  .description('VSCode IDE integration commands');

vscodeDiagnosticCmd
  .command('diagnostic')
  .description('Fetch diagnostics (lint errors) from VSCode editor')
  .option('-f, --file <path>', 'Filter by file path')
  .option('-s, --severity <level>', 'Filter by severity (error, warning, information, hint)')
  .option('-p, --port <number>', 'Override bridge port', parseInt)
  .option('--json', 'Output as JSON')
  .action(async (options: { file?: string; severity?: string; port?: number; json?: boolean }) => {
    try {
      const result = await fetchDiagnosticsFromBridge({
        file: options.file,
        severity: options.severity,
        port: options.port,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (!result.ok) {
          console.error(`❌ Bridge error: ${result.error}`);
          process.exit(1);
        }

        console.log(`📋 VSCode Diagnostics: ${result.totalDiagnostics} issues across ${result.files} files\n`);
        for (const file of result.data) {
          console.log(`  📄 ${file.filePath}`);
          for (const d of file.diagnostics) {
            const loc = `${d.range.start.line + 1}:${d.range.start.character + 1}`;
            const src = d.source ? ` [${d.source}]` : '';
            console.log(`    ${d.severity} ${loc}${src}: ${d.message}`);
          }
          console.log();
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (options.json) {
        console.log(JSON.stringify({ ok: false, error: msg }));
      } else {
        console.error(`❌ ${msg}`);
        console.error('💡 Make sure VSCode is open with the VectaHub extension active.');
      }
      process.exit(1);
    }
  });
