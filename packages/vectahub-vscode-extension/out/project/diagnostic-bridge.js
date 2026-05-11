"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiagnosticBridge = void 0;
exports.collectAllDiagnostics = collectAllDiagnostics;
exports.filterDiagnostics = filterDiagnostics;
const vscode = __importStar(require("vscode"));
const node_http_1 = require("node:http");
const promises_1 = require("node:fs/promises");
const node_crypto_1 = require("node:crypto");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const VECTAHUB_HOME = process.env.VECTAHUB_HOME || (0, node_path_1.join)((0, node_os_1.homedir)(), '.vectahub');
const BRIDGE_PORT_FILE = (0, node_path_1.join)(VECTAHUB_HOME, 'bridge-port');
function collectAllDiagnostics() {
    const results = [];
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
function filterDiagnostics(all, filePath, severity) {
    let results = all;
    if (filePath) {
        results = results.filter(r => r.filePath === filePath || r.uri === filePath || r.filePath.endsWith(filePath));
    }
    if (severity) {
        const sevMap = {
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
function diagnosticSeverityLabel(s) {
    switch (s) {
        case vscode.DiagnosticSeverity.Error: return 'Error';
        case vscode.DiagnosticSeverity.Warning: return 'Warning';
        case vscode.DiagnosticSeverity.Information: return 'Information';
        case vscode.DiagnosticSeverity.Hint: return 'Hint';
        default: return 'Unknown';
    }
}
function serializeDiagnostics(results) {
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
class DiagnosticBridge {
    server = null;
    port = 0;
    token = '';
    async start() {
        this.token = (0, node_crypto_1.randomBytes)(16).toString('hex');
        this.server = (0, node_http_1.createServer)((req, res) => {
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
            }
            catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(err) }));
            }
        });
        return new Promise((resolve, reject) => {
            this.server.listen(0, '127.0.0.1', async () => {
                const addr = this.server.address();
                if (typeof addr === 'object' && addr) {
                    this.port = addr.port;
                    try {
                        await (0, promises_1.writeFile)(BRIDGE_PORT_FILE, JSON.stringify({ port: this.port, token: this.token }), 'utf-8');
                    }
                    catch {
                        // directory may not exist
                    }
                    resolve(this.port);
                }
                else {
                    reject(new Error('Failed to get server address'));
                }
            });
            this.server.on('error', reject);
        });
    }
    getPort() {
        return this.port;
    }
    getToken() {
        return this.token;
    }
    async dispose() {
        if (this.server) {
            await new Promise((resolve) => {
                this.server.close(() => resolve());
            });
            this.server = null;
        }
        try {
            await (0, promises_1.unlink)(BRIDGE_PORT_FILE);
        }
        catch {
            // file may not exist
        }
    }
}
exports.DiagnosticBridge = DiagnosticBridge;
//# sourceMappingURL=diagnostic-bridge.js.map