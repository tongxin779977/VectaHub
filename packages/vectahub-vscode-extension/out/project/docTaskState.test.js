"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const docTaskState_js_1 = require("./docTaskState.js");
(0, vitest_1.describe)('classifyDocTaskFailure', () => {
    (0, vitest_1.it)('should classify timeout by explicit error code', () => {
        const classified = (0, docTaskState_js_1.classifyDocTaskFailure)({
            ok: false,
            exitCode: null,
            errorCode: 'TIMEOUT',
            errorMessage: 'CLI timeout after 660000ms',
        });
        (0, vitest_1.expect)(classified.kind).toBe('timeout');
        (0, vitest_1.expect)(classified.status).toBe('failed_timeout');
    });
    (0, vitest_1.it)('should classify cancelled separately from timeout', () => {
        const classified = (0, docTaskState_js_1.classifyDocTaskFailure)({
            ok: false,
            errorCode: 'CANCELLED',
            errorMessage: 'Command was cancelled by user',
        });
        (0, vitest_1.expect)(classified.kind).toBe('cancelled');
        (0, vitest_1.expect)(classified.status).toBe('cancelled');
    });
});
//# sourceMappingURL=docTaskState.test.js.map