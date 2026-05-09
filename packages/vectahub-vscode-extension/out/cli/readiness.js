"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCliReadinessState = getCliReadinessState;
exports.getResolvedCliPath = getResolvedCliPath;
exports.registerCliDetector = registerCliDetector;
exports.startCliDetection = startCliDetection;
exports.waitForCliReady = waitForCliReady;
exports.resetCliReadiness = resetCliReadiness;
const notifications_js_1 = require("../ui/notifications.js");
const output_js_1 = require("../ui/output.js");
let cliState = 'detecting';
let detectionPromise = null;
let cliPath;
let storedDetector = null;
function getCliReadinessState() {
    return cliState;
}
function getResolvedCliPath() {
    return cliPath;
}
function registerCliDetector(detector) {
    storedDetector = detector;
}
function startCliDetection(detector) {
    if (detectionPromise)
        return detectionPromise;
    storedDetector = detector;
    cliState = 'detecting';
    detectionPromise = detector().then(result => {
        if (result.exists) {
            cliState = 'ready';
            cliPath = result.path;
            (0, output_js_1.logToOutput)(`CLI ready: ${result.version} at ${result.path}`);
            return 'ready';
        }
        else {
            cliState = 'missing';
            (0, output_js_1.logToOutput)(`CLI not found: ${result.error}`, 'error');
            return 'missing';
        }
    }).catch(err => {
        cliState = 'missing';
        (0, output_js_1.logToOutput)(`CLI detection error: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return 'missing';
    });
    return detectionPromise;
}
async function waitForCliReady(token) {
    if (cliState === 'ready') {
        return true;
    }
    if (cliState === 'missing') {
        await (0, notifications_js_1.showCliMissingWarning)();
        return false;
    }
    if (!detectionPromise) {
        if (storedDetector) {
            startCliDetection(storedDetector);
        }
        else {
            await (0, notifications_js_1.showCliMissingWarning)();
            return false;
        }
    }
    const result = await waitForWithTimeout(detectionPromise, 10000, token);
    if (token?.isCancellationRequested) {
        return false;
    }
    if (result === 'ready') {
        return true;
    }
    await (0, notifications_js_1.showCliMissingWarning)();
    return false;
}
function resetCliReadiness() {
    cliState = 'detecting';
    detectionPromise = null;
    cliPath = undefined;
    storedDetector = null;
}
async function waitForWithTimeout(promise, timeoutMs, token) {
    let timeoutHandle;
    let cancelListener;
    const timeoutPromise = new Promise(resolve => {
        timeoutHandle = setTimeout(() => resolve('timeout'), timeoutMs);
    });
    const cancelPromise = new Promise(resolve => {
        if (token) {
            cancelListener = token.onCancellationRequested(() => resolve('cancelled'));
        }
    });
    try {
        return await Promise.race([promise, timeoutPromise, cancelPromise]);
    }
    finally {
        if (timeoutHandle)
            clearTimeout(timeoutHandle);
        if (cancelListener)
            cancelListener.dispose();
    }
}
//# sourceMappingURL=readiness.js.map