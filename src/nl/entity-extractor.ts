import type { EntityExtractor, ExtractedEntity, EntityType } from '../types/index.js';

const ENTITY_PATTERNS: Record<EntityType, RegExp[]> = {
  FILE_PATH: [
    /(\/[\w\-\.\/]+\.(js|jsx|ts|tsx|py|go|rs|json|md|yml|yaml|css|html))/g,
    /([\w\-\.\/]+\.(js|jsx|ts|tsx|py|go|rs|json|md|yml|yaml|css|html))/g,
  ],
  CLI_TOOL: [
    /\b(npm|yarn|pnpm|git|docker|python|pip|python3|cargo|go|make|cmake|node|tsx|tsc|vitest|jest)\b/g,
  ],
  PACKAGE_NAME: [
    /(?:\binstall\b|\badd\b|\brequire\b|\bimport\b)\s+([@\w\-\/]+)/g,
    /([\w\-\/]+)@\d+\.\d+\.\d+/g,
  ],
  FUNCTION_NAME: [
    /function\s+(\w+)/g,
    /const\s+(\w+)\s*=/g,
    /(\w+)\s*\(/g,
  ],
  BRANCH_NAME: [
    /(?:branch|checkout)\s+([\w\-\/]+)/g,
    /(?:from|into)\s+([\w\-\/]+)/g,
  ],
  ENV: [
    /\b(prod|production|staging|dev|development|test)\b/gi,
  ],
  OPTIONS: [
    /--[\w\-]+/g,
    /-[\w]/g,
  ],
};

export function createEntityExtractor(): EntityExtractor {
  return {
    extract(input: string): ExtractedEntity[] {
      const entities: ExtractedEntity[] = [];

      for (const [type, patterns] of Object.entries(ENTITY_PATTERNS) as [EntityType, RegExp[]][]) {
        for (const pattern of patterns) {
          const regex = new RegExp(pattern.source, pattern.flags);
          let match;

          while ((match = regex.exec(input)) !== null) {
            const value = match[1] || match[0];
            if (!entities.some(e => e.value === value && e.type === type)) {
              entities.push({
                type,
                value,
                startIndex: match.index,
                endIndex: match.index + match[0].length,
              });
            }
          }
        }
      }

      return entities.sort((a, b) => a.startIndex - b.startIndex);
    },
  };
}