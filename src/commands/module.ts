import { Command } from 'commander';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';

interface ModuleContractReference {
  name: string;
  description: string;
  designDoc: string;
}

const MODULE_CONTRACT_REFERENCES: Record<string, ModuleContractReference> = {
  nl: {
    name: 'nl',
    description: 'Natural Language Intent Matching',
    designDoc: 'docs/design/04_nl_parser_skill_design.md',
  },
  workflow: {
    name: 'workflow',
    description: 'Workflow Engine',
    designDoc: 'docs/design/06_workflow_engine_design.md',
  },
  executor: {
    name: 'executor',
    description: 'Step Executor',
    designDoc: 'docs/design/06_workflow_engine_design.md',
  },
  storage: {
    name: 'storage',
    description: 'Storage Module',
    designDoc: 'docs/design/06_workflow_engine_design.md',
  },
  sandbox: {
    name: 'sandbox',
    description: 'Sandbox Detector',
    designDoc: 'docs/design/02_sandbox_design.md',
  },
  utils: {
    name: 'utils',
    description: 'Utility Functions',
    designDoc: 'docs/design/08_dev_command_design.md',
  },
  cli: {
    name: 'cli',
    description: 'CLI Entry',
    designDoc: 'docs/design/03_ai_cli_framework_design.md',
  },
  types: {
    name: 'types',
    description: 'Type Definitions',
    designDoc: 'docs/design/07_module_design.md',
  },
};

function listAvailableModules(): string {
  return Object.keys(MODULE_CONTRACT_REFERENCES).join(', ');
}

/**
 * 模块命令（旧版）
 * 用于检查模块合同（当前已禁用）
 */
export const moduleCmd = new Command('module')
  .description('Legacy module scaffold command (currently disabled)')
  .argument('<module-name>', 'Name of the module contract to inspect')
  .option('--agent <name>', 'Agent assigned to this module')
  .action(async (moduleName: string, _options) => {
    const contract = MODULE_CONTRACT_REFERENCES[moduleName];

    if (!contract) {
      throw new VectaHubError(
        `Unknown module: ${moduleName}. Available modules: ${listAvailableModules()}`,
        ErrorType.RUNTIME,
      );
    }

    throw new VectaHubError(
      `Module scaffolding for "${moduleName}" is disabled until the committed templates are aligned with current contracts. Refer to ${contract.designDoc}.`,
      ErrorType.RUNTIME,
    );
  });
