import fs from 'node:fs/promises';
import path from 'node:path';
import { getDefaultContext } from '../infrastructure/context.js';
import { redactSensitiveData } from './sensitive-data.js';
import { getVectaHubPath } from './paths.js';

function getModuleLogger() {
  return getDefaultContext().logger.getLogger('operation-log');
}

export interface OperationLogEntry {
  id: string;
  timestamp: string;
  command: string;
  args: string[];
  success: boolean;
  duration?: number;
  error?: string;
  output?: string;
  sessionId?: string;
}

export interface OperationLogConfig {
  enabled: boolean;
  maxEntries: number;
  logFile?: string;
  autoFlush: boolean;
  redactSensitive: boolean;
}

const DEFAULT_CONFIG: OperationLogConfig = {
  enabled: true,
  maxEntries: 1000,
  autoFlush: true,
  redactSensitive: true,
};

export class OperationLog {
  private config: OperationLogConfig;
  private entries: OperationLogEntry[] = [];
  private logFile: string;
  private isFlushing = false;

  constructor(config?: Partial<OperationLogConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logFile = this.config.logFile || getVectaHubPath('logs', 'operations.jsonl');
    this.loadEntries();
  }

  private async loadEntries(): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const content = await fs.readFile(this.logFile, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      
      for (const line of lines.slice(-this.config.maxEntries)) {
        try {
          const entry = JSON.parse(line) as OperationLogEntry;
          this.entries.push(entry);
        } catch {
          continue;
        }
      }
    } catch {
      this.entries = [];
    }
  }

  async add(entry: Omit<OperationLogEntry, 'id' | 'timestamp'>): Promise<void> {
    if (!this.config.enabled) return;

    const newEntry: OperationLogEntry = {
      ...entry,
      id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    if (this.config.redactSensitive) {
      if (newEntry.args) {
        newEntry.args = newEntry.args.map(arg => 
          typeof arg === 'string' ? redactSensitiveData(arg) as string : arg
        );
      }
      if (newEntry.output) {
        newEntry.output = redactSensitiveData(newEntry.output) as string;
      }
      if (newEntry.error) {
        newEntry.error = redactSensitiveData(newEntry.error) as string;
      }
    }

    this.entries.push(newEntry);

    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries);
    }

    if (this.config.autoFlush) {
      await this.flush();
    }
  }

  async logCommand(command: string, args: string[], sessionId?: string): Promise<string> {
    const startTime = Date.now();
    const entryId = `op_${startTime}_${Math.random().toString(36).substring(2, 9)}`;

    const entry: OperationLogEntry = {
      id: entryId,
      timestamp: new Date(startTime).toISOString(),
      command,
      args: this.config.redactSensitive ? args.map(arg => 
        typeof arg === 'string' ? redactSensitiveData(arg) as string : arg
      ) : args,
      success: true,
      sessionId,
    };

    this.entries.push(entry);

    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries);
    }

    return entryId;
  }

  async updateEntry(entryId: string, updates: Partial<Pick<OperationLogEntry, 'success' | 'duration' | 'error' | 'output'>>): Promise<void> {
    const index = this.entries.findIndex(e => e.id === entryId);
    if (index !== -1) {
      if (this.config.redactSensitive) {
        if (updates.output) {
          updates.output = redactSensitiveData(updates.output) as string;
        }
        if (updates.error) {
          updates.error = redactSensitiveData(updates.error) as string;
        }
      }
      
      this.entries[index] = { ...this.entries[index], ...updates };

      if (this.config.autoFlush) {
        await this.flush();
      }
    }
  }

  private async flush(): Promise<void> {
    if (this.isFlushing) return;
    
    this.isFlushing = true;
    
    try {
      await fs.mkdir(path.dirname(this.logFile), { recursive: true });
      
      const lines = this.entries.map(entry => JSON.stringify(entry));
      await fs.writeFile(this.logFile, lines.join('\n') + '\n', 'utf-8');
    } catch (error) {
      getModuleLogger().error(`Failed to flush operation log: ${(error as Error).message}`);
    } finally {
      this.isFlushing = false;
    }
  }

  getEntries(options?: {
    limit?: number;
    command?: string;
    success?: boolean;
    sessionId?: string;
    since?: string;
  }): OperationLogEntry[] {
    let result = [...this.entries];

    if (options?.command) {
      result = result.filter(e => e.command === options.command);
    }

    if (options?.success !== undefined) {
      result = result.filter(e => e.success === options.success);
    }

    if (options?.sessionId) {
      result = result.filter(e => e.sessionId === options.sessionId);
    }

    if (options?.since) {
      result = result.filter(e => e.timestamp >= options.since!);
    }

    result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (options?.limit) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  getRecent(count: number = 10): OperationLogEntry[] {
    return [...this.entries]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, count);
  }

  getStats(): {
    total: number;
    success: number;
    failed: number;
    commands: Record<string, number>;
  } {
    const stats = {
      total: this.entries.length,
      success: 0,
      failed: 0,
      commands: {} as Record<string, number>,
    };

    for (const entry of this.entries) {
      if (entry.success) {
        stats.success++;
      } else {
        stats.failed++;
      }
      
      stats.commands[entry.command] = (stats.commands[entry.command] || 0) + 1;
    }

    return stats;
  }

  async clear(): Promise<void> {
    this.entries = [];
    await this.flush();
    getModuleLogger().info('Operation log cleared');
  }

  async exportToFile(filePath: string): Promise<void> {
    const lines = this.entries.map(entry => JSON.stringify(entry));
    await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf-8');
    getModuleLogger().info(`Operation log exported to ${filePath}`);
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  updateConfig(config: Partial<OperationLogConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export function createOperationLog(config?: Partial<OperationLogConfig>): OperationLog {
  return new OperationLog(config);
}
