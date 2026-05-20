import YAML from 'yaml';
import type { Workflow, ExecutionRecord, StepRecord } from '../types/index.js';
import { getDefaultContext } from '../infrastructure/context.js';
import { createOutputStore, type OutputStore } from '../execution/output-store.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';
import type pino from 'pino';

function getExtName(filepath: string): string {
  const match = filepath.match(/\.([^./\\]+)$/);
  return match ? '.' + match[1] : '';
}

export interface StorageOptions {
  storageDir?: string;
  separateOutput?: boolean;
  environment: IEnvironmentService;
  logger?: pino.Logger;
}

export interface Storage {
  // 向后兼容的旧接口
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

  // 新的 IStorage 兼容方法（向后兼容）
  saveExecution?(record: ExecutionRecord): Promise<void>;
  getExecution?(id: string): Promise<ExecutionRecord | undefined>;
  listExecutions?(): Promise<ExecutionRecord[]>;
}

async function ensureDir(dir: string, environment: IEnvironmentService): Promise<void> {
  await environment.mkdirAsync(dir, { recursive: true });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function isNotFoundError(error: unknown): boolean {
  if (isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
    return true;
  }
  if (typeof error === 'object' && error !== null && 'cause' in error) {
    return isNotFoundError((error as { cause: unknown }).cause);
  }
  return false;
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

export function createStorage(options: StorageOptions): Storage {
  const { environment } = options;
  const logger = options.logger ?? getDefaultContext().logger.getLogger('storage');
  const storageDir = options.storageDir || environment.getHomePath();
  const executionsDir = environment.joinPath(storageDir, 'executions');
  const workflowsDir = environment.joinPath(storageDir, 'workflows');
  const separateOutput = options.separateOutput !== false;

  const outputStore = separateOutput ? createOutputStore(environment.joinPath(storageDir, 'outputs')) : undefined;

  async function saveRecordWithOutput(record: ExecutionRecord): Promise<void> {
    if (!outputStore) {
      await ensureDir(executionsDir, environment);
      const filePath = environment.joinPath(executionsDir, `${record.executionId}.json`);
      environment.writeFile(filePath, JSON.stringify(record, null, 2));
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

    await ensureDir(executionsDir, environment);
    const filePath = environment.joinPath(executionsDir, `${record.executionId}.json`);
    environment.writeFile(filePath, JSON.stringify(recordToSave, null, 2));
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
        if (!outputRef) {
          throw new Error(
            `Execution output metadata is corrupted for ${record.executionId}/${step.stepId}: outputRef is missing`,
          );
        }

        const stdoutPath = environment.joinPath(storageDir, 'outputs', outputRef);
        const stderrPath = stdoutPath.endsWith('.stdout')
          ? stdoutPath.replace(/\.stdout$/, '.stderr')
          : `${stdoutPath}.stderr`;

        try {
          const stdout = await environment.readFileAsync(stdoutPath);
          let stderr = '';
          try {
            stderr = await environment.readFileAsync(stderrPath);
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
          throw new Error(
            `Execution output artifact is missing for ${record.executionId}/${step.stepId}: ${outputRef}`,
            { cause: error },
          );
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

    async saveExecution(record: ExecutionRecord): Promise<void> {
      await saveRecordWithOutput(record);
    },

    async get(id: string): Promise<ExecutionRecord | undefined> {
      const filePath = environment.joinPath(executionsDir, `${id}.json`);
      try {
        const data = parseJsonObject(await environment.readFileAsync(filePath), filePath);
        const record = readRecordWithOutput(data);
        return enrichRecordWithOutput(record);
      } catch (error) {
        if (isNotFoundError(error)) {
          return undefined;
        }
        throw error;
      }
    },

    async getExecution(id: string): Promise<ExecutionRecord | undefined> {
      const filePath = environment.joinPath(executionsDir, `${id}.json`);
      try {
        const data = parseJsonObject(await environment.readFileAsync(filePath), filePath);
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
        const files = environment.readDir(executionsDir);
        const records = await Promise.all(
          files
            .filter(f => f.endsWith('.json'))
            .map(async f => {
              const filePath = environment.joinPath(executionsDir, f);
              const data = parseJsonObject(await environment.readFileAsync(filePath), filePath);
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

    async listExecutions(): Promise<ExecutionRecord[]> {
      try {
        const files = environment.readDir(executionsDir);
        const records = await Promise.all(
          files
            .filter(f => f.endsWith('.json'))
            .map(async f => {
              const filePath = environment.joinPath(executionsDir, f);
              const data = parseJsonObject(await environment.readFileAsync(filePath), filePath);
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
      const filePath = environment.joinPath(executionsDir, `${id}.json`);
      try {
        environment.rm(filePath);
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
      await ensureDir(workflowsDir, environment);
      const ext = format === 'yaml' ? 'yaml' : 'json';
      const filePath = environment.joinPath(workflowsDir, `${workflow.id}.${ext}`);

      let content: string;
      if (format === 'yaml') {
        content = YAML.stringify(workflow, { indent: 2, blockQuote: true });
      } else {
        content = JSON.stringify(workflow, null, 2);
      }

      environment.writeFile(filePath, content);
    },

    async getWorkflow(id: string): Promise<Workflow | undefined> {
      for (const ext of ['yaml', 'json']) {
        const filePath = environment.joinPath(workflowsDir, `${id}.${ext}`);
        try {
          const content = await environment.readFileAsync(filePath);
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
        const files = environment.readDir(workflowsDir);
        const workflows = await Promise.all(
          files
            .filter(f => f.endsWith('.yaml') || f.endsWith('.json'))
            .map(async f => {
              const filePath = environment.joinPath(workflowsDir, f);
              const content = await environment.readFileAsync(filePath);
              const ext = getExtName(f).toLowerCase().slice(1);
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
        const filePath = environment.joinPath(workflowsDir, `${id}.${ext}`);
        try {
          environment.rm(filePath);
        } catch (error) {
          if (!isNotFoundError(error)) {
            throw error;
          }
        }
      }
    },

    async loadWorkflowFromFile(filepath: string): Promise<Workflow | null> {
      try {
        const ext = getExtName(filepath).toLowerCase().slice(1);
        const content = await environment.readFileAsync(filepath);
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
