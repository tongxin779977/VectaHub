import type { Config } from '../config/index.js';

/**
 * 配置服务接口
 */
export interface IConfigService {
  /**
   * 获取当前配置
   */
  getConfig(): Config;

  /**
   * 重新加载配置
   */
  reloadConfig(): Config;

  /**
   * 保存配置
   */
  saveConfig(config: Config): void;

  /**
   * 更新配置（增量更新）
   */
  updateConfig(patch: Partial<Config>): Config;

  /**
   * 获取默认配置
   */
  getDefaultConfig(): Config;
}
