import fs from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import YAML from 'yaml';
import type { Workflow, ExecutionRecord } from '../types/index.js';
import { createConsoleLogger } from '../utils/logger.js';

const logger = createConsoleLogger('storage');

const DEFAULT_STORAGE_DIR = path.join(homedir(), '.vectahub');

export interface StorageOptions {
  storageDir?: string;
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

  return {
    async save(record: ExecutionRecord): Promise<void> {
      await ensureDir(executionsDir);
      const filePath = path.join(executionsDir, `${record.executionId}.json`);
      await fs.writeFile(filePath, JSON.stringify(record, null, 2), 'utf-8');
    },

    async get(id: string): Promise<ExecutionRecord | undefined> {
      const filePath = path.join(executionsDir, `${id}.json`);
      try {
        const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        return {
          ...data,
          startedAt: new Date(data.startedAt),
          endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
        };
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
              return {
                ...data,
                startedAt: new Date(data.startedAt),
                endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
              };
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
    }
  };
}
