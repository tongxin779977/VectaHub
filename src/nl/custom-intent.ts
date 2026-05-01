import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { IntentPattern } from './intent-matcher.js';

export interface CustomIntent {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  weight: number;
  cli: string[];
  params: Record<string, {
    type: string;
    required: boolean;
    default?: unknown;
    description: string;
  }>;
  steps: {
    type: string;
    cli?: string;
    args?: string[];
    condition?: string;
  }[];
  createdAt: number;
  updatedAt: number;
  author?: string;
  tags?: string[];
}

export interface CustomIntentRegistry {
  register(intent: CustomIntent): void;
  unregister(intentId: string): boolean;
  get(intentId: string): CustomIntent | undefined;
  getByName(name: string): CustomIntent | undefined;
  list(): CustomIntent[];
  update(intentId: string, updates: Partial<CustomIntent>): boolean;
  export(): string;
  import(data: string): number;
  save(): void;
  load(): void;
}

const DEFAULT_INTENT_DIR = join(process.env.HOME || '.', '.vectahub', 'intents');

function createCustomIntentRegistry(): CustomIntentRegistry {
  const intents = new Map<string, CustomIntent>();
  let intentDir = DEFAULT_INTENT_DIR;

  function validateIntent(intent: CustomIntent): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!intent.id || typeof intent.id !== 'string') {
      errors.push('Intent ID is required and must be a string');
    }

    if (!intent.name || typeof intent.name !== 'string') {
      errors.push('Intent name is required and must be a string');
    }

    if (!intent.keywords || !Array.isArray(intent.keywords) || intent.keywords.length === 0) {
      errors.push('At least one keyword is required');
    }

    if (typeof intent.weight !== 'number' || intent.weight < 0 || intent.weight > 1) {
      errors.push('Weight must be a number between 0 and 1');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  function register(intent: CustomIntent): void {
    const validation = validateIntent(intent);
    if (!validation.valid) {
      throw new Error(`Invalid intent: ${validation.errors.join(', ')}`);
    }

    intent.createdAt = intent.createdAt || Date.now();
    intent.updatedAt = Date.now();

    intents.set(intent.id, intent);
  }

  function unregister(intentId: string): boolean {
    return intents.delete(intentId);
  }

  function get(intentId: string): CustomIntent | undefined {
    return intents.get(intentId);
  }

  function getByName(name: string): CustomIntent | undefined {
    for (const intent of intents.values()) {
      if (intent.name === name) {
        return intent;
      }
    }
    return undefined;
  }

  function list(): CustomIntent[] {
    return Array.from(intents.values());
  }

  function update(intentId: string, updates: Partial<CustomIntent>): boolean {
    const existing = intents.get(intentId);
    if (!existing) {
      return false;
    }

    const updated: CustomIntent = {
      ...existing,
      ...updates,
      id: existing.id,
      updatedAt: Date.now(),
    };

    const validation = validateIntent(updated);
    if (!validation.valid) {
      throw new Error(`Invalid intent update: ${validation.errors.join(', ')}`);
    }

    intents.set(intentId, updated);
    return true;
  }

  function export_(): string {
    return JSON.stringify({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      intents: list(),
    }, null, 2);
  }

  function import_(data: string): number {
    const parsed = JSON.parse(data);
    let count = 0;

    if (parsed.intents && Array.isArray(parsed.intents)) {
      for (const intent of parsed.intents) {
        try {
          register(intent as CustomIntent);
          count++;
        } catch (error) {
          console.warn(`Failed to import intent ${intent.id}: ${error}`);
        }
      }
    }

    return count;
  }

  function save(): void {
    if (!existsSync(intentDir)) {
      mkdirSync(intentDir, { recursive: true });
    }

    const filePath = join(intentDir, 'custom-intents.json');
    const data = export_();
    writeFileSync(filePath, data, 'utf-8');
  }

  function load(): void {
    const filePath = join(intentDir, 'custom-intents.json');

    if (!existsSync(filePath)) {
      return;
    }

    try {
      const data = readFileSync(filePath, 'utf-8');
      import_(data);
    } catch (error) {
      console.warn(`Failed to load custom intents: ${error}`);
    }
  }

  return {
    register,
    unregister,
    get,
    getByName,
    list,
    update,
    export: export_,
    import: import_,
    save,
    load,
  };
}

export const customIntentRegistry = createCustomIntentRegistry();

export function createCustomIntentTemplate(): Partial<CustomIntent> {
  return {
    keywords: [],
    weight: 0.8,
    cli: [],
    params: {},
    steps: [],
    tags: [],
  };
}

export function convertToIntentPattern(intent: CustomIntent): IntentPattern {
  return {
    intent: intent.name as any,
    keywords: intent.keywords,
    weight: intent.weight,
  };
}

export interface IntentTemplateManager {
  createFromTemplate(template: string, params: Record<string, unknown>): CustomIntent;
  validateKeywords(keywords: string[]): { valid: boolean; suggestions?: string[] };
  suggestSimilar(intentName: string, threshold?: number): string[];
}

export function createIntentTemplateManager(): IntentTemplateManager {
  return {
    createFromTemplate(template: string, params: Record<string, unknown>): CustomIntent {
      const base = createCustomIntentTemplate();
      return {
        id: params.id as string || `custom_${Date.now()}`,
        name: params.name as string || 'CUSTOM_INTENT',
        description: params.description as string || '',
        keywords: params.keywords as string[] || [],
        weight: params.weight as number || 0.8,
        cli: params.cli as string[] || [],
        params: params.params as Record<string, any> || {},
        steps: params.steps as any[] || [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        author: params.author as string,
        tags: params.tags as string[],
      };
    },

    validateKeywords(keywords: string[]): { valid: boolean; suggestions?: string[] } {
      const valid: string[] = [];
      const suggestions: string[] = [];

      const reservedKeywords = new Set([
        'if', 'else', 'while', 'for', 'function', 'class',
        'export', 'import', 'return', 'break', 'continue',
      ]);

      for (const keyword of keywords) {
        if (keyword.length < 2) {
          suggestions.push(`Keyword '${keyword}' is too short`);
          continue;
        }

        if (reservedKeywords.has(keyword.toLowerCase())) {
          suggestions.push(`Keyword '${keyword}' is a reserved word`);
          continue;
        }

        valid.push(keyword);
      }

      return {
        valid: valid.length > 0 && suggestions.length === 0,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
      };
    },

    suggestSimilar(intentName: string, threshold = 0.6): string[] {
      const allIntents = customIntentRegistry.list();
      const suggestions: { name: string; similarity: number }[] = [];

      const normalizedName = intentName.toLowerCase();

      for (const intent of allIntents) {
        if (intent.id === intentName || intent.name === intentName) {
          continue;
        }

        const similarity = calculateSimilarity(normalizedName, intent.name.toLowerCase());
        if (similarity >= threshold) {
          suggestions.push({ name: intent.name, similarity });
        }
      }

      suggestions.sort((a, b) => b.similarity - a.similarity);
      return suggestions.map(s => s.name);
    },
  };
}

function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[b.length][a.length];
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}

export const intentTemplateManager = createIntentTemplateManager();
