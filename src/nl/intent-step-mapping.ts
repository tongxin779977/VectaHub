import type { Step } from '../types/index.js';

export interface IntentStepMapping {
  type: 'exec';
  cli: string;
  args: string[];
  required?: string[];
}

export interface IntentStepMapper {
  toStep(intent: string, params: Record<string, unknown> | null | undefined, stepId?: string): Step;
  hasIntent(intent: string): boolean;
  getRegisteredIntents(): string[];
  registerMapping(intent: string, mapping: IntentStepMapping): void;
}

const ALLOWED_CLIS = new Set([
  'git', 'npm', 'node', 'yarn', 'npx', 'echo', 'ls', 'pwd',
  'cat', 'grep', 'find', 'head', 'tail', 'wc', 'sort',
  'vectahub',
]);

const BUILT_IN_MAPPINGS: Record<string, IntentStepMapping> = {
  git_commit: {
    type: 'exec',
    cli: 'git',
    args: ['commit', '-m', '{{message}}'],
    required: ['message'],
  },
  git_push: {
    type: 'exec',
    cli: 'git',
    args: ['push', '{{remote}}', '{{branch}}'],
    required: ['remote', 'branch'],
  },
  git_pull: {
    type: 'exec',
    cli: 'git',
    args: ['pull', '{{remote}}', '{{branch}}'],
    required: ['remote', 'branch'],
  },
  git_branch: {
    type: 'exec',
    cli: 'git',
    args: ['branch', '{{branch}}'],
    required: ['branch'],
  },
  git_merge: {
    type: 'exec',
    cli: 'git',
    args: ['merge', '{{branch}}'],
    required: ['branch'],
  },
  tool_run: {
    type: 'exec',
    cli: '{{toolName}}',
    args: ['{{args}}'],
    required: ['toolName'],
  },
};

function renderArgs(templateArgs: string[], params: Record<string, unknown>): string[] {
  return templateArgs.map(arg => {
    const rendered = arg.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = params[key];
      if (value === undefined || value === null) return '';
      return String(value);
    });
    return rendered;
  }).filter(arg => arg !== '');
}

function validateCLI(cli: string): void {
  if (!ALLOWED_CLIS.has(cli)) {
    throw new Error(`CLI "${cli}" is not in the allowed list`);
  }
}

function validateRequiredParams(required: string[], params: Record<string, unknown>): void {
  const missing = required.filter(key => {
    const value = params[key];
    return value === undefined || value === null || value === '';
  });
  if (missing.length > 0) {
    throw new Error(`Missing required parameters: ${missing.join(', ')}`);
  }
}

export function createIntentStepMapper(
  customMappings?: Record<string, IntentStepMapping>,
): IntentStepMapper {
  const mappings: Record<string, IntentStepMapping> = {
    ...BUILT_IN_MAPPINGS,
    ...customMappings,
  };

  function toStep(intent: string, params: Record<string, unknown> | null | undefined, stepId?: string): Step {
    const safeParams = params ?? {};
    const mapping = mappings[intent];
    if (!mapping) {
      throw new Error(`Unknown intent: "${intent}". No mapping found.`);
    }

    if (mapping.required && mapping.required.length > 0) {
      validateRequiredParams(mapping.required, safeParams);
    }

    const renderedCLI = renderArgs([mapping.cli], safeParams)[0];
    validateCLI(renderedCLI);

    const renderedArgs = renderArgs(mapping.args, safeParams);

    return {
      id: stepId ?? `step_${intent}`,
      type: mapping.type,
      cli: renderedCLI,
      args: renderedArgs,
    };
  }

  function hasIntent(intent: string): boolean {
    return intent in mappings;
  }

  function getRegisteredIntents(): string[] {
    return Object.keys(mappings);
  }

  function registerMapping(intent: string, mapping: IntentStepMapping): void {
    validateCLI(mapping.cli);
    mappings[intent] = mapping;
  }

  return {
    toStep,
    hasIntent,
    getRegisteredIntents,
    registerMapping,
  };
}
