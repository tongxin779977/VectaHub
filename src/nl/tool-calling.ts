import { INTENT_TEMPLATES } from './templates/index.js';
import type { LLMTool, LLMToolCall } from './llm.js';
import type { Step } from '../types/index.js';

export function buildToolsFromTemplates(): LLMTool[] {
  return Object.values(INTENT_TEMPLATES).map(template => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, param] of Object.entries(template.params)) {
      properties[key] = {
        type: 'string', // Simplification, mapping to string for CLI args
        description: param.description
      };
      if (param.required) {
        required.push(key);
      }
    }

    return {
      type: 'function',
      function: {
        name: template.name,
        description: template.description,
        parameters: {
          type: 'object',
          properties,
          required
        }
      }
    };
  });
}

export function convertToolCallToSteps(toolCall: LLMToolCall): { intent: string; params: Record<string, unknown>; steps: Step[] } | null {
  const intentName = toolCall.function.name;
  const template = INTENT_TEMPLATES[intentName];
  if (!template) return null;

  let params: Record<string, unknown> = {};
  try {
    params = JSON.parse(toolCall.function.arguments);
  } catch (e) {
    // fallback to empty params
  }

  // Basic interpolation matching VectaHub's ${param} or ${param:-default} syntax.
  const interpolate = (str: string) => {
    return str.replace(/\$\{([^}]+)\}/g, (match, key: string) => {
      const [paramName, defaultValue] = key.split(':-');
      const val = params[paramName];
      if (val !== undefined && val !== null) {
        return String(val);
      }
      return defaultValue || match; // If not provided, fallback to default or keep original
    });
  };

  const steps: Step[] = template.steps.map((stepTemplate, index) => {
    let cli = stepTemplate.cli || '';
    let args = [...(stepTemplate.args || [])];

    cli = interpolate(cli);
    args = args.map(arg => interpolate(arg)).filter(arg => arg !== '');

    return {
      id: `step_${index + 1}`,
      type: stepTemplate.type as any,
      cli,
      args
    };
  });

  return { intent: intentName, params, steps };
}
