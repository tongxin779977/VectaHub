"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSpan = startSpan;
exports.withSpan = withSpan;
const context_js_1 = require("./context.js");
const writer_js_1 = require("./writer.js");
function toErrorRecord(error) {
    if (error instanceof Error) {
        return { message: error.message, name: error.name, stack: error.stack };
    }
    return { message: String(error) };
}
function startSpan(name, options) {
    const context = options?.context || (0, context_js_1.createRootTraceContext)();
    const startTime = new Date().toISOString();
    const startNs = process.hrtime.bigint();
    const spanId = (0, context_js_1.createSpanId)();
    const traceId = context.traceId;
    const parentSpanId = options?.parentSpanId ?? context.parentSpanId;
    const source = options?.source || context.source || 'vscode';
    let closed = false;
    const finish = async (status, error, attributes) => {
        if (closed)
            return;
        closed = true;
        const endTime = new Date().toISOString();
        const durationMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
        await (0, writer_js_1.writeTraceSpan)({
            traceId,
            spanId,
            parentSpanId,
            name,
            source,
            status,
            startTime,
            endTime,
            durationMs,
            attributes: {
                ...(options?.attributes || {}),
                ...(attributes || {}),
            },
            error: error ? toErrorRecord(error) : undefined,
        });
    };
    return {
        traceId,
        spanId,
        parentSpanId,
        end: async (attributes) => finish('completed', undefined, attributes),
        fail: async (error, attributes) => finish('failed', error, attributes),
    };
}
async function withSpan(name, fn, options) {
    const span = startSpan(name, options);
    try {
        const result = await fn(span);
        await span.end();
        return result;
    }
    catch (error) {
        await span.fail(error);
        throw error;
    }
}
//# sourceMappingURL=tracer.js.map