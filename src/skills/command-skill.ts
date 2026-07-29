import type { Skill, SkillContext, SkillResult, SkillVersion, SkillVersionHistory } from './types.js';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import { spawnSync } from 'node:child_process';
import { ShellTokenizer } from '../utils/shell-tokenizer.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';

/**
 * Definition of a core skill with its keywords
 * @property name - The skill name
 * @property description - Description of the skill
 * @property keywords - Array of keywords for matching
 */
interface CoreSkillDefinition {
  name: string;
  description: string;
  keywords: string[];
}

/**
 * List of core skills available in the command skill
 */
const CORE_SKILLS: CoreSkillDefinition[] = [
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

/**
 * Default search paths for file operations
 * @param environment - 环境服务，用于解析 VectaHub 主目录
 * @returns 默认搜索路径数组
 */
function createDefaultSearchPaths(environment: IEnvironmentService): string[] {
  const home = environment.getHomePath();
  return [
    home,
    join(home, 'Documents'),
    join(home, 'Desktop'),
  ];
}

/**
 * Maximum number of file search results to return
 */
const MAX_RESULTS = 100;

/**
 * Represents a matched file with relevance score
 * @property path - Full path to the file
 * @property name - File name
 * @property relevance - Relevance score between 0 and 1
 * @property snippet - Preview snippet of the file content
 */
export interface FileMatch {
  path: string;
  name: string;
  relevance: number;
  snippet: string;
}

/**
 * Command Skill interface extending the base Skill with additional methods
 * @property searchFiles - Searches for files matching a query
 * @property readFile - Reads a file's content
 * @property listFiles - Lists files in a directory
 * @property executeCommand - Executes a shell command
 * @property getVersionHistory - Gets the version history
 * @property rollbackToVersion - Rolls back to a specific version
 * @property getCurrentVersion - Gets the current version
 */
export interface CommandSkill extends Skill {
  searchFiles(query: string, paths?: string[]): FileMatch[];
  readFile(path: string): string;
  listFiles(dirPath: string): string[];
  executeCommand(command: string): string;
  getVersionHistory(): SkillVersionHistory[];
  rollbackToVersion(version: string): boolean;
  getCurrentVersion(): SkillVersion;
}

/**
 * Result of a core skill detection
 * @property name - The skill name
 * @property score - Match score
 */
interface CoreSkillMatch {
  name: string;
  score: number;
}

/**
 * Intent analysis result
 * @property type - The intent type
 * @property command - Extracted command (for execute intent)
 * @property query - Extracted query (for query intent)
 * @property confidence - Confidence score
 * @property needsClarification - Whether clarification is needed
 * @property clarificationMessage - Message for clarification
 * @property suggestions - Array of suggestions
 */
interface IntentAnalysisResult {
  type: 'execute' | 'query' | 'clarify' | 'fallback';
  command?: string;
  query?: string;
  confidence: number;
  needsClarification: boolean;
  clarificationMessage?: string;
  suggestions?: string[];
}

/**
 * Command execution result
 * @property output - The command output
 * @property success - Whether execution succeeded
 */
interface CommandExecutionResult {
  output: string;
  success: boolean;
}

/**
 * Fallback matching result
 * @property success - Whether matching succeeded
 * @property data - Optional match data
 * @property confidence - Optional confidence score
 */
interface FallbackMatchResult {
  success: boolean;
  data?: { type: string };
  confidence?: number;
}

/**
 * Parses a semantic version string into its components
 * @param version - The version string to parse (e.g., "2.0.0")
 * @returns SkillVersion object
 * @throws Error if version string is invalid
 */
function parseVersion(version: string): SkillVersion {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+(.+))?$/);
  if (!match) {
    throw new Error(`Invalid version string: ${version}`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
    buildMetadata: match[5]
  };
}

/**
 * Compares two version objects
 * @param v1 - First version
 * @param v2 - Second version
 * @returns Negative if v1 < v2, positive if v1 > v2, 0 if equal
 */
function compareVersions(v1: SkillVersion, v2: SkillVersion): number {
  if (v1.major !== v2.major) return v1.major - v2.major;
  if (v1.minor !== v2.minor) return v1.minor - v2.minor;
  if (v1.patch !== v2.patch) return v1.patch - v2.patch;
  if (v1.prerelease && !v2.prerelease) return -1;
  if (!v1.prerelease && v2.prerelease) return 1;
  if (v1.prerelease && v2.prerelease) return v1.prerelease.localeCompare(v2.prerelease);
  return 0;
}

/**
 * Creates a CommandSkill instance that handles file operations, commands, and intent analysis
 * Provides version management capabilities for skill upgrades and rollbacks
 * @param environment - 环境服务，用于解析默认搜索路径
 * @returns A new CommandSkill instance
 */
