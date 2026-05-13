"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyDocTaskFailure = classifyDocTaskFailure;
exports.mapRunStatusToDisplayStatus = mapRunStatusToDisplayStatus;
const FAILED_STATUS_BY_KIND = {
    config: 'failed_config',
    agent: 'failed_agent',
    json_protocol: 'failed_json_protocol',
    timeout: 'failed_timeout',
    conflict: 'failed_conflict',
    cancelled: 'cancelled'
};
function includesAny(text, keywords) {
    return keywords.some(keyword => text.includes(keyword));
}
function normalizeText(input) {
    return `${input.errorMessage ?? ''}\n${input.output ?? ''}\n${input.gitDiff ?? ''}`.toLowerCase();
}
function classifyDocTaskFailure(input) {
    const errorCode = (input.errorCode ?? '').toUpperCase();
    const text = normalizeText(input);
    if (input.cancelled || errorCode === 'CANCELLED' || includesAny(text, ['cancelled', 'cancellation', '用户取消'])) {
        return { kind: 'cancelled', status: FAILED_STATUS_BY_KIND.cancelled };
    }
    if (errorCode === 'INVALID_JSON' || input.jsonParseFailed || (input.exitCode === 0 && includesAny(text, ['failed to parse', 'json']))) {
        return { kind: 'json_protocol', status: FAILED_STATUS_BY_KIND.json_protocol };
    }
    if (errorCode === 'TIMEOUT' || includesAny(text, ['timeout', 'timed out', '超时'])) {
        return { kind: 'timeout', status: FAILED_STATUS_BY_KIND.timeout };
    }
    if (includesAny(text, [
        '<<<<<<<',
        '=======',
        '>>>>>>>',
        'merge conflict',
        'conflict marker',
        '冲突标记'
    ])) {
        return { kind: 'conflict', status: FAILED_STATUS_BY_KIND.conflict };
    }
    if (includesAny(text, [
        'llm not configured',
        'llm 未配置',
        'openai_api_key',
        'api key',
        'agent cli 未安装',
        'agent cli 未启用',
        'agent cli 无权限',
        'permission denied',
        'eacces',
        'enoent',
        'not found',
        'agent not found',
        'docpath missing',
        'docpath',
        '不可读',
        'no such file'
    ])) {
        return { kind: 'config', status: FAILED_STATUS_BY_KIND.config };
    }
    if (input.ok === false || input.exitCode !== undefined) {
        return { kind: 'agent', status: FAILED_STATUS_BY_KIND.agent };
    }
    return { kind: 'unknown', status: 'failed_agent' };
}
function mapRunStatusToDisplayStatus(status) {
    if (status.startsWith('failed_')) {
        return 'failed';
    }
    switch (status) {
        case 'ready':
        case 'preflight':
        case 'running':
        case 'changed':
        case 'success':
        case 'cancelled':
            return status;
        case 'needs_confirmation':
            return 'needs-confirmation';
        case 'parsed':
            return 'pending';
        case 'verifying':
            return 'running';
        default:
            return 'pending';
    }
}
//# sourceMappingURL=docTaskState.js.map