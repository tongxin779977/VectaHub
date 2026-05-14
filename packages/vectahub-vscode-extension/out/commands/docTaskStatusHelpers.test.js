"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const docTaskStatusHelpers_js_1 = require("./docTaskStatusHelpers.js");
(0, vitest_1.describe)('resolveVerificationStatus', () => {
    (0, vitest_1.it)('result.ok=false 且 verification.isSystemError=true => failed_system_internal', () => {
        const resolved = (0, docTaskStatusHelpers_js_1.resolveVerificationStatus)([], { ok: false, isSystemError: true });
        (0, vitest_1.expect)(resolved.status).toBe('failed_system_internal');
        (0, vitest_1.expect)(resolved.failureKind).toBe('system_internal');
    });
    (0, vitest_1.it)('result.ok=false 且 verification.ok=false 且 isSystemError 缺失 => failed_test', () => {
        const resolved = (0, docTaskStatusHelpers_js_1.resolveVerificationStatus)([], { ok: false });
        (0, vitest_1.expect)(resolved.status).toBe('failed_test');
        (0, vitest_1.expect)(resolved.failureKind).toBe('test');
    });
});
(0, vitest_1.describe)('persistContractHashFromCliResult', () => {
    (0, vitest_1.it)('单任务失败路径应保存 CLI 返回 instructionHash', () => {
        const runRecord = {};
        (0, docTaskStatusHelpers_js_1.persistContractHashFromCliResult)(runRecord, {
            boundaryConfidence: 'medium',
            allowedFiles: [],
            forbiddenFiles: [],
            validationCommands: [],
            executionMode: 'serial',
            docExcerptTruncated: false,
            excerptStrategy: 'none',
            instructionHash: 'hash-single-fail',
        });
        (0, vitest_1.expect)(runRecord.instructionHash).toBe('hash-single-fail');
    });
    (0, vitest_1.it)('批量路径应保存 CLI 返回 instructionHash', () => {
        const runRecord = { instructionHash: 'old-hash' };
        (0, docTaskStatusHelpers_js_1.persistContractHashFromCliResult)(runRecord, {
            boundaryConfidence: 'medium',
            allowedFiles: [],
            forbiddenFiles: [],
            validationCommands: [],
            executionMode: 'parallel-eligible',
            docExcerptTruncated: false,
            excerptStrategy: 'task-id-window',
            instructionHash: 'hash-batch',
        });
        (0, vitest_1.expect)(runRecord.instructionHash).toBe('hash-batch');
    });
});
//# sourceMappingURL=docTaskStatusHelpers.test.js.map