import { getDefaultContext } from '../infrastructure/context.js';
import {
  loadGlobalBlocklist as loadGlobalBlocklistImpl,
  loadGlobalAllowlist as loadGlobalAllowlistImpl,
  loadProjectBlocklist as loadProjectBlocklistImpl,
  loadProjectAllowlist as loadProjectAllowlistImpl,
  ensureConfigDir as ensureConfigDirImpl,
  type CommandRuleLoaderDeps,
} from './loader.js';
import type { CommandRule } from './types.js';

function createCommandRuleLoaderBridgeDeps(): CommandRuleLoaderDeps {
  const context = getDefaultContext();
  return {
    logger: context.logger.getLogger('command-rules-loader'),
    getGlobalConfigPath: () => context.environment.getPath('command-rules'),
  };
}

/**
 * 兼容桥接层：默认 context 仅用于历史命令规则 API。
 * @deprecated 建议使用 command-rules/loader.ts 中的显式 deps API
 */
export function loadGlobalBlocklist(): CommandRule[] {
  return loadGlobalBlocklistImpl(createCommandRuleLoaderBridgeDeps());
}

/**
 * 兼容桥接层：默认 context 仅用于历史命令规则 API。
 * @deprecated 建议使用 command-rules/loader.ts 中的显式 deps API
 */
export function loadGlobalAllowlist(): CommandRule[] {
  return loadGlobalAllowlistImpl(createCommandRuleLoaderBridgeDeps());
}

/**
 * 兼容桥接层：默认 context 仅用于历史命令规则 API。
 * @deprecated 建议使用 command-rules/loader.ts 中的显式 deps API
 */
export function loadProjectBlocklist(projectPath?: string): CommandRule[] {
  return loadProjectBlocklistImpl(projectPath, createCommandRuleLoaderBridgeDeps());
}

/**
 * 兼容桥接层：默认 context 仅用于历史命令规则 API。
 * @deprecated 建议使用 command-rules/loader.ts 中的显式 deps API
 */
export function loadProjectAllowlist(projectPath?: string): CommandRule[] {
  return loadProjectAllowlistImpl(projectPath, createCommandRuleLoaderBridgeDeps());
}

/**
 * 兼容桥接层：默认 context 仅用于历史命令规则 API。
 * @deprecated 建议使用 ensureConfigDir(deps)
 */
export function ensureConfigDir(): string {
  return ensureConfigDirImpl(createCommandRuleLoaderBridgeDeps());
}
