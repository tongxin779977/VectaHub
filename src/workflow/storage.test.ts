import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs, existsSync } from 'fs';
import { join } from 'path';
import { createStorage, type Storage, type StorageOptions } from './storage.js';
import type { ExecutionRecord, Workflow } from '../types/index.js';

describe('Storage', () => {
  const TEST_DIR = '/tmp/vectahub-test';
  let storage: Storage;

  beforeEach(() => {
    const options: StorageOptions = { storageDir: TEST_DIR };
    storage = createStorage(options);
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      await fs.rm(TEST_DIR, { recursive: true });
    }
  });

  it('should save and retrieve a record', async () => {
    const record: ExecutionRecord = {
      executionId: 'exec_001',
      workflowId: 'wf_001',
      workflowName: 'test-workflow',
      status: 'COMPLETED',
      mode: 'relaxed',
      startedAt: new Date('2026-05-01T10:00:00Z'),
      endedAt: new Date('2026-05-01T10:00:03Z'),
      duration: 3000,
      steps: [],
      warnings: [],
      logs: [],
    };
    
    await storage.save(record);
    const retrieved = await storage.get('exec_001');
    
    expect(retrieved).toEqual(record);
  });

  it('should return undefined for non-existent record', async () => {
    const result = await storage.get('non-existent');
    expect(result).toBeUndefined();
  });

  it('should list all records', async () => {
    const record1: ExecutionRecord = {
      executionId: 'exec_001',
      workflowId: 'wf_001',
      workflowName: 'workflow1',
      status: 'COMPLETED',
      mode: 'relaxed',
      startedAt: new Date(),
      endedAt: new Date(),
      duration: 1000,
      steps: [],
      warnings: [],
      logs: [],
    };
    
    const record2: ExecutionRecord = {
      executionId: 'exec_002',
      workflowId: 'wf_002',
      workflowName: 'workflow2',
      status: 'FAILED',
      mode: 'strict',
      startedAt: new Date(),
      endedAt: new Date(),
      duration: 2000,
      steps: [],
      warnings: [],
      logs: [],
    };
    
    await storage.save(record1);
    await storage.save(record2);
    
    const list = await storage.list();
    expect(list.length).toBe(2);
    expect(list[0].executionId).toBe('exec_001');
    expect(list[1].executionId).toBe('exec_002');
  });

  it('should delete a record', async () => {
    const record: ExecutionRecord = {
      executionId: 'exec_001',
      workflowId: 'wf_001',
      workflowName: 'test-workflow',
      status: 'COMPLETED',
      mode: 'relaxed',
      startedAt: new Date(),
      endedAt: new Date(),
      duration: 1000,
      steps: [],
      warnings: [],
      logs: [],
    };
    
    await storage.save(record);
    await storage.delete('exec_001');
    
    const result = await storage.get('exec_001');
    expect(result).toBeUndefined();
  });

  it('should handle empty list', async () => {
    const list = await storage.list();
    expect(list).toEqual([]);
  });

  it('should persist records to disk', async () => {
    const record: ExecutionRecord = {
      executionId: 'exec_disk_001',
      workflowId: 'wf_001',
      workflowName: 'disk-workflow',
      status: 'COMPLETED',
      mode: 'relaxed',
      startedAt: new Date('2026-05-01T10:00:00Z'),
      endedAt: new Date('2026-05-01T10:00:03Z'),
      duration: 3000,
      steps: [],
      warnings: [],
      logs: [],
    };
    
    await storage.save(record);
    
    const filePath = join(TEST_DIR, 'executions', 'exec_disk_001.json');
    expect(existsSync(filePath)).toBe(true);
    
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.executionId).toBe('exec_disk_001');
    expect(parsed.workflowName).toBe('disk-workflow');
  });

  it('should load records from disk on initialization', async () => {
    const record: ExecutionRecord = {
      executionId: 'exec_load_001',
      workflowId: 'wf_001',
      workflowName: 'load-workflow',
      status: 'COMPLETED',
      mode: 'relaxed',
      startedAt: new Date('2026-05-01T10:00:00Z'),
      endedAt: new Date('2026-05-01T10:00:03Z'),
      duration: 3000,
      steps: [],
      warnings: [],
      logs: [],
    };
    
    await storage.save(record);
    
    const newStorage = createStorage({ storageDir: TEST_DIR });
    const loaded = await newStorage.get('exec_load_001');
    
    expect(loaded).toEqual(record);
  });

  describe('Workflows', () => {
    it('should save and retrieve a workflow', async () => {
      const workflow: Workflow = {
        id: 'wf_001',
        name: 'test-workflow',
        mode: 'relaxed',
        steps: [],
        createdAt: new Date('2026-05-01T10:00:00Z'),
      };
      
      await storage.saveWorkflow(workflow);
      const retrieved = await storage.getWorkflow('wf_001');
      
      expect(retrieved).toEqual(workflow);
    });

    it('should return undefined for non-existent workflow', async () => {
      const result = await storage.getWorkflow('non-existent');
      expect(result).toBeUndefined();
    });

    it('should list all workflows', async () => {
      const workflow1: Workflow = {
        id: 'wf_001',
        name: 'workflow1',
        mode: 'relaxed',
        steps: [],
        createdAt: new Date(),
      };
      
      const workflow2: Workflow = {
        id: 'wf_002',
        name: 'workflow2',
        mode: 'strict',
        steps: [],
        createdAt: new Date(),
      };
      
      await storage.saveWorkflow(workflow1);
      await storage.saveWorkflow(workflow2);
      
      const list = await storage.listWorkflows();
      expect(list.length).toBe(2);
      expect(list[0].id).toBe('wf_001');
      expect(list[1].id).toBe('wf_002');
    });

    it('should delete a workflow', async () => {
      const workflow: Workflow = {
        id: 'wf_001',
        name: 'test-workflow',
        mode: 'relaxed',
        steps: [],
        createdAt: new Date(),
      };
      
      await storage.saveWorkflow(workflow);
      await storage.deleteWorkflow('wf_001');
      
      const result = await storage.getWorkflow('wf_001');
      expect(result).toBeUndefined();
    });

    it('should handle empty workflow list', async () => {
      const list = await storage.listWorkflows();
      expect(list).toEqual([]);
    });

    it('should persist workflows to disk', async () => {
      const workflow: Workflow = {
        id: 'wf_disk_001',
        name: 'disk-workflow',
        mode: 'relaxed',
        steps: [],
        createdAt: new Date('2026-05-01T10:00:00Z'),
      };
      
      await storage.saveWorkflow(workflow);
      
      const filePath = join(TEST_DIR, 'workflows', 'wf_disk_001.json');
      expect(existsSync(filePath)).toBe(true);
      
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.id).toBe('wf_disk_001');
      expect(parsed.name).toBe('disk-workflow');
    });

    it('should load workflows from disk on initialization', async () => {
      const workflow: Workflow = {
        id: 'wf_load_001',
        name: 'load-workflow',
        mode: 'relaxed',
        steps: [],
        createdAt: new Date('2026-05-01T10:00:00Z'),
      };
      
      await storage.saveWorkflow(workflow);
      
      const newStorage = createStorage({ storageDir: TEST_DIR });
      const loaded = await newStorage.getWorkflow('wf_load_001');
      
      expect(loaded).toEqual(workflow);
    });
  });
});