"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeTraceSpan = writeTraceSpan;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const adapter_js_1 = require("../cli/adapter.js");
function getTraceFilePath(date = new Date()) {
    const datePart = date.toISOString().slice(0, 10);
    return node_path_1.default.join((0, adapter_js_1.getVectaHubHome)(), 'logs', 'traces', `${datePart}.jsonl`);
}
async function writeTraceSpan(record) {
    try {
        const filePath = getTraceFilePath(new Date(record.endTime));
        await (0, promises_1.mkdir)(node_path_1.default.dirname(filePath), { recursive: true });
        await (0, promises_1.appendFile)(filePath, `${JSON.stringify(record)}\n`, 'utf8');
    }
    catch {
        // ignore write error
    }
}
//# sourceMappingURL=writer.js.map