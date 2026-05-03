import { readFileSync } from 'fs';
import { parse as parseYAML } from 'yaml';

export interface CommandTemplateConfig {
  name: string;
  cli: string;
  args: string[];
  params?: Record<string, string>;
}

export interface CommandConfig {
  version: string;
  templates: Record<string, CommandTemplateConfig[]>;
}

export interface SelectionCondition {
  keywords?: string[];
  exclude?: string[];
}

export interface SelectionRule {
  when?: SelectionCondition;
  pick: string | string[];
  override?: { cli: string; args: string[] };
  params?: Record<string, string>;
  default?: boolean;
}

export interface IntentConfig {
  version: string;
  intents: Record<string, {
    taskType: string;
    selection: SelectionRule[];
  }>;
}

export function loadCommandConfig(configPath: string): CommandConfig {
  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = parseYAML(content) as {
      version?: string;
      templates?: Record<string, unknown[]>;
    };
    const templates: Record<string, CommandTemplateConfig[]> = {};

    if (parsed.templates) {
      for (const [taskType, rawTemplates] of Object.entries(parsed.templates)) {
        templates[taskType] = (rawTemplates as Record<string, unknown>[]).map(t => ({
          name: String(t.name || ''),
          cli: String(t.cli || ''),
          args: Array.isArray(t.args) ? t.args.map(String) : [],
          params: t.params as Record<string, string> | undefined,
        }));
      }
    }

    return { version: String(parsed.version || ''), templates };
  } catch {
    return { version: '', templates: {} };
  }
}

export function loadIntentConfig(configPath: string): IntentConfig {
  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = parseYAML(content) as {
      version?: string;
      intents?: Record<string, unknown>;
    };
    const intents: IntentConfig['intents'] = {};

    if (parsed.intents) {
      for (const [intentName, rawIntent] of Object.entries(parsed.intents)) {
        const intent = rawIntent as Record<string, unknown>;
        const rawSelection = intent.selection as Record<string, unknown>[] | undefined;

        intents[intentName] = {
          taskType: String(intent.taskType || ''),
          selection: (rawSelection || []).map(s => ({
            when: s.when as SelectionCondition | undefined,
            pick: s.pick as string | string[],
            override: s.override as { cli: string; args: string[] } | undefined,
            params: s.params as Record<string, string> | undefined,
            default: s.default as boolean | undefined,
          })),
        };
      }
    }

    return { version: String(parsed.version || ''), intents };
  } catch {
    return { version: '', intents: {} };
  }
}

export function createCommandConfigLoader(configDir: string) {
  return {
    loadCommandConfig: () => loadCommandConfig(`${configDir}/templates.yaml`),
    loadIntentConfig: () => loadIntentConfig(`${configDir}/intents.yaml`),
  };
}
