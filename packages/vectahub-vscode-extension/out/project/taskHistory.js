"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTaskHistory = createTaskHistory;
exports.getTaskHistory = getTaskHistory;
exports.addTaskRecord = addTaskRecord;
exports.getRecentTasks = getRecentTasks;
exports.getFailedTasks = getFailedTasks;
function createTaskHistory() {
    const recentRecords = [];
    const failedRecords = [];
    return {
        add(record) {
            recentRecords.unshift(record);
            if (recentRecords.length > 100) {
                recentRecords.pop();
            }
            if (record.status === 'failed') {
                failedRecords.unshift(record);
                if (failedRecords.length > 100) {
                    failedRecords.pop();
                }
            }
        },
        getRecent(limit) {
            return recentRecords.slice(0, limit);
        },
        getFailed(limit) {
            return failedRecords.slice(0, limit);
        },
        clear() {
            recentRecords.length = 0;
            failedRecords.length = 0;
        }
    };
}
let globalHistoryService;
function getTaskHistory() {
    if (!globalHistoryService) {
        globalHistoryService = createTaskHistory();
    }
    return globalHistoryService;
}
function addTaskRecord(record) {
    getTaskHistory().add(record);
}
function getRecentTasks(limit = 10) {
    return getTaskHistory().getRecent(limit);
}
function getFailedTasks(limit = 10) {
    return getTaskHistory().getFailed(limit);
}
//# sourceMappingURL=taskHistory.js.map