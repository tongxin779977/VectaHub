import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { createConsoleLogger } from './logger.js';
import { getVectaHubPath } from './paths.js';

const logger = createConsoleLogger('config-security');

export interface ConfigSecurityOptions {
  configPath?: string;
  enableChecksums?: boolean;
  enablePermissions?: boolean;
}

export interface ConfigChange {
  timestamp: string;
  type: 'create' | 'modify' | 'delete';
  oldHash?: string;
  newHash?: string;
  detectedBy: string;
}

export interface SecurityStatus {
  secure: boolean;
  issues: SecurityIssue[];
  lastChecked: string;
}

export interface SecurityIssue {
  type: 'permission' | 'integrity' | 'encryption' | 'access';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  suggestion: string;
}

const DEFAULT_CONFIG_PATH = getVectaHubPath('config.yaml');

export class ConfigSecurity {
  private configPath: string;
  private enableChecksums: boolean;
  private enablePermissions: boolean;
  private hashStore: Map<string, string> = new Map();

  constructor(options?: ConfigSecurityOptions) {
    this.configPath = options?.configPath || DEFAULT_CONFIG_PATH;
    this.enableChecksums = options?.enableChecksums ?? true;
    this.enablePermissions = options?.enablePermissions ?? true;
    this.loadHashes();
  }

  private async loadHashes(): Promise<void> {
    const hashFile = this.getHashFilePath();
    
    try {
      const content = await fs.readFile(hashFile, 'utf-8');
      const hashes = JSON.parse(content);
      this.hashStore = new Map(Object.entries(hashes));
    } catch {
      this.hashStore = new Map();
    }
  }

  private async saveHashes(): Promise<void> {
    const hashFile = this.getHashFilePath();
    const hashes: Record<string, string> = {};
    this.hashStore.forEach((value, key) => {
      hashes[key] = value;
    });
    
    await fs.writeFile(hashFile, JSON.stringify(hashes, null, 2), 'utf-8');
  }

  private getHashFilePath(): string {
    return getVectaHubPath('.config-hashes.json');
  }

  async verifyConfigIntegrity(filePath?: string): Promise<{ valid: boolean; hash: string }> {
    const targetPath = filePath || this.configPath;
    
    try {
      const content = await fs.readFile(targetPath, 'utf-8');
      const currentHash = this.computeHash(content);
      const storedHash = this.hashStore.get(targetPath);

      if (!storedHash) {
        this.hashStore.set(targetPath, currentHash);
        await this.saveHashes();
        return { valid: true, hash: currentHash };
      }

      return { valid: currentHash === storedHash, hash: currentHash };
    } catch {
      return { valid: false, hash: '' };
    }
  }

  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async updateConfigHash(filePath?: string): Promise<void> {
    const targetPath = filePath || this.configPath;
    
    try {
      const content = await fs.readFile(targetPath, 'utf-8');
      const hash = this.computeHash(content);
      this.hashStore.set(targetPath, hash);
      await this.saveHashes();
      logger.debug(`Updated hash for ${targetPath}`);
    } catch (error) {
      logger.error(`Failed to update config hash: ${(error as Error).message}`);
    }
  }

  async checkFilePermissions(filePath?: string): Promise<{ secure: boolean; permissions: string }> {
    if (!this.enablePermissions) {
      return { secure: true, permissions: 'checks_disabled' };
    }

    const targetPath = filePath || this.configPath;

    try {
      const stat = await fs.stat(targetPath);
      const mode = stat.mode.toString(8).padStart(6, '0');
      const permissionOctal = mode.slice(-4);
      
      const isSecure = this.isPermissionSecure(permissionOctal);
      
      return { 
        secure: isSecure, 
        permissions: permissionOctal 
      };
    } catch {
      return { secure: false, permissions: 'unknown' };
    }
  }

  private isPermissionSecure(permissions: string): boolean {
    const ownerPerms = permissions[0];
    const groupPerms = permissions[1];
    const otherPerms = permissions[2];

    if (otherPerms !== '0' && otherPerms !== '4') {
      return false;
    }

    if (groupPerms !== '0' && groupPerms !== '4') {
      return false;
    }

    return true;
  }

  async enforceSecurePermissions(filePath?: string): Promise<boolean> {
    if (!this.enablePermissions) {
      return true;
    }

    const targetPath = filePath || this.configPath;

    try {
      await fs.chmod(targetPath, 0o600);
      logger.info(`Set secure permissions (600) for ${targetPath}`);
      return true;
    } catch (error) {
      logger.error(`Failed to set permissions: ${(error as Error).message}`);
      return false;
    }
  }

  async scanSecurityIssues(): Promise<SecurityStatus> {
    const issues: SecurityIssue[] = [];

    if (this.enablePermissions) {
      const permResult = await this.checkFilePermissions();
      if (!permResult.secure) {
        issues.push({
          type: 'permission',
          severity: 'high',
          message: `Config file has insecure permissions: ${permResult.permissions}`,
          suggestion: 'Run `chmod 600` on the config file or use enforceSecurePermissions()',
        });
      }
    }

    if (this.enableChecksums) {
      const integrityResult = await this.verifyConfigIntegrity();
      if (!integrityResult.valid) {
        issues.push({
          type: 'integrity',
          severity: 'critical',
          message: 'Config file integrity check failed - file may have been tampered with',
          suggestion: 'Verify the config file content manually and update the hash',
        });
      }
    }

    return {
      secure: issues.length === 0,
      issues,
      lastChecked: new Date().toISOString(),
    };
  }

  async detectChanges(filePath?: string): Promise<ConfigChange | null> {
    const targetPath = filePath || this.configPath;
    const result = await this.verifyConfigIntegrity(targetPath);
    
    if (!result.valid) {
      const storedHash = this.hashStore.get(targetPath);
      
      return {
        timestamp: new Date().toISOString(),
        type: 'modify',
        oldHash: storedHash,
        newHash: result.hash,
        detectedBy: 'integrity_check',
      };
    }

    return null;
  }

  async backupConfig(destination?: string): Promise<string> {
    const dest = destination || getVectaHubPath(`config.backup.${Date.now()}.yaml`);
    
    try {
      await fs.copyFile(this.configPath, dest);
      await this.enforceSecurePermissions(dest);
      logger.info(`Config backed up to ${dest}`);
      return dest;
    } catch (error) {
      logger.error(`Failed to backup config: ${(error as Error).message}`);
      throw error;
    }
  }

  async restoreConfig(backupPath: string): Promise<void> {
    try {
      await fs.copyFile(backupPath, this.configPath);
      await this.enforceSecurePermissions();
      await this.updateConfigHash();
      logger.info(`Config restored from ${backupPath}`);
    } catch (error) {
      logger.error(`Failed to restore config: ${(error as Error).message}`);
      throw error;
    }
  }

  getStoredHash(filePath?: string): string | undefined {
    const targetPath = filePath || this.configPath;
    return this.hashStore.get(targetPath);
  }

  clearHashes(): void {
    this.hashStore.clear();
    fs.unlink(this.getHashFilePath()).catch(() => {});
  }
}

export function createConfigSecurity(options?: ConfigSecurityOptions): ConfigSecurity {
  return new ConfigSecurity(options);
}