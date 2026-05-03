import fs from 'node:fs';
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

export function createStorage(options: StorageOptions = {}): Storage {
  const storageDir = options.storageDir || DEFAULT_STORAGE_DIR;
  const executionsDir = path.join(storageDir, 'executions');
  const workflowsDir = path.join(storageDir, 'workflows');

  function initDirectories() {
    [storageDir, executionsDir, workflowsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  initDirectories();

  return {
    async save(record: ExecutionRecord): Promise<void> {
      initDirectories();
      const filePath = path.join(executionsDir, `${record.executionId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
    },

    async get(id: string): Promise<ExecutionRecord | undefined> {
      const filePath = path.join(executionsDir, `${id}.json`);
      if (!fs.existsSync(filePath)) return undefined;
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return {
        ...data,
        startedAt: new Date(data.startedAt),
        endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
      };
    },

    async list(): Promise<ExecutionRecord[]> {
      if (!fs.existsSync(executionsDir)) return [];
      return fs.readdirSync(executionsDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const data = JSON.parse(fs.readFileSync(path.join(executionsDir, f), 'utf-8'));
          return {
            ...data,
            startedAt: new Date(data.startedAt),
            endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
          };
        })
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    },

    async delete(id: string): Promise<void> {
      const filePath = path.join(executionsDir, `${id}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    },

    async saveWorkflow(workflow: Workflow, format: 'json' | 'yaml' = 'yaml'): Promise<void> {
      initDirectories();
      const ext = format === 'yaml' ? 'yaml' : 'json';
      const filePath = path.join(workflowsDir, `${workflow.id}.${ext}`);
      
      let content;
      if (format === 'yaml') {
        content = YAML.stringify(workflow, { indent: 2, blockQuote: true });
      } else {
        content = JSON.stringify(workflow, null, 2);
      }
      
      fs.writeFileSync(filePath, content, 'utf-8');
    },

    async getWorkflow(id: string): Promise<Workflow | undefined> {
      for (const ext of ['yaml', 'json']) {
        const filePath = path.join(workflowsDir, `${id}.${ext}`);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          const data = ext === 'yaml' ? YAML.parse(content) : JSON.parse(content);
          return {
            ...data,
            createdAt: new Date(data.createdAt)
          };
        }
      }
      return undefined;
    },

    async listWorkflows(): Promise<Workflow[]> {
      if (!fs.existsSync(workflowsDir)) return [];
      return fs.readdirSync(workflowsDir)
        .filter(f => f.endsWith('.yaml') || f.endsWith('.json'))
        .map(f => {
          const filePath = path.join(workflowsDir, f);
          const content = fs.readFileSync(filePath, 'utf-8');
          const ext = path.extname(f).toLowerCase().slice(1);
          const data = ext === 'yaml' ? YAML.parse(content) : JSON.parse(content);
          return {
            ...data,
            createdAt: new Date(data.createdAt)
          };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async deleteWorkflow(id: string): Promise<void> {
      for (const ext of ['yaml', 'json']) {
        const filePath = path.join(workflowsDir, `${id}.${ext}`);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    },

    async loadWorkflowFromFile(filepath: string): Promise<Workflow | null> {
      if (!fs.existsSync(filepath)) {
        logger.debug(`文件不存在: ${filepath}`);
        return null;
      }

      const ext = path.extname(filepath).toLowerCase().slice(1);
      const content = fs.readFileSync(filepath, 'utf-8');

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
      } catch (e) {
        logger.error(`无法解析文件: ${filepath}`);
        return null;
      }
    }
  };
}
