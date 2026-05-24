import type { CommandDiscovery } from '../discovery/command-discovery.js';
import type { KnowledgeBase } from '../knowledge/knowledge-base.js';
import type pino from 'pino';

export interface FailureHandler {
  handle(command: string, error: string): Promise<void>;
}

export function createFailureHandler(
  discovery: CommandDiscovery,
  knowledgeBase: KnowledgeBase,
  logger: pino.Logger,
): FailureHandler {
  return new FailureHandlerImpl(discovery, knowledgeBase, logger);
}

class FailureHandlerImpl implements FailureHandler {
  constructor(
    private discovery: CommandDiscovery,
    private knowledgeBase: KnowledgeBase,
    private logger: pino.Logger,
  ) {}

  async handle(command: string, error: string): Promise<void> {
    if (!this.isCommandNotFoundError(error)) {
      return;
    }

    const cmdName = this.extractCommandName(command);
    if (!cmdName) return;

    const tool = await this.discovery.scanTool(cmdName);
    if (tool) {
      this.knowledgeBase.addTool(tool);
      await this.knowledgeBase.save();
      this.logger.info(`✨ 系统学到了新工具: ${cmdName}`);
    }
  }

  private isCommandNotFoundError(error: string): boolean {
    const lowerError = error.toLowerCase();
    return lowerError.includes('command not found') ||
           lowerError.includes('unknown command');
  }

  private extractCommandName(command: string): string | null {
    const parts = command.trim().split(' ');
    return parts.length > 0 ? parts[0] : null;
  }
}
