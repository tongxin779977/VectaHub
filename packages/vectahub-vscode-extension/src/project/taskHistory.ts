export interface TaskRunRecord {
  id: string;
  label: string;
  kind: string;
  source?: string;
  intent?: string;
  command?: string;
  status: 'success' | 'failed' | 'cancelled';
  errorMessage?: string;
  startedAt: Date;
  endedAt: Date;
}

export interface TaskHistoryService {
  add(record: TaskRunRecord): void;
  getRecent(limit: number): TaskRunRecord[];
  getFailed(limit: number): TaskRunRecord[];
  clear(): void;
}

export function createTaskHistory(): TaskHistoryService {
  const recentRecords: TaskRunRecord[] = [];
  const failedRecords: TaskRunRecord[] = [];

  return {
    add(record: TaskRunRecord): void {
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

    getRecent(limit: number): TaskRunRecord[] {
      return recentRecords.slice(0, limit);
    },

    getFailed(limit: number): TaskRunRecord[] {
      return failedRecords.slice(0, limit);
    },

    clear(): void {
      recentRecords.length = 0;
      failedRecords.length = 0;
    }
  };
}

let globalHistoryService: TaskHistoryService | undefined;

export function getTaskHistory(): TaskHistoryService {
  if (!globalHistoryService) {
    globalHistoryService = createTaskHistory();
  }
  return globalHistoryService;
}

export function addTaskRecord(record: TaskRunRecord): void {
  getTaskHistory().add(record);
}

export function getRecentTasks(limit: number = 10): TaskRunRecord[] {
  return getTaskHistory().getRecent(limit);
}

export function getFailedTasks(limit: number = 10): TaskRunRecord[] {
  return getTaskHistory().getFailed(limit);
}