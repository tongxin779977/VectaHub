"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const recoverDocTaskHash_js_1 = require("./recoverDocTaskHash.js");
(0, vitest_1.describe)('resolveRecoveryInstructionHash', () => {
    (0, vitest_1.it)('恢复记录优先使用 currentHash', () => {
        (0, vitest_1.expect)((0, recoverDocTaskHash_js_1.resolveRecoveryInstructionHash)({
            currentHash: 'current-hash',
            latestInstructionHash: 'latest-hash',
        })).toBe('current-hash');
    });
    (0, vitest_1.it)('currentHash 不可用时继承 latestRecord.instructionHash', () => {
        (0, vitest_1.expect)((0, recoverDocTaskHash_js_1.resolveRecoveryInstructionHash)({
            currentHash: undefined,
            latestInstructionHash: 'latest-hash',
        })).toBe('latest-hash');
    });
});
//# sourceMappingURL=recoverDocTaskHash.test.js.map