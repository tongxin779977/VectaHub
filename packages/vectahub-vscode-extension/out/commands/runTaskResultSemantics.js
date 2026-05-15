"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRunTaskExecutionSemantics = resolveRunTaskExecutionSemantics;
function toConfirmationSource(value) {
    if (value === 'preflight' || value === 'post-execution') {
        return value;
    }
    return undefined;
}
function resolveRunTaskExecutionSemantics(input) {
    const needsConfirmation = input.data?.riskAssessment?.needsConfirmation === true;
    const confirmationSource = needsConfirmation
        ? toConfirmationSource(input.data?.riskAssessment?.confirmationSource)
        : undefined;
    const changedFileCount = input.data?.gitChanges?.changedFiles?.length ?? 0;
    const hasVerification = input.data?.verification !== undefined;
    const unclosedExecution = input.ok === false && changedFileCount > 0 && !hasVerification;
    return {
        needsConfirmation,
        confirmationSource,
        unclosedExecution,
    };
}
//# sourceMappingURL=runTaskResultSemantics.js.map