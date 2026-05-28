import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { SecurityDatabase, SecurityConfig } from './types.js';
import { getDefaultRules } from './default-rules.js';
import { getVectaHubPath } from '../infrastructure/paths/index.js';

function toError(error: unknown, message: string): Error {
  return error instanceof Error ? new Error(message, { cause: error }) : new Error(`${message}: ${String(error)}`);
}

export interface TestState {
  mode: boolean;
  config: SecurityConfig | null;
  database: SecurityDatabase | null;
}

export interface SecurityConfigStoreOptions {
  configPath?: string;
  logger?: Pick<Console, 'warn'>;
}

/**
 * Manages security configuration and database file I/O operations.
 * Handles loading, saving, and initializing config and database files.
 * Supports test mode via shared TestState reference for in-memory operation.
 */
export class SecurityConfigStore {
  private config: SecurityConfig;
  private database: SecurityDatabase;
  private readonly databasePath: string;
  private readonly configPath: string;
  private readonly logger: Pick<Console, 'warn'>;
  private readonly testState: TestState;

  constructor(options: SecurityConfigStoreOptions = {}, testState: TestState = { mode: false, config: null, database: null }) {
    this.logger = options.logger ?? { warn() {} };
    this.testState = testState;

    if (testState.mode && testState.config && testState.database) {
      this.configPath = '';
      this.databasePath = '';
      this.config = testState.config;
      this.database = testState.database;
      return;
    }

    this.configPath = options.configPath || getVectaHubPath('security-config.json');
    this.databasePath = join(dirname(this.configPath), 'security-database.json');
    this.config = this.loadConfig();
    this.database = this.loadDatabase();
  }

  /** Returns the config object reference */
  getConfig(): SecurityConfig {
    return this.config;
  }

  /** Returns the database object reference */
  getDatabase(): SecurityDatabase {
    return this.database;
  }

  /** Returns the config file path */
  getConfigPath(): string {
    return this.configPath;
  }

  /** Returns the database file path */
  getDatabasePath(): string {
    return this.databasePath;
  }

  /** Loads security config from disk, creating defaults if file does not exist */
  loadConfig(): SecurityConfig {
    const defaultConfig: SecurityConfig = {
      databasePath: this.databasePath,
      autoUpdate: true,
      rules: {
        enabled: [],
        disabled: []
      }
    };

    if (this.testState.mode || !existsSync(this.configPath)) {
      if (this.testState.mode) {
        return this.testState.config || defaultConfig;
      }
      this.ensureDirectory(this.configPath);
      try {
        writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      } catch (error) {
        throw toError(error, `Failed to initialize security config at ${this.configPath}`);
      }
      return defaultConfig;
    }

    try {
      const content = readFileSync(this.configPath, 'utf-8');
      const loaded = JSON.parse(content);
      return { ...defaultConfig, ...loaded };
    } catch (error) {
      throw toError(error, `Failed to load security config from ${this.configPath}`);
    }
  }

  /** Saves current config to disk (or updates test state in test mode) */
  saveConfig(): void {
    if (this.testState.mode) {
      if (this.testState.config) {
        this.testState.config = this.config;
      }
      return;
    }

    this.ensureDirectory(this.configPath);
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (error) {
      throw toError(error, `Failed to save security config to ${this.configPath}`);
    }
  }

  /** Loads security database from disk, creating defaults if file does not exist */
  loadDatabase(): SecurityDatabase {
    const defaultDb: SecurityDatabase = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      rules: getDefaultRules()
    };

    if (this.testState.mode || !existsSync(this.databasePath)) {
      if (this.testState.mode) {
        return this.testState.database || defaultDb;
      }
      this.ensureDirectory(this.databasePath);
      try {
        writeFileSync(this.databasePath, JSON.stringify(defaultDb, null, 2), 'utf-8');
      } catch (error) {
        throw toError(error, `Failed to initialize security database at ${this.databasePath}`);
      }
      return defaultDb;
    }

    try {
      const content = readFileSync(this.databasePath, 'utf-8');
      const loaded = JSON.parse(content);
      return loaded;
    } catch (error) {
      throw toError(error, `Failed to load security database from ${this.databasePath}`);
    }
  }

  /** Saves current database to disk (or updates test state in test mode) */
  saveDatabase(): void {
    if (this.testState.mode) {
      if (this.testState.database) {
        this.testState.database = this.database;
      }
      return;
    }

    this.database.lastUpdated = new Date().toISOString();
    this.ensureDirectory(this.databasePath);
    try {
      writeFileSync(this.databasePath, JSON.stringify(this.database, null, 2), 'utf-8');
    } catch (error) {
      throw toError(error, `Failed to save security database to ${this.databasePath}`);
    }
  }

  /** Ensures the parent directory of the given file path exists */
  ensureDirectory(filePath: string): void {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch (error) {
        throw toError(error, `Failed to create security directory ${dir}`);
      }
    }
  }
}
