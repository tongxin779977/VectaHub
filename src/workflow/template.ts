import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse as parseYAML } from 'yaml';
import type { Step, Workflow } from '../types/index.js';

export interface TemplateParameter {
  name: string;
  description: string;
  required: boolean;
  default?: string;
}

export interface WorkflowTemplate {
  name: string;
  description: string;
  category: string;
  tags: string[];
  parameters?: TemplateParameter[];
  steps: Step[];
}

export function loadTemplate(path: string): WorkflowTemplate {
  const content = readFileSync(path, 'utf-8');
  const parsed = parseYAML(content) as Record<string, unknown>;

  return {
    name: String(parsed.name || ''),
    description: String(parsed.description || ''),
    category: String(parsed.category || 'general'),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    parameters: Array.isArray(parsed.parameters)
      ? (parsed.parameters as Record<string, unknown>[]).map(p => ({
          name: String(p.name || ''),
          description: String(p.description || ''),
          required: Boolean(p.required),
          default: p.default !== undefined ? String(p.default) : undefined,
        }))
      : undefined,
    steps: Array.isArray(parsed.steps)
      ? (parsed.steps as Record<string, unknown>[]).map(s => ({
          id: String(s.id || ''),
          type: (s.type as Step['type']) || 'exec',
          cli: s.cli as string | undefined,
          args: Array.isArray(s.args) ? s.args.map(String) : undefined,
          body: undefined as Step[] | undefined,
          condition: s.condition as string | undefined,
          dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn.map(String) : undefined,
          items: s.items as string | undefined,
          outputVar: s.outputVar as string | undefined,
        }))
      : [],
  };
}

export function listTemplates(dir: string, category?: string, tag?: string): WorkflowTemplate[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  } catch {
    return [];
  }

  let templates = files.map(f => loadTemplate(join(dir, f)));

  if (category) {
    templates = templates.filter(t => t.category === category);
  }
  if (tag) {
    templates = templates.filter(t => t.tags.includes(tag));
  }

  return templates;
}

function substituteArgs(args: string[], params: Record<string, string>): string[] {
  return args.map(arg =>
    arg.replace(/\$\{(\w+)\}/g, (_, key) => {
      if (key in params) return params[key];
      return `\${${key}}`;
    })
  );
}

export function instantiateTemplate(path: string, params: Record<string, string>): Workflow {
  const tmpl = loadTemplate(path);

  const resolvedParams: Record<string, string> = {};
  if (tmpl.parameters) {
    for (const p of tmpl.parameters) {
      if (p.name in params) {
        resolvedParams[p.name] = params[p.name];
      } else if (p.default !== undefined) {
        resolvedParams[p.name] = p.default;
      } else if (p.required) {
        throw new Error(`Missing required parameter: ${p.name}`);
      }
    }
  }

  const steps: Step[] = tmpl.steps.map(s => ({
    ...s,
    args: s.args ? substituteArgs(s.args, resolvedParams) : undefined,
  }));

  const timestamp = Date.now();

  return {
    id: `wf_${timestamp}`,
    name: `${tmpl.name}-${timestamp}`,
    mode: 'relaxed',
    steps,
    createdAt: new Date(),
  };
}
