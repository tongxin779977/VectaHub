import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import type pino from 'pino';

/**
 * 配置安全选项接口
 */
export interface ConfigSecurityOptions {
  configPath?: string;
  enableChecksums?: boolean;
  enablePermissions?: boolean;
}

export type ConfigSecurityPathResolver = (...segments: string[]) => string;

export interface ConfigSecurityDeps {
  logger: pino.Logger;
  resolveStoragePath: ConfigSecurityPathResolver;
}

export interface ConfigSecurityCreateOptions extends ConfigSecurityOptions {
  deps: ConfigSecurityDeps;
}

/**
 * 配置变更记录接口
 */
export interface ConfigChange {
  timestamp: string;
  type: 'create' | 'modify' | 'delete';
  oldHash?: string;
  newHash?: string;
  detectedBy: string;
}

/**
 * 安全状态接口
 */
export interface SecurityStatus {
  secure: boolean;
  issues: SecurityIssue[];
  lastChecked: string;
}

/**
 * 安全问题接口
 */
export interface SecurityIssue {
  type: 'permission' | 'integrity' | 'encryption' | 'access';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  suggestion: string;
}

/**
 * 配置安全管理类
 *
 * 负责配置文件的完整性校验、权限检查和备份恢复
 */
export class ConfigSecurity {
  private readonly logger: pino.Logger;
  private readonly resolveStoragePath: ConfigSecurityPathResolver;
  private configPath: string;
  private enableChecksums: boolean;
  private enablePermissions: boolean;
  private hashStore: Map<string, string> = new Map();

  constructor(options: ConfigSecurityCreateOptions) {
    this.assertDeps(options);
    this.logger = options.deps.logger;
    this.resolveStoragePath = options.deps.resolveStoragePath;
    this.configPath = options.configPath || this.resolveStoragePath('config.yaml');
    this.enableChecksums = options.enableChecksums ?? true;
    this.enablePermissions = options.enablePermissions ?? true;
    this.loadHashes();
  }

  /**
   * 显式依赖校验，缺失时直接失败
   */
  private assertDeps(options: ConfigSecurityCreateOptions | undefined): asserts options is ConfigSecurityCreateOptions {
    if (!options?.deps?.logger || typeof options.deps.resolveStoragePath !== 'function') {
      throw new Error('ConfigSecurity requires explicit logger and resolveStoragePath dependencies');
    }
  }

  /**
   * 加载已存储的哈希值
   */
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

  /**
   * 保存哈希值到文件
   */
  private async saveHashes(): Promise<void> {
    const hashFile = this.getHashFilePath();
    const hashes: Record<string, string> = {};
    this.hashStore.forEach((value, key) => {
      hashes[key] = value;
    });
    
    await fs.writeFile(hashFile, JSON.stringify(hashes, null, 2), 'utf-8');
  }

  /**
   * 获取哈希文件路径
   */
  private getHashFilePath(): string {
    return this.resolveStoragePath('.config-hashes.json');
  }

  /**
   * 验证配置文件完整性
   * @param filePath 可选的文件路径
   * @returns 验证结果和当前哈希
   */
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

  /**
   * 计算字符串的 SHA-256 哈希
   * @param content 输入内容
   * @returns 哈希值
   */
  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * 更新配置文件哈希
   * @param filePath 可选的文件路径
   */
  async updateConfigHash(filePath?: string): Promise<void> {
    const targetPath = filePath || this.configPath;
    
    try {
      const content = await fs.readFile(targetPath, 'utf-8');
      const hash = this.computeHash(content);
      this.hashStore.set(targetPath, hash);
      await this.saveHashes();
      this.logger.debug(`Updated hash for ${targetPath}`);
    } catch (error) {
      this.logger.error(`Failed to update config hash: ${(error as Error).message}`);
    }
  }

  /**
   * 检查文件权限是否安全
   * @param filePath 可选的文件路径
   * @returns 检查结果
   */
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

  /**
   * 判断权限是否安全（仅允许用户读写）
   * @param permissions 八进制权限字符串
   */
  private isPermissionSecure(permissions: string): boolean {
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

  /**
   * 强制设置安全权限（600）
   * @param filePath 可选的文件路径
   */
  async enforceSecurePermissions(filePath?: string): Promise<boolean> {
    if (!this.enablePermissions) {
      return true;
    }

    const targetPath = filePath || this.configPath;

    try {
      await fs.chmod(targetPath, 0o600);
      this.logger.info(`Set secure permissions (600) for ${targetPath}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to set permissions: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * 扫描安全问题
   * @returns 安全状态和问题列表
   */
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

  /**
   * 检测配置变更
   * @param filePath 可选的文件路径
   * @returns 变更记录或 null
   */
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

  /**
   * 备份配置文件
   * @param destination 可选的备份路径
   * @returns 备份路径
   */
  async backupConfig(destination?: string): Promise<string> {
    const dest = destination || this.resolveStoragePath(`config.backup.${Date.now()}.yaml`);
    
    try {
      await fs.copyFile(this.configPath, dest);
      await this.enforceSecurePermissions(dest);
      this.logger.info(`Config backed up to ${dest}`);
      return dest;
    } catch (error) {
      this.logger.error(`Failed to backup config: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 从备份恢复配置文件
   * @param backupPath 备份文件路径
   */
  async restoreConfig(backupPath: string): Promise<void> {
    try {
      await fs.copyFile(backupPath, this.configPath);
      await this.enforceSecurePermissions();
      await this.updateConfigHash();
      this.logger.info(`Config restored from ${backupPath}`);
    } catch (error) {
      this.logger.error(`Failed to restore config: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 获取已存储的哈希值
   * @param filePath 可选的文件路径
   */
  getStoredHash(filePath?: string): string | undefined {
    const targetPath = filePath || this.configPath;
    return this.hashStore.get(targetPath);
  }

  /**
   * 清除所有哈希值
   */
  clearHashes(): void {
    this.hashStore.clear();
    void fs.unlink(this.getHashFilePath()).catch(error => {
      this.logger.warn(`Failed to remove config hash file: ${(error as Error).message}`);
    });
  }
}

/**
 * 创建 ConfigSecurity 实例的工厂函数
 */
export function createConfigSecurity(options: ConfigSecurityCreateOptions): ConfigSecurity {
  return new ConfigSecurity(options);
}
