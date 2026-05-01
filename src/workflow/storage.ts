import { promises as fs, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { ExecutionRecord, Workflow } from '../types/index.js';

export interface Storage {
  save(record: ExecutionRecord): Promise<void>;
  get(id: string): Promise<ExecutionRecord | undefined>;
  list(): Promise<ExecutionRecord[]>;
  delete(id: string): Promise<void>;
  saveWorkflow(workflow: Workflow): Promise<void>;
  getWorkflow(id: string): Promise<Workflow | undefined>;
  listWorkflows(): Promise<Workflow[]>;
  deleteWorkflow(id: string): Promise<void>;
}

export interface StorageOptions {
  storageDir?: string;
}

function getStorageDirs(options?: StorageOptions): { storageDir: string; executionsDir: string; workflowsDir: string } {
  const baseDir = options?.storageDir || join(homedir(), '.vectahub');
  return {
    storageDir: baseDir,
    executionsDir: join(baseDir, 'executions'),
    workflowsDir: join(baseDir, 'workflows'),
  };
}

async function ensureDirs(storageDir: string, executionsDir: string, workflowsDir: string): Promise<void> {
  if (!existsSync(storageDir)) {
    await fs.mkdir(storageDir, { recursive: true });
  }
  if (!existsSync(executionsDir)) {
    await fs.mkdir(executionsDir, { recursive: true });
  }
  if (!existsSync(workflowsDir)) {
    await fs.mkdir(workflowsDir, { recursive: true });
  }
}

function dateToISO(date: Date): string {
  return typeof date === 'string' ? date : date.toISOString();
}

function isoToDate(isoString: string): Date {
  return new Date(isoString);
}

function serializeRecord(record: ExecutionRecord): string {
  const serialized = {
    ...record,
    startedAt: dateToISO(record.startedAt),
    endedAt: record.endedAt ? dateToISO(record.endedAt) : undefined,
    steps: record.steps.map(step => ({
      ...step,
      startAt: step.startAt ? dateToISO(step.startAt) : undefined,
      endAt: step.endAt ? dateToISO(step.endAt) : undefined,
    })),
  };
  return JSON.stringify(serialized, null, 2);
}

function deserializeRecord(data: string): ExecutionRecord {
  const parsed = JSON.parse(data);
  return {
    ...parsed,
    startedAt: isoToDate(parsed.startedAt),
    endedAt: parsed.endedAt ? isoToDate(parsed.endedAt) : undefined,
    steps: parsed.steps.map((step: any) => ({
      ...step,
      startAt: step.startAt ? isoToDate(step.startAt) : undefined,
      endAt: step.endAt ? isoToDate(step.endAt) : undefined,
    })),
  };
}

function serializeWorkflow(workflow: Workflow): string {
  const serialized = {
    ...workflow,
    createdAt: dateToISO(workflow.createdAt),
  };
  return JSON.stringify(serialized, null, 2);
}

function deserializeWorkflow(data: string): Workflow {
  const parsed = JSON.parse(data);
  return {
    ...parsed,
    createdAt: isoToDate(parsed.createdAt),
  };
}

export function createStorage(options?: StorageOptions): Storage {
  const records = new Map<string, ExecutionRecord>();
  const workflows = new Map<string, Workflow>();
  let initialized = false;
  
  const { storageDir, executionsDir, workflowsDir } = getStorageDirs(options);

  async function init(): Promise<void> {
    if (initialized) return;
    await ensureDirs(storageDir, executionsDir, workflowsDir);
    await loadRecords();
    await loadWorkflows();
    initialized = true;
  }

  async function loadRecords(): Promise<void> {
    try {
      const files = await fs.readdir(executionsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(join(executionsDir, file), 'utf-8');
          const record = deserializeRecord(content);
          records.set(record.executionId, record);
        }
      }
    } catch {
      // Directory might not exist or be empty
    }
  }

  async function loadWorkflows(): Promise<void> {
    try {
      const files = await fs.readdir(workflowsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(join(workflowsDir, file), 'utf-8');
          const workflow = deserializeWorkflow(content);
          workflows.set(workflow.id, workflow);
        }
      }
    } catch {
      // Directory might not exist or be empty
    }
  }

  return {
    async save(record: ExecutionRecord): Promise<void> {
      await init();
      records.set(record.executionId, record);
      const filePath = join(executionsDir, `${record.executionId}.json`);
      await fs.writeFile(filePath, serializeRecord(record));
    },

    async get(id: string): Promise<ExecutionRecord | undefined> {
      await init();
      return records.get(id);
    },

    async list(): Promise<ExecutionRecord[]> {
      await init();
      return Array.from(records.values());
    },

    async delete(id: string): Promise<void> {
      await init();
      records.delete(id);
      const filePath = join(executionsDir, `${id}.json`);
      try {
        await fs.unlink(filePath);
      } catch {
        // File might not exist
      }
    },

    async saveWorkflow(workflow: Workflow): Promise<void> {
      await init();
      workflows.set(workflow.id, workflow);
      const filePath = join(workflowsDir, `${workflow.id}.json`);
      try {
        await fs.writeFile(filePath, serializeWorkflow(workflow));
      } catch {
        // Silently ignore write errors (e.g., permission denied in sandbox)
      }
    },

    async getWorkflow(id: string): Promise<Workflow | undefined> {
      await init();
      return workflows.get(id);
    },

    async listWorkflows(): Promise<Workflow[]> {
      await init();
      return Array.from(workflows.values());
    },

    async deleteWorkflow(id: string): Promise<void> {
      await init();
      workflows.delete(id);
      const filePath = join(workflowsDir, `${id}.json`);
      try {
        await fs.unlink(filePath);
      } catch {
        // File might not exist
      }
    },
  };
}