export function createCommandSkill(environment: IEnvironmentService): CommandSkill {
  const defaultSearchPaths = createDefaultSearchPaths(environment);
  const versionHistory: SkillVersionHistory[] = [
    {
      version: '2.0.0',
      timestamp: new Date(),
      changes: 'Initial version with file operations, git commands, code generation, and security scanning',
      rollbackAvailable: false
    }
  ];

  let currentVersion: SkillVersion = parseVersion('2.0.0');

  return {
    id: 'vectahub.file-ops',
    name: 'File Operations',
    version: '2.0.0',
    description: 'Core command skill that handles file operations, git commands, code generation, and system commands',
    tags: ['file', 'git', 'command', 'system'],

    /**
     * Determines if this skill can handle the given context
     * @param context - The skill context
     * @returns Always returns true as this is a fallback skill
     */
    async canHandle(_context: SkillContext): Promise<boolean> {
      return true;
    },

    /**
     * Executes the skill with the given input
     * @param input - The user input to process
     * @param _context - The skill context
     * @returns A promise resolving to a SkillResult
     */
    async execute(input: string, _context: SkillContext): Promise<SkillResult> {
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
          const result = executeCommandInternal(intent.command!);
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
        return {
          success: true,
          data: {
            type: 'query',
            query: intent.query,
            results: [],
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
          suggestions: [],
        },
        confidence: 0.3,
      };
    },

    /**
     * Searches for files matching the query in the given paths
     * @param query - The search query
     * @param paths - Optional paths to search in (defaults to createDefaultSearchPaths)
     * @returns Array of FileMatch results
     */
    searchFiles(query: string, paths: string[] = defaultSearchPaths): FileMatch[] {
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

    /**
     * Reads a file's content
     * @param path - The path to the file
     * @returns The file content as a string
     * @throws Error if file cannot be read
     */
    readFile(path: string): string {
      return readFileSync(path, 'utf-8');
    },

    /**
     * Lists files in a directory
     * @param dirPath - The directory path
     * @returns Array of file names
     * @throws Error if directory cannot be read
     */
    listFiles(dirPath: string): string[] {
      return readdirSync(dirPath);
    },

    /**
     * Executes a shell command
     * @param command - The command to execute
     * @returns The command output
     * @throws Error if command execution fails
     */
    executeCommand(command: string): string {
      return executeCommandInternal(command).output;
    },

    /**
     * Gets the version history of this skill
     * @returns Array of SkillVersionHistory entries
     */
    getVersionHistory(): SkillVersionHistory[] {
      return [...versionHistory];
    },

    /**
     * Rolls back to a specific version
     * @param version - The version to roll back to
     * @returns True if rollback was successful, false otherwise
     */
    rollbackToVersion(version: string): boolean {
      const targetVersion = parseVersion(version);
      const historyEntry = versionHistory.find(h => h.version === version);

      if (!historyEntry || !historyEntry.rollbackAvailable) {
        return false;
      }

      if (compareVersions(targetVersion, currentVersion) >= 0) {
        return false;
      }

      currentVersion = targetVersion;
      return true;
    },

    /**
     * Gets the current version of this skill
     * @returns SkillVersion object representing the current version
     */
    getCurrentVersion(): SkillVersion {
      return { ...currentVersion };
    },
  };
}

/**
 * Detects core skills based on input keywords
 * @param input - The user input
 * @returns Array of matched skills with scores
 */
function detectCoreSkills(input: string): CoreSkillMatch[] {
  const lowerInput = input.toLowerCase();
  return CORE_SKILLS
    .map(skill => ({
      name: skill.name,
      score: skill.keywords.filter(kw => lowerInput.includes(kw)).length / skill.keywords.length,
    }))
    .filter(skill => skill.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Analyzes the user intent from input
 * @param input - The user input
 * @returns Intent analysis result
 */
async function analyzeIntent(input: string): Promise<IntentAnalysisResult> {
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
      suggestions: [],
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

/**
 * Extracts a command from user input
 * @param input - The user input
 * @returns The extracted command
 */
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

/**
 * Extracts a query from user input
 * @param input - The user input
 * @returns The extracted query
 */
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

/**
 * Calculates relevance score between a query and filename
 * @param query - The search query
 * @param filename - The filename to match against
 * @returns Relevance score between 0 and 1
 */
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

/**
 * Reads a snippet from a file
 * @param filePath - The path to the file
 * @param maxLines - Maximum number of lines to read (default: 5)
 * @returns The file snippet or empty string if error
 */
function readFileSnippet(filePath: string, maxLines = 5): string {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return content.split('\n').slice(0, maxLines).join('\n');
  } catch {
    return '';
  }
}

/**
 * Executes a command internally (renamed to avoid name conflict with skill method)
 * @param command - The command to execute
 * @returns Command execution result
 */
function executeCommandInternal(command: string): CommandExecutionResult {
  const tokens = ShellTokenizer.tokenize(command);

  if (tokens.length === 0) {
    return { output: '', success: false };
  }

  if (tokens.length > 1) {
    return {
      output: 'Error: multi-command pipelines are not supported in shell:false mode',
      success: false,
    };
  }

  const result = spawnSync(tokens[0].cli, tokens[0].args, {
    shell: false,
    timeout: 30000,
    encoding: 'utf-8',
  });

  const output = (result.stdout ?? '') + (result.stderr ?? '');
  if (result.status === 0) {
    return { output, success: true };
  }
  throw new Error(`Command failed with exit code ${result.status}: ${output}`);
}

/**
 * Falls back to keyword matching for intent detection
 * @param input - The user input
 * @returns Fallback match result
 */
function fallbackToKeywordMatching(input: string): FallbackMatchResult {
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
