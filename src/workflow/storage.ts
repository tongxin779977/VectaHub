import fs from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import YAML from 'yaml';
import type { Workflow, ExecutionRecord, StepRecord } from '../types/index.js';
import { createConsoleLogger } from '../utils/logger.js';
import { createOutputStore, type OutputStore } from '../execution/output-store.js';

const logger = createConsoleLogger('storage');

const DEFAULT_STORAGE_DIR = path.join(homedir(), '.vectahub');

export interface StorageOptions {
  storageDir?: string;
  separateOutput?: boolean;
}

export interface Storage {
  save(record: ExecutionRecord): Promise<void>;
  get(id: string): Promise<ExecutionRecord | undefined>;
  list(): Promise<ExecutionRecord[]>;
  delete(id: string): Promise<void>;

  saveWorkflow(workflow: Workflow, format?: 'json' | 'yaml'): Promise<void>;
  getWorkflow(id: string): Promise<Workflow | undefined>;
  listWorkflows(): Promise<Workflow[]>;
  deleteWorkflow(id: string): Promise<void>;

  loadWorkflowFromFile(filepath: string): Promise<Workflow | null>;

  getOutputStore(): OutputStore | undefined;
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {

  }
}

export function createStorage(options: StorageOptions = {}): Storage {
  const storageDir = options.storageDir || DEFAULT_STORAGE_DIR;
  const executionsDir = path.join(storageDir, 'executions');
  const workflowsDir = path.join(storageDir, 'workflows');
  const separateOutput = options.separateOutput !== false;

  const outputStore = separateOutput ? createOutputStore(path.join(storageDir, 'outputs')) : undefined;

  async function saveRecordWithOutput(record: ExecutionRecord): Promise<void> {
    if (!outputStore) {
      await ensureDir(executionsDir);
      const filePath = path.join(executionsDir, `${record.executionId}.json`);
      await fs.writeFile(filePath, JSON.stringify(record, null, 2), 'utf-8');
      return;
    }

    const recordToSave = { ...record };
    const stepsWithRefs: StepRecord[] = [];

    for (const step of record.steps) {
      if (step.output && step.output.length > 0) {
        const stdout = step.output.join('\n');
        try {
          const ref = await outputStore.save(record.executionId, step.stepId, stdout, step.error || undefined);
          stepsWithRefs.push({
            ...step,
            output: [],
            error: step.error,
          } as unknown as StepRecord);
          const stepRef = stepsWithRefs[stepsWithRefs.length - 1] as unknown as Record<string, unknown>;
          stepRef.outputRef = `${record.executionId}/${step.stepId}.stdout`;
          stepRef.outputSummary = ref.summary;
        } catch {
          stepsWithRefs.push(step);
        }
      } else {
        stepsWithRefs.push(step);
      }
    }

    recordToSave.steps = stepsWithRefs;

    await ensureDir(executionsDir);
    const filePath = path.join(executionsDir, `${record.executionId}.json`);
    await fs.writeFile(filePath, JSON.stringify(recordToSave, null, 2), 'utf-8');
  }

  function readRecordWithOutput(data: Record<string, unknown>): ExecutionRecord {
    return {
      ...data,
      startedAt: new Date(data.startedAt as string),
      endedAt: (data.endedAt as string) ? new Date(data.endedAt as string) : undefined,
    } as unknown as ExecutionRecord;
  }

  async function enrichRecordWithOutput(record: ExecutionRecord): Promise<ExecutionRecord> {
    if (!outputStore) return record;

    const enrichedSteps: StepRecord[] = [];
    for (const step of record.steps) {
      const stepData = step as unknown as Record<string, unknown>;
      if (stepData.outputRef || stepData.outputSummary) {
        try {
          const stored = await outputStore.read(record.executionId, step.stepId);
          enrichedSteps.push({
            ...step,
            output: stored.stdout ? stored.stdout.split('\n') : [],
            error: step.error || stored.stderr,
          } as unknown as StepRecord);
        } catch {
          const summary = stepData.outputSummary as string | undefined;
          enrichedSteps.push({
            ...step,
            output: summary ? [summary] : [],
          } as unknown as StepRecord);
        }
      } else {
        enrichedSteps.push(step);
      }
    }

    return { ...record, steps: enrichedSteps };
  }

  return {
    async save(record: ExecutionRecord): Promise<void> {
      await saveRecordWithOutput(record);
    },

    async get(id: string): Promise<ExecutionRecord | undefined> {
      const filePath = path.join(executionsDir, `${id}.json`);
      try {
        const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        const record = readRecordWithOutput(data);
        return enrichRecordWithOutput(record);
      } catch {
        return undefined;
      }
    },

    async list(): Promise<ExecutionRecord[]> {
      try {
        const files = await fs.readdir(executionsDir);
        const records = await Promise.all(
          files
            .filter(f => f.endsWith('.json'))
            .map(async f => {
              const data = JSON.parse(await fs.readFile(path.join(executionsDir, f), 'utf-8'));
              return readRecordWithOutput(data);
            })
        );
        return records.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      } catch {
        return [];
      }
    },

    async delete(id: string): Promise<void> {
      const filePath = path.join(executionsDir, `${id}.json`);
      try {
        await fs.unlink(filePath);
      } catch {

      }
      if (outputStore) {
        try {
          await outputStore.delete(id);
        } catch {

        }
      }
    },

    async saveWorkflow(workflow: Workflow, format: 'json' | 'yaml' = 'yaml'): Promise<void> {
      await ensureDir(workflowsDir);
      const ext = format === 'yaml' ? 'yaml' : 'json';
      const filePath = path.join(workflowsDir, `${workflow.id}.${ext}`);

      let content: string;
      if (format === 'yaml') {
        content = YAML.stringify(workflow, { indent: 2, blockQuote: true });
      } else {
        content = JSON.stringify(workflow, null, 2);
      }

      await fs.writeFile(filePath, content, 'utf-8');
    },

    async getWorkflow(id: string): Promise<Workflow | undefined> {
      for (const ext of ['yaml', 'json']) {
        const filePath = path.join(workflowsDir, `${id}.${ext}`);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const data = ext === 'yaml' ? YAML.parse(content) : JSON.parse(content);
          return {
            ...data,
            createdAt: new Date(data.createdAt)
          };
        } catch {
          continue;
        }
      }
      return undefined;
    },

    async listWorkflows(): Promise<Workflow[]> {
      try {
        const files = await fs.readdir(workflowsDir);
        const workflows = await Promise.all(
          files
            .filter(f => f.endsWith('.yaml') || f.endsWith('.json'))
            .map(async f => {
              const filePath = path.join(workflowsDir, f);
              const content = await fs.readFile(filePath, 'utf-8');
              const ext = path.extname(f).toLowerCase().slice(1);
              const data = ext === 'yaml' ? YAML.parse(content) : JSON.parse(content);
              return {
                ...data,
                createdAt: new Date(data.createdAt)
              };
            })
        );
        return workflows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } catch {
        return [];
      }
    },

    async deleteWorkflow(id: string): Promise<void> {
      for (const ext of ['yaml', 'json']) {
        const filePath = path.join(workflowsDir, `${id}.${ext}`);
        try {
          await fs.unlink(filePath);
        } catch {

        }
      }
    },

    async loadWorkflowFromFile(filepath: string): Promise<Workflow | null> {
      try {
        await fs.access(filepath);
      } catch {
        logger.debug(`文件不存在: ${filepath}`);
        return null;
      }

      const ext = path.extname(filepath).toLowerCase().slice(1);
      const content = await fs.readFile(filepath, 'utf-8');

      try {
        let data;
        if (['yaml', 'yml'].includes(ext)) {
          data = YAML.parse(content);
        } else {
          data = JSON.parse(content);
        }

        return {
          ...data,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date()
        };
      } catch {
        logger.error(`无法解析文件: ${filepath}`);
        return null;
      }
    },

    getOutputStore(): OutputStore | undefined {
      return outputStore;
    },
  };
}
