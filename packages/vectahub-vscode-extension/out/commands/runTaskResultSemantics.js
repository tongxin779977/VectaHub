"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRunTaskExecutionSemantics = resolveRunTaskExecutionSemantics;
exports.resolveRunTaskFailureKind = resolveRunTaskFailureKind;
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
    const diagnostics = input.data?.diagnostics;
    const enforcement = toRiskEnforcement(diagnostics?.riskAssessment?.enforcement || input.data?.riskAssessment?.enforcement);
    const needsConfirmation = enforcement
        ? enforcement === 'confirm_required'
        : (diagnostics?.riskAssessment?.needsConfirmation === true || input.data?.riskAssessment?.needsConfirmation === true);
    const confirmationSource = needsConfirmation
        ? toConfirmationSource(diagnostics?.riskAssessment?.confirmationSource || input.data?.riskAssessment?.confirmationSource)
        : undefined;
    const changedFileCount = diagnostics?.gitChanges?.changedFiles?.length ?? input.data?.gitChanges?.changedFiles?.length ?? 0;
    const hasVerification = diagnostics?.verification !== undefined || input.data?.verification !== undefined;
    const unclosedExecution = diagnostics?.unclosedExecution === true || input.data?.unclosedExecution === true
        ? true
        : input.ok === false && changedFileCount > 0 && !hasVerification;
    return {
        needsConfirmation,
        confirmationSource,
        enforcement,
        unclosedExecution,
    };
}
function resolveRunTaskFailureKind(input) {
    const failureKind = input.data?.diagnostics?.failureKind || input.data?.failureKind;
    if (!failureKind) {
        return undefined;
    }
    return failureKind;
}
//# sourceMappingURL=runTaskResultSemantics.js.map