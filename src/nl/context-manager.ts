import type { IntentName } from '../types/index.js';
import type { ExtractedParams } from './param-extractor.js';

export interface ConversationContext {
  sessionId: string;
  history: ConversationTurn[];
  currentIntent?: IntentName;
  currentParams: ExtractedParams;
  referencedEntities: ReferencedEntity[];
  projectContext?: ProjectContext;
  lastUpdated: number;
}

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  intent?: IntentName;
  params?: ExtractedParams;
  timestamp: number;
}

export interface ReferencedEntity {
  type: 'file' | 'directory' | 'command' | 'package' | 'branch' | 'other';
  value: string;
  aliases: string[];
  resolved?: string;
  turnIndex: number;
}

export interface ProjectContext {
  root: string;
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'cargo' | 'go';
  framework?: string;
  language: string;
  detectedTools: string[];
}

export interface ContextManager {
  createSession(sessionId: string): ConversationContext;
  getSession(sessionId: string): ConversationContext | undefined;
  deleteSession(sessionId: string): void;
  addTurn(sessionId: string, turn: Omit<ConversationTurn, 'id' | 'timestamp'>): void;
  resolveReference(sessionId: string, reference: string): string | undefined;
  applyContext(sessionId: string, input: string): { enrichedInput: string; context: ConversationContext };
  getProjectContext(sessionId: string): ProjectContext | undefined;
  setProjectContext(sessionId: string, context: ProjectContext): void;
}

const REFERRER_PATTERNS = {
  file: [
    /^(?:这个|那个|此|the|this|that)\s+(?:文件|file|代码|code|组件|component)/i,
    /^(?:它|它|it)/i,
    /^(?:刚才|上面|上面说)/i,
  ],
  directory: [
    /^(?:这个|那个|此|the|this|that)\s+(?:目录|文件夹|directory|folder)/i,
    /^(?:当前|现在|current|present)\s+(?:目录|位置)/i,
  ],
  command: [
    /^(?:那个|这个|the|this)\s+(?:命令|command)/i,
    /^(?:它|它|it)/i,
    /^(?:刚才|上面|上面说)\s+(?:命令|操作)/i,
  ],
  package: [
    /^(?:那个|这个|the|this)\s+(?:包|package|依赖|library)/i,
  ],
  branch: [
    /^(?:那个|这个|the|this)\s+(?:分支|branch)/i,
  ],
};

