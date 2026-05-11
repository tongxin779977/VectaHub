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
const child_process_1 = require("child_process");
const vscode = __importStar(require("vscode"));
const settings_js_1 = require("../config/settings.js");
const extension_js_1 = require("../extension.js");
const output_js_1 = require("../ui/output.js");
const path_1 = __importDefault(require("path"));
const os_1 = require("os");
const process_manager_js_1 = require("./process-manager.js");
let globalContext;
function initCliAdapter(context) {
    globalContext = context;
}
function getActualCliPath() {
    const cachedPath = (0, extension_js_1.getGlobalCliPath)();
    if (cachedPath) {
        return cachedPath;
    }
    return (0, settings_js_1.getCliPath)();
}
function getVectaHubHome() {
    return path_1.default.join((0, os_1.homedir)(), '.vectahub');
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
    (0, output_js_1.logToOutput)(`Running CLI: ${cliPath} ${args.join(' ')}`);
    return new Promise((resolve) => {
        const child = (0, child_process_1.spawn)(spawnCmd, spawnArgs, {
            cwd,
            env,
            timeout: options.timeout || 30000,
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        process_manager_js_1.ProcessManager.getInstance().register(child);
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            (0, output_js_1.logToOutput)(output);
        });
        child.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;
            (0, output_js_1.logToOutput)(output, 'error');
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
            let data;
            let ok = code === 0;
            let error;
            if (isJson && stdout.trim()) {
                try {
                    data = JSON.parse(stdout.trim());
                    if (data && typeof data === 'object' && 'ok' in data) {
                        const jsonResult = data;
                        if (jsonResult.ok === true || jsonResult.status === 'COMPLETED') {
                            ok = true;
                        }
                        else if (jsonResult.ok === false) {
                            ok = false;
                            if (jsonResult.error) {
                                error = { code: jsonResult.error.code || 'CLI_ERROR', message: jsonResult.error.message || 'Unknown error' };
                            }
                        }
                    }
                }
                catch (e) {
                    const parseError = e;
                    (0, output_js_1.logToOutput)(`Failed to parse JSON output: ${parseError.message}`, 'error');
                    if (ok) {
                        const repaired = tryRepairTruncatedJson(stdout.trim());
                        if (repaired) {
                            try {
                                data = JSON.parse(repaired);
                                (0, output_js_1.logToOutput)('Successfully repaired truncated JSON');
                            }
                            catch { /* repair failed too */ }
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
            (0, output_js_1.logToOutput)(`CLI Spawn Error: ${err.message}`, 'error');
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
function tryRepairTruncatedJson(s) {
    const lastBrace = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (lastBrace < 0)
        return null;
    return s.slice(0, lastBrace + 1);
}
//# sourceMappingURL=adapter.js.map