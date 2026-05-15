"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRunTaskExecutionSemantics = resolveRunTaskExecutionSemantics;
function toConfirmationSource(value) {
    if (value === 'preflight' || value === 'post-execution') {
        return value;
    }
    return undefined;
}
function toRiskEnforcement(value) {
    if (value === 'blocked' || value === 'confirm_required') {
        return value;
    }
    return undefined;
}
function resolveRunTaskExecutionSemantics(input) {
    const enforcement = toRiskEnforcement(input.data?.riskAssessment?.enforcement);
    const needsConfirmation = enforcement
        ? enforcement === 'confirm_required'
        : input.data?.riskAssessment?.needsConfirmation === true;
    const confirmationSource = needsConfirmation
        ? toConfirmationSource(input.data?.riskAssessment?.confirmationSource)
        : undefined;
    const changedFileCount = input.data?.gitChanges?.changedFiles?.length ?? 0;
    const hasVerification = input.data?.verification !== undefined;
    const unclosedExecution = input.ok === false && changedFileCount > 0 && !hasVerification;
    return {
        needsConfirmation,
        confirmationSource,
        enforcement,
        unclosedExecution,
    };
}
//# sourceMappingURL=runTaskResultSemantics.js.map