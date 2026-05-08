import type { CommandDiscovery } from '../discovery/command-discovery.js';
import type { KnowledgeBase } from '../knowledge/knowledge-base.js';
import { createConsoleLogger } from '../../utils/logger.js';

const logger = createConsoleLogger('failure-handler');

export interface FailureHandler {
  handle(command: string, error: string): Promise<void>;
}

export function createFailureHandler(
  discovery: CommandDiscovery,
  knowledgeBase: KnowledgeBase
): FailureHandler {
  return new FailureHandlerImpl(discovery, knowledgeBase);
}

class FailureHandlerImpl implements FailureHandler {
  constructor(
    private discovery: CommandDiscovery,
    private knowledgeBase: KnowledgeBase
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
      logger.info(`✨ 系统学到了新工具: ${cmdName}`);
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