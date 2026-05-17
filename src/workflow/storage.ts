import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import type { Workflow, ExecutionRecord, StepRecord } from '../types/index.js';
import { getLogger } from '../utils/logger.js';
import { createOutputStore, type OutputStore } from '../execution/output-store.js';
import { getVectaHubHome } from '../utils/paths.js';

const logger = getLogger('storage');

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
  await fs.mkdir(dir, { recursive: true });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function isNotFoundError(error: unknown): boolean {
  return isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

function parseJsonObject(content: string, source: string): Record<string, unknown> {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON from ${source}: ${message}`, { cause: error });
  }
}

function parseWorkflowFromJson(content: string, source: string): Workflow {
  return parseJsonObject(content, source) as unknown as Workflow;
}

export function createStorage(options: StorageOptions = {}): Storage {
  const storageDir = options.storageDir || getVectaHubHome();
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
        const ref = await outputStore.save(record.executionId, step.stepId, stdout, step.error || undefined);
        stepsWithRefs.push({
          ...step,
          output: [],
          error: step.error,
        } as unknown as StepRecord);
        const stepRef = stepsWithRefs[stepsWithRefs.length - 1] as unknown as Record<string, unknown>;
        stepRef.outputRef = `${record.executionId}/${step.stepId}.stdout`;
        stepRef.outputSummary = ref.summary;
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
        const outputRef = stepData.outputRef as string | undefined;
        const summary = stepData.outputSummary as string | undefined;
        if (!outputRef) {
          enrichedSteps.push({
            ...step,
            output: summary ? [summary] : [],
          } as unknown as StepRecord);
          continue;
        }

        const stdoutPath = path.join(storageDir, 'outputs', outputRef);
        const stderrPath = stdoutPath.endsWith('.stdout')
          ? stdoutPath.replace(/\.stdout$/, '.stderr')
          : `${stdoutPath}.stderr`;

        try {
          const stdout = await fs.readFile(stdoutPath, 'utf-8');
          let stderr = '';
          try {
            stderr = await fs.readFile(stderrPath, 'utf-8');
          } catch (error) {
            if (!isNotFoundError(error)) {
              throw error;
            }
          }

          enrichedSteps.push({
            ...step,
            output: stdout ? stdout.split('\n') : [],
            error: step.error || stderr,
          } as unknown as StepRecord);
        } catch (error) {
          if (!isNotFoundError(error)) {
            throw error;
          }
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
        const data = parseJsonObject(await fs.readFile(filePath, 'utf-8'), filePath);
        const record = readRecordWithOutput(data);
        return enrichRecordWithOutput(record);
      } catch (error) {
        if (isNotFoundError(error)) {
          return undefined;
        }
        throw error;
      }
    },

    async list(): Promise<ExecutionRecord[]> {
      try {
        const files = await fs.readdir(executionsDir);
        const records = await Promise.all(
          files
            .filter(f => f.endsWith('.json'))
            .map(async f => {
              const filePath = path.join(executionsDir, f);
              const data = parseJsonObject(await fs.readFile(filePath, 'utf-8'), filePath);
              return readRecordWithOutput(data);
            })
        );
        return records.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      } catch (error) {
        if (isNotFoundError(error)) {
          return [];
        }
        throw error;
      }
    },

    async delete(id: string): Promise<void> {
      const filePath = path.join(executionsDir, `${id}.json`);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }
      }
      if (outputStore) {
        await outputStore.delete(id);
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
          const data = ext === 'yaml'
            ? (YAML.parse(content) as Record<string, unknown>)
            : parseWorkflowFromJson(content, filePath);
          const workflow = data as unknown as Workflow;
          return {
            ...workflow,
            createdAt: new Date(workflow.createdAt)
          };
        } catch (error) {
          if (isNotFoundError(error)) {
            continue;
          }
          throw error;
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
              const data = ext === 'yaml'
                ? (YAML.parse(content) as Record<string, unknown>)
                : parseWorkflowFromJson(content, filePath);
              const workflow = data as unknown as Workflow;
              return {
                ...workflow,
                createdAt: new Date(workflow.createdAt)
              };
            })
        );
        return workflows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } catch (error) {
        if (isNotFoundError(error)) {
          return [];
        }
        throw error;
      }
    },

    async deleteWorkflow(id: string): Promise<void> {
      for (const ext of ['yaml', 'json']) {
        const filePath = path.join(workflowsDir, `${id}.${ext}`);
        try {
          await fs.unlink(filePath);
        } catch (error) {
          if (!isNotFoundError(error)) {
            throw error;
          }
        }
      }
    },

    async loadWorkflowFromFile(filepath: string): Promise<Workflow | null> {
      try {
        const ext = path.extname(filepath).toLowerCase().slice(1);
        const content = await fs.readFile(filepath, 'utf-8');
        if (['yaml', 'yml'].includes(ext)) {
          const data = YAML.parse(content) as Record<string, unknown>;
          return {
            ...data,
            createdAt: data.createdAt ? new Date(String(data.createdAt)) : new Date()
          } as Workflow;
        }
        const data = parseWorkflowFromJson(content, filepath) as unknown as Record<string, unknown>;
        return {
          ...data,
          createdAt: data.createdAt ? new Date(String(data.createdAt)) : new Date()
        } as Workflow;
      } catch (error) {
        if (isNotFoundError(error)) {
          logger.debug(`文件不存在: ${filepath}`);
          return null;
        }
        throw error;
      }
    },

    getOutputStore(): OutputStore | undefined {
      return outputStore;
    },
  };
}
