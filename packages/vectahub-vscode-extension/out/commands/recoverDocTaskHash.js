"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRecoveryInstructionHash = resolveRecoveryInstructionHash;
function resolveRecoveryInstructionHash(input) {
    return input.currentHash ?? input.latestInstructionHash;
}
//# sourceMappingURL=recoverDocTaskHash.js.map