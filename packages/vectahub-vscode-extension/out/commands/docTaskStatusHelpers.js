"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveVerificationStatus = resolveVerificationStatus;
exports.persistContractHashFromCliResult = persistContractHashFromCliResult;
function resolveVerificationStatus(changedFiles, verification) {
    if (verification?.isSystemError) {
        return { status: 'failed_system_internal', failureKind: 'system_internal' };
    }
    if (verification && !verification.ok) {
        return { status: 'failed_test', failureKind: 'test' };
    }
    const status = changedFiles.length > 0 ? 'changed' : 'success';
    return { status };
}
function persistContractHashFromCliResult(runRecord, summary) {
    if (!runRecord)
        return;
    runRecord.instructionHash = summary?.instructionHash ?? runRecord.instructionHash;
}
//# sourceMappingURL=docTaskStatusHelpers.js.map