import { getDefaultContext } from '../infrastructure/context.js';
import {
  createConfigDir as createConfigDirImpl,
  initConfigFile as initConfigFileImpl,
  configureLLMProvider as configureLLMProviderImpl,
  isFirstRun as isFirstRunImpl,
  loadConfig as loadConfigImpl,
  saveConfig as saveConfigImpl,
  runFirstRunWizard as runFirstRunWizardImpl,
  type FirstRunWizardRuntimeDeps,
  type VectaHubConfig,
} from './first-run-wizard.js';

function createFirstRunWizardBridgeDeps(): FirstRunWizardRuntimeDeps {
  const context = getDefaultContext();
  return {
    environment: context.environment,
    logger: context.logger.getLogger('setup'),
    output: {
      log: (message: string) => {
        console.log(message);
      },
    },
  };
}

/**
 * 兼容桥接层：默认 context 仅用于历史首次运行 API。
 * @deprecated 建议使用 first-run-wizard.ts 中的显式 deps API
 */
export async function createConfigDir(): Promise<import('./priority-installer.js').StepResult> {
  return createConfigDirImpl(createFirstRunWizardBridgeDeps());
}

/**
 * 兼容桥接层：默认 context 仅用于历史首次运行 API。
 * @deprecated 建议使用 first-run-wizard.ts 中的显式 deps API
 */
export async function initConfigFile(): Promise<import('./priority-installer.js').StepResult> {
  return initConfigFileImpl(createFirstRunWizardBridgeDeps());
}

/**
 * 兼容桥接层：默认 context 仅用于历史首次运行 API。
 * @deprecated 建议使用 first-run-wizard.ts 中的显式 deps API
 */
export async function configureLLMProvider(): Promise<import('./priority-installer.js').StepResult> {
  return configureLLMProviderImpl(createFirstRunWizardBridgeDeps());
}

/**
 * 兼容桥接层：默认 context 仅用于历史首次运行 API。
 * @deprecated 建议使用 isFirstRun(deps)
 */
export function isFirstRun(): boolean {
  return isFirstRunImpl(createFirstRunWizardBridgeDeps());
}

/**
 * 兼容桥接层：默认 context 仅用于历史首次运行 API。
 * @deprecated 建议使用 loadConfig(deps)
 */
export function loadConfig(): VectaHubConfig {
  return loadConfigImpl(createFirstRunWizardBridgeDeps());
}

/**
 * 兼容桥接层：默认 context 仅用于历史首次运行 API。
 * @deprecated 建议使用 saveConfig(config, deps)
 */
export function saveConfig(config: VectaHubConfig): void {
  saveConfigImpl(config, createFirstRunWizardBridgeDeps());
}

/**
 * 兼容桥接层：默认 context 仅用于历史首次运行 API。
 * @deprecated 建议使用 runFirstRunWizard(deps)
 */
export async function runFirstRunWizard(): Promise<boolean> {
  return runFirstRunWizardImpl(createFirstRunWizardBridgeDeps());
}

export {
  closeRl,
  _resetSharedRl,
  setNonInteractiveMode,
  isNonInteractiveMode,
  type LLMProviderConfig,
} from './first-run-wizard.js';
