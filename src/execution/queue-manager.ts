import { promises as fs, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getVectaHubPath, getProjectQueuePath } from '../infrastructure/paths/index.js';
import type { DiagnosticTask, DiagnosticTaskStatus } from '../types/diagnostic.js';
import { validateDiagnosticQueue } from '../types/diagnostic.js';
import { getDefaultContext } from '../infrastructure/context.js';

const logger = getDefaultContext().logger.getLogger('queue-manager');
const MAX_QUEUE_SIZE = 100;

function getDefaultQueueFile(): string {
  return getVectaHubPath('diagnostic-queue.json');
}

export class QueueManager {
  private static instance: QueueManager;
  private lock: Promise<void> = Promise.resolve();
  private readonly queueFile: string;

  private constructor(queueFilePath?: string) {
    this.queueFile = queueFilePath || getDefaultQueueFile();
    this.ensureDirectory();
  }

  static getInstance(): QueueManager {
    const queueFile = getDefaultQueueFile();
    if (!QueueManager.instance || QueueManager.instance.queueFile !== queueFile) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }

  static createForPath(queueFilePath: string): QueueManager {
    return new QueueManager(queueFilePath);
  }

  private ensureDirectory(): void {
    const dir = dirname(this.queueFile);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private async acquireLock(): Promise<() => void> {
    let release: () => void;
    const nextLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const currentLock = this.lock;
    this.lock = nextLock;

    await currentLock;
    return release!;
  }

  async loadTasks(): Promise<DiagnosticTask[]> {
    const release = await this.acquireLock();
    try {
      if (!existsSync(this.queueFile)) {
        return [];
      }
      const content = await fs.readFile(this.queueFile, 'utf-8');
      const data = JSON.parse(content);

      const validTasks = validateDiagnosticQueue(data);
      if (Array.isArray(data) && validTasks.length !== data.length) {
        throw new Error(`Diagnostic queue contains ${data.length - validTasks.length} invalid task entries`);
      }
      return validTasks;
    } catch (error) {
      logger.error(`Failed to load diagnostic queue: ${error}`);
      throw new Error(`Failed to load diagnostic queue from ${this.queueFile}`, { cause: error });
    } finally {
      release();
    }
  }

  async saveTasks(tasks: DiagnosticTask[]): Promise<void> {
    const release = await this.acquireLock();
    try {
      await fs.writeFile(this.queueFile, JSON.stringify(tasks, null, 2), 'utf-8');
    } catch (error) {
      logger.error(`Failed to save diagnostic queue: ${error}`);
      throw error;
    } finally {
      release();
    }
  }

  async addTask(task: Omit<DiagnosticTask, 'createdAt' | 'updatedAt'>): Promise<void> {
    const tasks = await this.loadTasks();
    const now = new Date();
    
    // De-duplicate by sourceId if present
    if (task.sourceId && tasks.some(t => t.sourceId === task.sourceId)) {
      return;
    }

    const newTask: DiagnosticTask = {
      ...task,
      createdAt: now,
      updatedAt: now,
    };

    tasks.unshift(newTask); // Newest first
    await this.saveTasks(tasks);
  }

  async enqueue(task: Omit<DiagnosticTask, 'createdAt' | 'updatedAt'>): Promise<boolean> {
    const tasks = await this.loadTasks();
    if (tasks.length >= MAX_QUEUE_SIZE) {
      logger.warn(`Queue is full (${tasks.length}/${MAX_QUEUE_SIZE}), rejecting task "${task.title}"`);
      return false;
    }

    if (task.sourceId && tasks.some(t => t.sourceId === task.sourceId)) {
      return true;
    }

    const now = new Date();
    const newTask: DiagnosticTask = {
      ...task,
      createdAt: now,
      updatedAt: now,
    };

    tasks.unshift(newTask);
    await this.saveTasks(tasks);
    return true;
  }

  async updateTaskStatus(id: string, status: DiagnosticTaskStatus, error?: string): Promise<void> {
    const tasks = await this.loadTasks();
    const task = tasks.find(t => t.id === id);
    if (task) {
      task.status = status;
      task.updatedAt = new Date();
      if (error) task.error = error;
      await this.saveTasks(tasks);
    }
  }

  async removeTask(id: string): Promise<void> {
    const tasks = await this.loadTasks();
    const filtered = tasks.filter(t => t.id !== id);
    await this.saveTasks(filtered);
  }

  async clearCompleted(): Promise<void> {
    const tasks = await this.loadTasks();
    const filtered = tasks.filter(t => t.status !== 'completed');
    await this.saveTasks(filtered);
  }

  async clearAll(): Promise<void> {
    await this.saveTasks([]);
  }
}

export function getQueueManager(): QueueManager {
  return QueueManager.getInstance();
}

export function getQueueManagerForProject(projectRoot: string): QueueManager {
  return QueueManager.createForPath(getProjectQueuePath(projectRoot));
}
