"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_DIAGNOSTIC_STATUSES = void 0;
exports.normalizeDiagnosticTask = normalizeDiagnosticTask;
exports.getExecutableAction = getExecutableAction;
exports.normalizeDiagnosticQueue = normalizeDiagnosticQueue;
exports.VALID_DIAGNOSTIC_STATUSES = [
    'pending', 'processing', 'completed', 'failed', 'cancelled', 'needs-confirmation'
];
const VALID_SOURCES = ['github-actions', 'manual', 'system'];
function normalizeDiagnosticTask(raw) {
    if (!raw || typeof raw !== 'object' || !raw.id)
        return null;
    const rawStatus = typeof raw.status === 'string' ? raw.status : '';
    const status = exports.VALID_DIAGNOSTIC_STATUSES.includes(rawStatus)
        ? rawStatus
        : 'needs-confirmation';
    const rawSource = typeof raw.source === 'string' ? raw.source : 'system';
    const source = VALID_SOURCES.includes(rawSource)
        ? rawSource
        : 'system';
    const commandToFix = typeof raw.commandToFix === 'string' ? raw.commandToFix : undefined;
    const nextAction = typeof raw.nextAction === 'string' ? raw.nextAction : undefined;
    return {
        id: String(raw.id),
        title: typeof raw.title === 'string' ? raw.title : '未知任务',
        description: typeof raw.description === 'string' ? raw.description : '',
        source,
        sourceId: typeof raw.sourceId === 'string' ? raw.sourceId : undefined,
        commandToFix,
        nextAction,
        status,
        createdAt: (typeof raw.createdAt === 'string' || raw.createdAt instanceof Date) ? raw.createdAt : new Date().toISOString(),
        updatedAt: (typeof raw.updatedAt === 'string' || raw.updatedAt instanceof Date) ? raw.updatedAt
            : (typeof raw.createdAt === 'string' || raw.createdAt instanceof Date) ? raw.createdAt
                : new Date().toISOString(),
        error: typeof raw.error === 'string' ? raw.error : undefined,
        metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : undefined,
    };
}
function getExecutableAction(task) {
    return task.commandToFix || task.nextAction;
}
function normalizeDiagnosticQueue(data) {
    if (!data)
        return { tasks: [], error: '队列文件为空或读取失败' };
    if (!Array.isArray(data))
        return { tasks: [], error: '队列数据格式错误: 预期数组' };
    const tasks = [];
    for (const raw of data) {
        const normalized = normalizeDiagnosticTask(raw);
        if (normalized)
            tasks.push(normalized);
    }
    return { tasks };
}
//# sourceMappingURL=diagnosticModel.js.map