"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTraceId = createTraceId;
exports.createSpanId = createSpanId;
exports.createRootTraceContext = createRootTraceContext;
exports.createCliTraceEnv = createCliTraceEnv;
function createTraceId() {
    return `tr_${Date.now()}_${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}
function createSpanId() {
    return `sp_${Date.now()}_${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}
function createRootTraceContext() {
    return { traceId: createTraceId(), source: 'vscode' };
}
function createCliTraceEnv(context, parentSpanId) {
    return {
        VECTAHUB_TRACE_ID: context.traceId,
        VECTAHUB_PARENT_SPAN_ID: parentSpanId,
        VECTAHUB_TRACE_SOURCE: 'vscode',
    };
}
//# sourceMappingURL=context.js.map