import type { Skill, SkillContext, SkillResult } from './types.js';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import { execSync } from 'child_process';
import { getVectaHubHome } from '../utils/paths.js';

const CORE_SKILLS = [
  {
    name: 'file-ops',
    description: 'File operations (CRUD, backup, sync)',
    keywords: ['file', 'read', 'write', 'delete', 'copy', 'backup', 'sync', 'scan'],
  },
  {
    name: 'git-workflow',
    description: 'Git operations (commit, push, pull, branch)',
    keywords: ['git', 'commit', 'push', 'pull', 'branch', 'merge', 'checkout'],
  },
  {
    name: 'code-generation',
    description: 'Code generation (boilerplate, patterns, tests)',
    keywords: ['generate', 'create', 'template', 'boilerplate', 'scaffold', 'test'],
  },
  {
    name: 'security-scan',
    description: 'Security scanning and compliance',
    keywords: ['security', 'scan', 'audit', 'vulnerability', 'compliance', 'check'],
  },
];

const DEFAULT_SEARCH_PATHS = [
  getVectaHubHome(),
  join(getVectaHubHome(), 'Documents'),
  join(getVectaHubHome(), 'Desktop'),
];

const MAX_RESULTS = 100;

interface FileMatch {
  path: string;
  name: string;
  relevance: number;
  snippet: string;
}

export interface CommandSkill extends Skill {
  searchFiles(query: string, paths?: string[]): FileMatch[];
  readFile(path: string): string;
  listFiles(dirPath: string): string[];
  executeCommand(command: string): string;
}

export function createCommandSkill(): CommandSkill {
  return {
    id: 'vectahub.file-ops',
    name: 'File Operations',
    version: '2.0.0',
    description: 'Core command skill that handles file operations, git commands, code generation, and system commands',
    tags: ['file', 'git', 'command', 'system'],

    async canHandle(): Promise<boolean> {
      return true;
    },

    async execute(input: string, context: SkillContext): Promise<SkillResult> {
      const skills = detectCoreSkills(input);
      const matchedSkills = skills.map(s => s.name);

      const intent = await analyzeIntent(input);

      if (intent.needsClarification) {
        return {
          success: true,
          data: {
            type: 'question',
            message: intent.clarificationMessage,
            suggestions: intent.suggestions,
            skills: matchedSkills,
          },
          confidence: 0.5,
        };
      }

      if (intent.type === 'execute') {
        try {
          const result = executeCommand(intent.command!);
          return {
            success: true,
            data: {
              type: 'execution',
              command: intent.command,
              result: result.output,
              success: result.success,
              skills: matchedSkills,
            },
            confidence: intent.confidence,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Command execution failed',
            confidence: intent.confidence,
          };
        }
      }

      if (intent.type === 'query') {
        const queryResult = executeQuery(intent.query!);
        return {
          success: true,
          data: {
            type: 'query',
            query: intent.query,
            results: queryResult,
            skills: matchedSkills,
          },
          confidence: intent.confidence,
        };
      }

      return {
        success: true,
        data: {
          type: 'fallback',
          message: 'I can help you with file operations, git commands, code generation, and more.',
          skills: matchedSkills,
          suggestions: generateSuggestions(input),
        },
        confidence: 0.3,
      };
    },

    searchFiles(query: string, paths: string[] = DEFAULT_SEARCH_PATHS): FileMatch[] {
      const results: FileMatch[] = [];

      for (const searchPath of paths) {
        if (!existsSync(searchPath)) continue;

        try {
          const files = readdirSync(searchPath, { recursive: true });
          for (const file of files) {
            if (typeof file !== 'string') continue;
            const filePath = join(searchPath, file);
            if (extname(filePath) === '') continue;

            const relevance = calculateRelevance(query, file);
            if (relevance > 0) {
              results.push({
                path: filePath,
                name: file,
                relevance,
                snippet: readFileSnippet(filePath),
              });
            }
          }
        } catch {
          continue;
        }
      }

      return results
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, MAX_RESULTS);
    },

    readFile(path: string): string {
      return readFileSync(path, 'utf-8');
    },

    listFiles(dirPath: string): string[] {
      return readdirSync(dirPath);
    },

    executeCommand(command: string): string {
      return executeCommand(command).output;
    },
  };
}

