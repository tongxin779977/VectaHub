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
exports.createDocTaskRunStore = createDocTaskRunStore;
const fs = __importStar(require("fs"));
const fs_1 = require("fs");
const path = __importStar(require("path"));
const adapter_js_1 = require("../cli/adapter.js");
const MAX_ERROR_MESSAGE = 1000;
const MAX_OUTPUT_SUMMARY = 2000;
const MAX_CHANGED_FILES = 100;
const MAX_RECORD_BYTES = 16 * 1024;
const MAX_LATEST_CACHE = 200;
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;
const RECENT_DAYS = 7;
function djb2Hash(input) {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
}
function nowIso() {
    return new Date().toISOString();
}
function toDatePart(value) {
    return value.toISOString().slice(0, 10);
}
function trimText(value, max) {
    if (!value || value.length <= max) {
        return [value, false];
    }
    return [value.slice(0, max), true];
}
function sanitizeRunRecord(input) {
    const next = { ...input };
    let truncated = input.outputTruncated === true;
    const [errorMessage, errorTrimmed] = trimText(next.errorMessage, MAX_ERROR_MESSAGE);
    next.errorMessage = errorMessage;
    truncated = truncated || errorTrimmed;
    const [outputSummary, outputTrimmed] = trimText(next.outputSummary, MAX_OUTPUT_SUMMARY);
    next.outputSummary = outputSummary;
    truncated = truncated || outputTrimmed;
    if (next.gitChanges) {
        const changedFiles = next.gitChanges.changedFiles.slice(0, MAX_CHANGED_FILES).map(file => file.slice(0, 512));
        if (changedFiles.length < next.gitChanges.changedFiles.length) {
            truncated = true;
        }
        next.gitChanges = {
            ...next.gitChanges,
            changedFileCount: Math.min(next.gitChanges.changedFileCount, changedFiles.length),
            changedFiles,
            shortStat: next.gitChanges.shortStat?.slice(0, 512)
        };
    }
    const enforceSize = () => Buffer.byteLength(JSON.stringify(next), 'utf8');
    while (enforceSize() > MAX_RECORD_BYTES) {
        truncated = true;
        if (next.outputSummary && next.outputSummary.length > 256) {
            next.outputSummary = next.outputSummary.slice(0, Math.max(256, Math.floor(next.outputSummary.length * 0.7)));
            continue;
        }
        if (next.errorMessage && next.errorMessage.length > 200) {
            next.errorMessage = next.errorMessage.slice(0, Math.max(200, Math.floor(next.errorMessage.length * 0.7)));
            continue;
        }
        if (next.gitChanges && next.gitChanges.changedFiles.length > 10) {
            next.gitChanges.changedFiles = next.gitChanges.changedFiles.slice(0, Math.max(10, Math.floor(next.gitChanges.changedFiles.length * 0.7)));
            next.gitChanges.changedFileCount = Math.min(next.gitChanges.changedFileCount, next.gitChanges.changedFiles.length);
            continue;
        }
        break;
    }
    if (truncated) {
        next.outputTruncated = true;
    }
    return next;
}
function sanitizeLatestMap(map) {
    if (map.size <= MAX_LATEST_CACHE) {
        return map;
    }
    const sorted = [...map.entries()].sort((a, b) => {
        const ta = Date.parse(a[1].updatedAt) || 0;
        const tb = Date.parse(b[1].updatedAt) || 0;
        return tb - ta;
    });
    return new Map(sorted.slice(0, MAX_LATEST_CACHE));
}
function resolveDir(projectRoot) {
    return path.join((0, adapter_js_1.getVectaHubHome)(), 'projects', djb2Hash(projectRoot), 'doc-task-runs');
}
function createDocTaskRunStore(projectRoot) {
    const dir = resolveDir(projectRoot);
    const latestPath = path.join(dir, 'latest.json');
    const batchesPath = path.join(dir, 'batches.jsonl');
    let latestCache;
    let writeQueue = Promise.resolve();
    async function ensureDir() {
        await fs_1.promises.mkdir(dir, { recursive: true });
    }
    async function appendJsonl(filePath, payload) {
        await ensureDir();
        await fs_1.promises.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
    }
    function getRunFilePathByDate(d) {
        return path.join(dir, `runs-${toDatePart(d)}.jsonl`);
    }
    async function loadLatestMap() {
        if (latestCache) {
            return new Map(latestCache);
        }
        try {
            const raw = await fs_1.promises.readFile(latestPath, 'utf8');
            const parsed = JSON.parse(raw);
            const map = new Map(Object.entries(parsed ?? {}));
            latestCache = sanitizeLatestMap(map);
            return new Map(latestCache);
        }
        catch {
            latestCache = new Map();
            return new Map();
        }
    }
    async function saveLatestMap(map) {
        const sanitized = sanitizeLatestMap(map);
        await ensureDir();
        const tmpPath = `${latestPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
        const asObject = Object.fromEntries(sanitized.entries());
        await fs_1.promises.writeFile(tmpPath, JSON.stringify(asObject, null, 2), 'utf8');
        await fs_1.promises.rename(tmpPath, latestPath);
        latestCache = new Map(sanitized);
    }
    async function enqueueWrite(operation) {
        const run = writeQueue.then(operation, operation);
        writeQueue = run.then(() => undefined, () => undefined);
        return run;
    }
    function clampLimit(limit) {
        if (typeof limit !== 'number' || Number.isNaN(limit)) {
            return DEFAULT_LIST_LIMIT;
        }
        return Math.min(MAX_LIST_LIMIT, Math.max(1, Math.trunc(limit)));
    }
    async function readTailRuns(filePath, limit) {
        const tail = [];
        if (!fs.existsSync(filePath)) {
            return tail;
        }
        const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
        const rl = (await import('readline')).createInterface({ input: stream, crlfDelay: Infinity });
        for await (const line of rl) {
            if (!line.trim()) {
                continue;
            }
            try {
                const parsed = JSON.parse(line);
                tail.push(parsed);
                if (tail.length > limit) {
                    tail.shift();
                }
            }
            catch {
                // ignore malformed line
            }
        }
        return tail.reverse();
    }
    return {
        async startBatch(input) {
            const now = nowIso();
            const record = {
                batchRunId: input.batchRunId,
                docPath: input.docPath,
                agentCli: input.agentCli,
                traceId: input.traceId,
                status: 'running',
                totalCount: input.totalCount,
                completedCount: 0,
                failedCount: 0,
                skippedCount: 0,
                startedAt: now,
                updatedAt: now
            };
            await enqueueWrite(() => appendJsonl(batchesPath, record));
            return record;
        },
        async updateBatch(record) {
            await enqueueWrite(() => appendJsonl(batchesPath, { ...record, updatedAt: record.updatedAt || nowIso() }));
        },
        async startRun(input) {
            const now = nowIso();
            const record = sanitizeRunRecord({
                runId: input.runId,
                batchRunId: input.batchRunId,
                taskId: input.taskId,
                taskLabel: input.taskLabel,
                docPath: input.docPath,
                agentCli: input.agentCli,
                status: input.status ?? 'ready',
                command: input.command,
                traceId: input.traceId,
                agentTaskContract: input.agentTaskContract,
                retryOfRunId: input.retryOfRunId,
                startedAt: now,
                updatedAt: now
            });
            await this.updateRun(record);
            return record;
        },
        async updateRun(record) {
            const sanitized = sanitizeRunRecord(record);
            await enqueueWrite(async () => {
                await appendJsonl(getRunFilePathByDate(new Date()), sanitized);
                const latest = await loadLatestMap();
                latest.set(sanitized.taskId, sanitized);
                await saveLatestMap(latest);
            });
        },
        async getLatestByTaskId(taskId) {
            const latest = await loadLatestMap();
            return latest.get(taskId);
        },
        async getLatestMap() {
            return loadLatestMap();
        },
        async listRuns(options) {
            const limit = clampLimit(options?.limit);
            const all = [];
            for (let i = 0; i < RECENT_DAYS && all.length < limit; i++) {
                const day = new Date();
                day.setUTCDate(day.getUTCDate() - i);
                const filePath = getRunFilePathByDate(day);
                const remains = limit - all.length;
                if (remains <= 0) {
                    break;
                }
                const rows = await readTailRuns(filePath, remains);
                all.push(...rows.slice(0, remains));
            }
            return all.slice(0, limit);
        }
    };
}
//# sourceMappingURL=docTaskRunStore.js.map