function createContextManager(): ContextManager {
  const sessions = new Map<string, ConversationContext>();

  function createSession(sessionId: string): ConversationContext {
    const context: ConversationContext = {
      sessionId,
      history: [],
      currentParams: {},
      referencedEntities: [],
      lastUpdated: Date.now(),
    };
    sessions.set(sessionId, context);
    return context;
  }

  function getSession(sessionId: string): ConversationContext | undefined {
    return sessions.get(sessionId);
  }

  function deleteSession(sessionId: string): void {
    sessions.delete(sessionId);
  }

  function addTurn(sessionId: string, turn: Omit<ConversationTurn, 'id' | 'timestamp'>): void {
    const context = sessions.get(sessionId);
    if (!context) {
      createSession(sessionId);
    }

    const newTurn: ConversationTurn = {
      ...turn,
      id: `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };

    const ctx = sessions.get(sessionId)!;
    ctx.history.push(newTurn);
    ctx.lastUpdated = Date.now();

    if (turn.intent) {
      ctx.currentIntent = turn.intent;
    }
    if (turn.params) {
      ctx.currentParams = { ...ctx.currentParams, ...turn.params };
    }

    if (turn.content && turn.role === 'user') {
      extractAndStoreEntities(ctx, turn.content);
    }
  }

  function extractAndStoreEntities(context: ConversationContext, content: string): void {
    const filePattern = /([a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx|py|go|rs|json|md|yml|yaml|txt))/gi;
    const dirPattern = /([a-zA-Z0-9_\-./]+(?:\/[a-zA-Z0-9_\-./]+)+)/gi;
    const commandPattern = /(npm|yarn|pnpm|git|docker|python|pip|cargo|go|make)/gi;
    const packagePattern = /([@\w\-\/]+)@\d+\.\d+\.\d+/gi;
    const branchPattern = /(?:分支|branch)\s+([a-zA-Z0-9_\-\/]+)/gi;

    let match;

    while ((match = filePattern.exec(content)) !== null) {
      context.referencedEntities.push({
        type: 'file',
        value: match[1],
        aliases: [match[1], extractFilename(match[1])],
        turnIndex: context.history.length,
      });
    }

    while ((match = dirPattern.exec(content)) !== null) {
      if (!content.includes('.', match.index)) {
        context.referencedEntities.push({
          type: 'directory',
          value: match[1],
          aliases: [match[1], extractDirname(match[1])],
          turnIndex: context.history.length,
        });
      }
    }

    while ((match = commandPattern.exec(content)) !== null) {
      context.referencedEntities.push({
        type: 'command',
        value: match[1],
        aliases: [match[1]],
        turnIndex: context.history.length,
      });
    }

    while ((match = packagePattern.exec(content)) !== null) {
      context.referencedEntities.push({
        type: 'package',
        value: match[1],
        aliases: [match[1]],
        turnIndex: context.history.length,
      });
    }

    while ((match = branchPattern.exec(content)) !== null) {
      context.referencedEntities.push({
        type: 'branch',
        value: match[1],
        aliases: [match[1]],
        turnIndex: context.history.length,
      });
    }
  }

  function extractFilename(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1];
  }

  function extractDirname(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1] || parts[parts.length - 2] || path;
  }

  function resolveReference(sessionId: string, reference: string): string | undefined {
    const context = sessions.get(sessionId);
    if (!context) {
      return undefined;
    }

    const lowerRef = reference.toLowerCase().trim();

    for (const patternList of Object.values(REFERRER_PATTERNS)) {
      for (const pattern of patternList) {
        if (pattern.test(reference)) {
          const recentEntities = context.referencedEntities
            .filter(e => e.turnIndex > context.history.length - 3)
            .reverse();

          if (recentEntities.length > 0) {
            return recentEntities[0].value;
          }
        }
      }
    }

    for (const entity of context.referencedEntities.reverse()) {
      if (entity.aliases.some(alias => alias.toLowerCase().includes(lowerRef))) {
        return entity.value;
      }
    }

    return undefined;
  }

  function applyContext(sessionId: string, input: string): { enrichedInput: string; context: ConversationContext } {
    let enrichedInput = input;
    const context = sessions.get(sessionId);

    if (!context) {
      return { enrichedInput: input, context: createSession(sessionId) };
    }

    for (const patternList of Object.values(REFERRER_PATTERNS)) {
      for (const pattern of patternList) {
        if (pattern.test(input)) {
          const resolved = resolveReference(sessionId, input);
          if (resolved) {
            enrichedInput = input.replace(pattern, resolved);
            break;
          }
        }
      }
    }

    return { enrichedInput, context };
  }

  function getProjectContext(sessionId: string): ProjectContext | undefined {
    const context = sessions.get(sessionId);
    return context?.projectContext;
  }

  function setProjectContext(sessionId: string, projectContext: ProjectContext): void {
    const context = sessions.get(sessionId);
    if (context) {
      context.projectContext = projectContext;
      context.lastUpdated = Date.now();
    }
  }

  return {
    createSession,
    getSession,
    deleteSession,
    addTurn,
    resolveReference,
    applyContext,
    getProjectContext,
    setProjectContext,
  };
}

export const contextManager = createContextManager();

export function createContextAwareParser(
  parser: {
    parse(input: string): { intent: IntentName; confidence: number; params: Record<string, unknown> };
  },
  ctxManager: ContextManager = contextManager
) {
  return {
    parse(input: string, sessionId: string): { intent: IntentName; confidence: number; params: Record<string, unknown> } {
      const { enrichedInput, context } = ctxManager.applyContext(sessionId, input);

      const result = parser.parse(enrichedInput);

      ctxManager.addTurn(sessionId, {
        role: 'user',
        content: input,
        intent: result.intent,
        params: result.params as ExtractedParams,
      });

      return result;
    },
  };
}