function detectCoreSkills(input: string): Array<{ name: string; score: number }> {
  const lowerInput = input.toLowerCase();
  return CORE_SKILLS
    .map(skill => ({
      name: skill.name,
      score: skill.keywords.filter(kw => lowerInput.includes(kw)).length / skill.keywords.length,
    }))
    .filter(skill => skill.score > 0)
    .sort((a, b) => b.score - a.score);
}

async function analyzeIntent(input: string): Promise<{
  type: 'execute' | 'query' | 'clarify' | 'fallback';
  command?: string;
  query?: string;
  confidence: number;
  needsClarification: boolean;
  clarificationMessage?: string;
  suggestions?: string[];
}> {
  if (input.includes('run') || input.includes('execute') || input.includes('执行')) {
    return {
      type: 'execute',
      command: extractCommand(input),
      confidence: 0.8,
      needsClarification: false,
    };
  }

  if (input.includes('list') || input.includes('find') || input.includes('search') || input.includes('列出') || input.includes('查找')) {
    return {
      type: 'query',
      query: extractQuery(input),
      confidence: 0.8,
      needsClarification: false,
    };
  }

  if (input.includes('?') || input.includes('how') || input.includes('what') || input.includes('如何') || input.includes('什么')) {
    const result = fallbackToKeywordMatching(input);
    if (result.success && result.data?.type === 'keyword-match') {
      return {
        type: 'fallback',
        confidence: result.confidence ?? 0.5,
        needsClarification: false,
      };
    }

    return {
      type: 'clarify',
      confidence: 0.5,
      needsClarification: true,
      clarificationMessage: 'I can help you with that. Could you provide more details?',
      suggestions: generateSuggestions(input),
    };
  }

  const result = fallbackToKeywordMatching(input);
  if (result.success && result.data?.type === 'keyword-match') {
    return {
      type: 'fallback',
      confidence: result.confidence ?? 0.5,
      needsClarification: false,
    };
  }

  return {
    type: 'fallback',
    confidence: 0.3,
    needsClarification: false,
  };
}

function extractCommand(input: string): string {
  const commandPatterns = [
    /(?:run|execute|执行)\s+(.+)/i,
    /(?:git)\s+(.+)/i,
    /(?:npm|yarn|pnpm)\s+(.+)/i,
  ];

  for (const pattern of commandPatterns) {
    const match = input.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return input;
}

function extractQuery(input: string): string {
  const queryPatterns = [
    /(?:list|find|search|列出|查找)\s+(.+)/i,
    /(?:show|display|显示)\s+(.+)/i,
  ];

  for (const pattern of queryPatterns) {
    const match = input.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return input;
}

function calculateRelevance(query: string, filename: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerFilename = filename.toLowerCase();

  if (lowerFilename.includes(lowerQuery)) return 1.0;
  if (lowerFilename.includes(lowerQuery.replace(/\s+/g, ''))) return 0.9;

  const queryWords = lowerQuery.split(/\s+/);
  const matchedWords = queryWords.filter(word => lowerFilename.includes(word));
  if (matchedWords.length > 0) {
    return matchedWords.length / queryWords.length * 0.8;
  }

  return 0;
}

function readFileSnippet(filePath: string, maxLines = 5): string {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return content.split('\n').slice(0, maxLines).join('\n');
  } catch {
    return '';
  }
}

function executeCommand(command: string): { output: string; success: boolean } {
  try {
    const output = execSync(command, { encoding: 'utf-8', timeout: 30000 });
    return { output, success: true };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Command failed: ${error.message}`, { cause: error });
    }
    throw error;
  }
}

function executeQuery(query: string): unknown {
  return { query, results: [] };
}

function generateSuggestions(_input: string): string[] {
  return [
    'Try being more specific',
    'Use file operations like "read", "write", "list"',
    'Use git commands like "commit", "push", "pull"',
  ];
}

function fallbackToKeywordMatching(input: string): { success: boolean; data?: { type: string }; confidence?: number } {
  const lowerInput = input.toLowerCase();
  for (const skill of CORE_SKILLS) {
    const matchedKeywords = skill.keywords.filter(kw => lowerInput.includes(kw));
    if (matchedKeywords.length > 0) {
      const confidence = matchedKeywords.length / skill.keywords.length;
      if (confidence >= 0.6) {
        return {
          success: true,
          data: { type: 'keyword-match' },
          confidence,
        };
      }
    }
  }
  return { success: false };
}
