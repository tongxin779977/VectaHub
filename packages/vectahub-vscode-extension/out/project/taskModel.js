"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LONG_RUNNING_KINDS = void 0;
exports.isLongRunning = isLongRunning;
exports.LONG_RUNNING_KINDS = [
    'dev', 'start', 'serve', 'preview', 'watch'
];
function isLongRunning(kind) {
    return exports.LONG_RUNNING_KINDS.includes(kind);
}
//# sourceMappingURL=taskModel.js.map