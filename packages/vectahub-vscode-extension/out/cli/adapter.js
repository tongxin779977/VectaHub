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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCliAdapter = initCliAdapter;
exports.getVectaHubHome = getVectaHubHome;
exports.parseCliPath = parseCliPath;
exports.getActiveWorkspaceFolder = getActiveWorkspaceFolder;
exports.runCli = runCli;
exports.parseCliJsonOutput = parseCliJsonOutput;
const child_process_1 = require("child_process");
const vscode = __importStar(require("vscode"));
const settings_js_1 = require("../config/settings.js");
const extension_js_1 = require("../extension.js");
const output_js_1 = require("../ui/output.js");
const path_1 = __importDefault(require("path"));
const os_1 = require("os");
const process_manager_js_1 = require("./process-manager.js");
const index_js_1 = require("../trace/index.js");
function initCliAdapter(_context) {
    // Kept for extension activation compatibility.
}
function getActualCliPath() {
    const cachedPath = (0, extension_js_1.getGlobalCliPath)();
    if (cachedPath) {
        return cachedPath;
    }
    return (0, settings_js_1.getCliPath)();
}
function getVectaHubHome() {
    return process.env.VECTAHUB_HOME || path_1.default.join((0, os_1.homedir)(), '.vectahub');
}
function parseCliPath(cliPath) {
    const trimmed = cliPath.trim();
    if (trimmed.startsWith('node ')) {
        const rest = trimmed.slice(5).trim();
        return { cmd: 'node', extraArgs: [rest] };
    }
    return { cmd: trimmed, extraArgs: [] };
}
function getActiveWorkspaceFolder() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (folder)
            return folder.uri.fsPath;
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
async function runCli(args, options = {}) {
    const baseTraceContext = options.traceContext || (0, index_js_1.createRootTraceContext)();
    const rootSpan = (0, index_js_1.startSpan)('vscode.cli.spawn', {
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
        ...(0, index_js_1.createCliTraceEnv)(baseTraceContext, rootSpan.spanId)
    };
    (0, output_js_1.logToOutput)(`Running CLI: ${cliPath} ${args.join(' ')}`);
    return new Promise((resolve) => {
        const commandName = args[0] || '';
        const requestedTimeout = options.timeout ?? 30000;
        const effectiveTimeout = commandName === 'run-task'
            ? Math.max(requestedTimeout, 660000)
            : requestedTimeout;
        const startedAt = Date.now();
        let cancelledByUser = false;
        const child = (0, child_process_1.spawn)(spawnCmd, spawnArgs, {
            cwd,
            env,
            timeout: effectiveTimeout,
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        process_manager_js_1.ProcessManager.getInstance().register(child);
        const MAX_STDOUT_LENGTH = 500000;
        const MAX_STDERR_LENGTH = 100000;
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (data) => {
            const output = data.toString();
            (0, output_js_1.logToOutput)(output);
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
            (0, output_js_1.logToOutput)(output, 'error');
            if (stderr.length >= MAX_STDERR_LENGTH) {
                return;
            }
            stderr += output;
        });
        function terminateProcessTree(signal = 'SIGTERM') {
            if (child.pid == null)
                return;
            try {
                process.kill(-child.pid, signal);
            }
            catch {
                // ignore
            }
            try {
                child.kill(signal);
            }
            catch {
                // ignore
            }
        }
        options.token?.onCancellationRequested(() => {
            cancelledByUser = true;
            terminateProcessTree('SIGTERM');
            setTimeout(() => terminateProcessTree('SIGKILL'), 2000);
            const cancelled = new Error('Command was cancelled by user');
            void (0, index_js_1.startSpan)('vscode.cli.cancel', {
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
            const signal = child.signalCode ?? null;
            const elapsed = Date.now() - startedAt;
            const timedOut = !cancelledByUser
                && code === null
                && (signal === 'SIGTERM' || signal === 'SIGKILL')
                && elapsed >= effectiveTimeout;
            const isJson = args.includes('--json');
            let data;
            let ok = code === 0;
            let error;
            if (!ok && !error && timedOut) {
                error = { code: 'TIMEOUT', message: `CLI timeout after ${effectiveTimeout}ms` };
            }
            else if (!ok && !error && cancelledByUser) {
                error = { code: 'CANCELLED', message: 'Command was cancelled by user' };
            }
            else if (!ok && !error && (signal === 'SIGTERM' || signal === 'SIGKILL')) {
                error = { code: 'CANCELLED', message: `Command terminated by signal ${signal}` };
            }
            if (isJson && stdout.trim()) {
                const parseSpan = (0, index_js_1.startSpan)('vscode.cli.parseJson', {
                    context: baseTraceContext,
                    parentSpanId: rootSpan.spanId,
                    source: 'vscode',
                });
                const parsed = parseCliJsonOutput(stdout.trim());
                if (parsed.ok) {
                    void parseSpan.end({ stdoutLength: stdout.length });
                    data = parsed.data;
                    if (data && typeof data === 'object' && 'ok' in data) {
                        const jsonResult = data;
                        if (jsonResult.ok === true || jsonResult.status === 'COMPLETED') {
                            ok = true;
                        }
                        else if (jsonResult.ok === false) {
                            ok = false;
                            if (typeof jsonResult.error === 'string') {
                                error = { code: 'CLI_ERROR', message: jsonResult.error };
                            }
                            else if (jsonResult.error) {
                                error = { code: jsonResult.error.code || 'CLI_ERROR', message: jsonResult.error.message || 'Unknown error' };
                            }
                        }
                    }
                }
                else {
                    void parseSpan.fail(parsed.error, { stdoutLength: stdout.length });
                    const parseError = parsed.error;
                    (0, output_js_1.logToOutput)(`Failed to parse JSON output: ${parseError.message}`, 'error');
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
                durationMs: undefined,
            };
            if (ok) {
                void rootSpan.end(rootAttrs);
            }
            else {
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
            (0, output_js_1.logToOutput)(`CLI Spawn Error: ${err.message}`, 'error');
            void (0, index_js_1.startSpan)('vscode.cli.spawnError', {
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
function parseCliJsonOutput(text) {
    const direct = tryParseJson(text);
    if (direct.ok)
        return direct;
    const codeBlock = text.match(/```json\s*([\s\S]*?)\s*```/i);
    if (codeBlock?.[1]) {
        const parsed = tryParseJson(codeBlock[1].trim());
        if (parsed.ok)
            return parsed;
    }
    for (const candidate of extractJsonValueCandidates(text)) {
        if (candidate === text)
            continue;
        const parsed = tryParseJson(candidate);
        if (parsed.ok)
            return parsed;
    }
    return direct;
}
function tryParseJson(text) {
    try {
        return { ok: true, data: JSON.parse(text) };
    }
    catch (error) {
        return { ok: false, error: error };
    }
}
function extractJsonValueCandidates(text) {
    const candidates = [];
    for (let start = 0; start < text.length; start++) {
        const first = text[start];
        if (first !== '{' && first !== '[')
            continue;
        const expectedClosers = [];
        let inString = false;
        let escaped = false;
        for (let i = start; i < text.length; i++) {
            const char = text[i];
            if (inString) {
                if (escaped) {
                    escaped = false;
                }
                else if (char === '\\') {
                    escaped = true;
                }
                else if (char === '"') {
                    inString = false;
                }
                continue;
            }
            if (char === '"') {
                inString = true;
            }
            else if (char === '{') {
                expectedClosers.push('}');
            }
            else if (char === '[') {
                expectedClosers.push(']');
            }
            else if (char === '}' || char === ']') {
                if (expectedClosers.pop() !== char)
                    break;
                if (expectedClosers.length === 0) {
                    candidates.push(text.slice(start, i + 1));
                    break;
                }
            }
        }
    }
    return candidates;
}
//# sourceMappingURL=adapter.js.map