import { Command } from 'commander';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

interface ModuleConfig {
  name: string;
  files: { path: string; content: string }[];
  description: string;
  designDoc: string;
}

const MODULE_CONFIGS: Record<string, ModuleConfig> = {
  nl: {
    name: 'nl',
    description: 'Natural Language Parser',
    designDoc: 'docs/design/04_nl_parser_skill_design.md',
    files: [
      {
        path: 'src/nl/parser.ts',
        content: `export interface NLParser {
  parse(input: string): IntentMatch;
  parseToTaskList(input: string): ParseResult;
  addPattern(intent: string, keywords: string[], weight?: number): void;
}

export function createNLParser(): NLParser {
  throw new Error('Not implemented');
}`
      },
      {
        path: 'src/nl/intent-matcher.ts',
        content: `export interface IntentMatcher {
  match(input: string): IntentMatch;
  registerPattern(pattern: IntentPattern): void;
  getPatterns(): IntentPattern[];
}

export function createIntentMatcher(patterns: IntentPattern[]): IntentMatcher {
  throw new Error('Not implemented');
}`
      },
      {
        path: 'src/nl/templates/.gitkeep',
        content: ''
      }
    ]
  },
  workflow: {
    name: 'workflow',
    description: 'Workflow Engine',
    designDoc: 'docs/design/06_workflow_engine_design.md',
    files: [
      {
        path: 'src/workflow/engine.ts',
        content: `export interface WorkflowEngine {
  createWorkflow(name: string, steps: Step[]): Workflow;
  execute(workflow: Workflow, options?: ExecuteOptions): Promise<ExecutionRecord>;
  getWorkflow(id: string): Workflow | undefined;
  listWorkflows(): Workflow[];
}

export function createWorkflowEngine(): WorkflowEngine {
  throw new Error('Not implemented');
}`
      }
    ]
  },
  executor: {
    name: 'executor',
    description: 'Step Executor',
    designDoc: 'docs/design/06_workflow_engine_design.md',
    files: [
      {
        path: 'src/workflow/executor.ts',
        content: `export interface Executor {
  exec(cli: string, args: string[], options: ExecutorOptions): Promise<CLIResult>;
  execute(step: Step, options?: ExecutorOptions): Promise<ExecutionResult>;
  executeWorkflow(steps: Step[], options?: ExecutorOptions): Promise<ExecutionResult[]>;
  validateStep(step: Step): { valid: boolean; errors: string[] };
}

export function createExecutor(): Executor {
  throw new Error('Not implemented');
}`
      }
    ]
  },
  storage: {
    name: 'storage',
    description: 'Storage Module',
    designDoc: 'docs/design/06_workflow_engine_design.md',
    files: [
      {
        path: 'src/workflow/storage.ts',
        content: `export interface Storage {
  save(key: string, value: unknown): Promise<void>;
  get(key: string): Promise<unknown | undefined>;
  list(prefix?: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

export function createStorage(): Storage {
  throw new Error('Not implemented');
}`
      }
    ]
  },
  sandbox: {
    name: 'sandbox',
    description: 'Sandbox Detector',
    designDoc: 'docs/design/02_sandbox_design.md',
    files: [
      {
        path: 'src/sandbox/detector.ts',
        content: `export interface Detector {
  detect(command: string, args: string[]): CommandDetection;
  isDangerous(command: string, args: string[]): boolean;
}

export function createDetector(): Detector {
  throw new Error('Not implemented');
}`
      },
      {
        path: 'src/sandbox/sandbox.ts',
        content: `export interface Sandbox {
  execute(command: string, args: string[], mode: SandboxMode): Promise<ExecutionResult>;
}

export function createSandbox(): Sandbox {
  throw new Error('Not implemented');
}`
      }
    ]
  },
  utils: {
    name: 'utils',
    description: 'Utility Functions',
    designDoc: 'docs/design/08_dev_command_design.md',
    files: [
      {
        path: 'src/utils/logger.ts',
        content: `export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export function createLogger(): Logger {
  throw new Error('Not implemented');
}`
      },
      {
        path: 'src/utils/config.ts',
        content: `export interface Config {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  load(): void;
  save(): void;
}

export function createConfig(): Config {
  throw new Error('Not implemented');
}`
      }
    ]
  },
  cli: {
    name: 'cli',
    description: 'CLI Entry',
    designDoc: 'docs/design/03_ai_cli_framework_design.md',
    files: [
      {
        path: 'src/cli.ts',
        content: `#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('vectahub')
  .description('VectaHub - Natural Language Workflow Engine')
  .version('2.1.0');

program.parse();`
      }
    ]
  },
  types: {
    name: 'types',
    description: 'Type Definitions',
    designDoc: 'docs/design/07_module_design.md',
    files: [
      {
        path: 'src/types/index.ts',
        content: `export type IntentName = 'IMAGE_COMPRESS' | 'FILE_FIND' | 'BACKUP' | 'CI_PIPELINE' | 'BATCH_RENAME' | 'GIT_WORKFLOW' | 'UNKNOWN';

export interface IntentMatch {
  intent: IntentName;
  confidence: number;
  params: Record<string, unknown>;
}

export type StepType = 'exec' | 'for_each' | 'if' | 'parallel';

export interface Step {
  id: string;
  type: StepType;
  cli?: string;
  args?: string[];
  body?: Step[];
  condition?: string;
  items?: string;
  outputVar?: string;
}`
      }
    ]
  }
};

export const moduleCmd = new Command('module')
  .description('Generate module template')
  .argument('<module-name>', 'Name of the module to generate')
  .option('--agent <name>', 'Agent assigned to this module')
  .action(async (moduleName: string, options) => {
    const config = MODULE_CONFIGS[moduleName];

    if (!config) {
      console.error(`Unknown module: ${moduleName}`);
      console.log(`Available modules: ${Object.keys(MODULE_CONFIGS).join(', ')}`);
      process.exit(1);
    }

    console.log(`Generating module: ${moduleName}`);

    for (const file of config.files) {
      const filePath = join(process.cwd(), file.path);
      const dir = dirname(filePath);

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      if (!existsSync(filePath)) {
        writeFileSync(filePath, file.content);
        console.log(`  Created: ${file.path}`);
      } else {
        console.log(`  Skipped (exists): ${file.path}`);
      }
    }

    console.log(`Module "${moduleName}" template generated successfully.`);
  });