import * as vscode from 'vscode';
import { createServer, Server } from 'node:http';
import { writeFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { getVectaHubHome } from '../cli/adapter.js';

export interface DiagnosticBridgeResult {
  uri: string;
  filePath: string;
  diagnostics: vscode.Diagnostic[];
}

export function collectAllDiagnostics(): DiagnosticBridgeResult[] {
  const results: DiagnosticBridgeResult[] = [];
  const uris = vscode.languages.getDiagnostics();

  for (const [uri, diagnostics] of uris) {
    results.push({
      uri: uri.toString(),
      filePath: uri.fsPath,
      diagnostics,
    });
  }

  return results;
}

export function filterDiagnostics(
  all: DiagnosticBridgeResult[],
  filePath?: string,
  severity?: string,
): DiagnosticBridgeResult[] {
  let results = all;

  if (filePath) {
    results = results.filter(r =>
      r.filePath === filePath || r.uri === filePath || r.filePath.endsWith(filePath),
    );
  }

  if (severity) {
    const sevMap: Record<string, vscode.DiagnosticSeverity> = {
      error: vscode.DiagnosticSeverity.Error,
      warning: vscode.DiagnosticSeverity.Warning,
      information: vscode.DiagnosticSeverity.Information,
      hint: vscode.DiagnosticSeverity.Hint,
    };
    const targetSev = sevMap[severity.toLowerCase()];
    if (targetSev !== undefined) {
      results = results
        .map(r => ({
          ...r,
          diagnostics: r.diagnostics.filter(d => d.severity === targetSev),
        }))
        .filter(r => r.diagnostics.length > 0);
    }
  }

  return results;
}

function diagnosticSeverityLabel(s: vscode.DiagnosticSeverity): string {
  switch (s) {
    case vscode.DiagnosticSeverity.Error: return 'Error';
    case vscode.DiagnosticSeverity.Warning: return 'Warning';
    case vscode.DiagnosticSeverity.Information: return 'Information';
    case vscode.DiagnosticSeverity.Hint: return 'Hint';
    default: return 'Unknown';
  }
}

function serializeDiagnostics(results: DiagnosticBridgeResult[]) {
  return results.map(r => ({
    uri: r.uri,
    filePath: r.filePath,
    diagnostics: r.diagnostics.map(d => ({
      message: d.message,
      severity: diagnosticSeverityLabel(d.severity),
      range: {
        start: { line: d.range.start.line, character: d.range.start.character },
        end: { line: d.range.end.line, character: d.range.end.character },
      },
      source: d.source,
      code: typeof d.code === 'object' ? d.code.value : d.code,
    })),
  }));
}

function getBridgePortFile(): string {
  return join(getVectaHubHome(), 'bridge-port');
}

export class DiagnosticBridge implements vscode.Disposable {
  private server: Server | null = null;
  private port: number = 0;
  private token: string = '';

  async start(): Promise<number> {
    this.token = randomBytes(16).toString('hex');

    this.server = createServer((req, res) => {
      if (req.method !== 'GET' || !req.url?.startsWith('/api/diagnostics')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      const authHeader = req.headers['authorization'];
      if (authHeader !== `Bearer ${this.token}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      const url = new URL(req.url, `http://localhost:${this.port}`);
      const filePath = url.searchParams.get('file') ?? undefined;
      const severity = url.searchParams.get('severity') ?? undefined;

      try {
        const all = collectAllDiagnostics();
        const filtered = filterDiagnostics(all, filePath, severity);
        const serialized = serializeDiagnostics(filtered);
        const totalDiagnostics = serialized.reduce((sum, f) => sum + f.diagnostics.length, 0);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          files: serialized.length,
          totalDiagnostics,
          data: serialized,
        }));
      } catch {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Internal server error' }));
      }
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(0, '127.0.0.1', async () => {
        const addr = this.server!.address();
        if (typeof addr === 'object' && addr) {
          this.port = addr.port;
          try {
            await writeFile(getBridgePortFile(), JSON.stringify({ port: this.port, token: this.token }), 'utf-8');
          } catch {
            // directory may not exist
          }
          resolve(this.port);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });
      this.server!.on('error', reject);
    });
  }

  getPort(): number {
    return this.port;
  }

  getToken(): string {
    return this.token;
  }

  async dispose(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }
    try {
      await unlink(getBridgePortFile());
    } catch {
      // file may not exist
    }
  }
}
