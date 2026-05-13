"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeTraceSpan = writeTraceSpan;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = require("node:os");
const adapter_js_1 = require("../cli/adapter.js");
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const SENSITIVE_KEY_PATTERN = /(?:(?:api[_-]?key|token|secret|password|passwd|authorization|auth|credential)[\s]*[=:]\s*["']?)([\w\-./+]{8,})/gi;
const KNOWN_ENV_SECRETS = /(?:(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|CODEX_API_KEY|GH_TOKEN|NPM_TOKEN|AWS_SECRET_ACCESS_KEY|AZURE_CLIENT_SECRET|GOOGLE_API_KEY|VECTAHUB_API_KEY)[\s]*[=:]\s*["']?)([\w\-./+]{8,})/gi;
const BEARER_TOKEN = /(Bearer\s+)([\w\-./+]{20,})/gi;
const HOME_PATH_PATTERN = new RegExp(escapeRegex((0, node_os_1.homedir)()), 'g');
const REDACT_PATTERNS = [SENSITIVE_KEY_PATTERN, KNOWN_ENV_SECRETS, BEARER_TOKEN, HOME_PATH_PATTERN];
const REPLACEMENT = '[REDACTED]';
function redactString(text) {
    if (!text)
        return text;
    let result = text;
    for (const pattern of REDACT_PATTERNS) {
        pattern.lastIndex = 0;
        result = result.replace(pattern, REPLACEMENT);
    }
    return result;
}
function redactValue(value) {
    if (typeof value === 'string')
        return redactString(value);
    if (Array.isArray(value))
        return value.map(redactValue);
    if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value);
        const redacted = {};
        for (const [key, val] of entries) {
            redacted[key] = redactValue(val);
        }
        return redacted;
    }
    return value;
}
function getTraceFilePath(date = new Date()) {
    const datePart = date.toISOString().slice(0, 10);
    return node_path_1.default.join((0, adapter_js_1.getVectaHubHome)(), 'logs', 'traces', `${datePart}.jsonl`);
}
async function writeTraceSpan(record) {
    try {
        const filePath = getTraceFilePath(new Date(record.endTime));
        await (0, promises_1.mkdir)(node_path_1.default.dirname(filePath), { recursive: true });
        const redacted = redactValue(record);
        await (0, promises_1.appendFile)(filePath, `${JSON.stringify(redacted)}\n`, 'utf8');
    }
    catch {
        // ignore write error
    }
}
//# sourceMappingURL=writer.js.map