import { promises as fs } from 'node:fs';
import type { ToolInfo, CommandInfo, KnowledgeBaseData } from '../types/command.js';
import type { Logger } from '../../infrastructure/logger/index.js';
import type { IEnvironmentService } from '../../infrastructure/interfaces/index.js';

const KB_VERSION = '1.0.0';

export interface KnowledgeBase {
  load(): Promise<void>;
  save(): Promise<void>;
  addTool(tool: ToolInfo): void;
  getCommand(commandName: string): CommandInfo | undefined;
  searchCommands(query: string): CommandInfo[];
  getAllTools(): ToolInfo[];
}

export function createKnowledgeBase(environment: IEnvironmentService, logger?: Logger): KnowledgeBase {
  return new KnowledgeBaseImpl(environment, logger);
}

class KnowledgeBaseImpl implements KnowledgeBase {
  private tools: ToolInfo[] = [];
  private logger: Logger;

  constructor(
    private readonly environment: IEnvironmentService,
    logger?: Logger,
  ) {
    if (!logger) {
      throw new Error('KnowledgeBaseImpl requires a Logger');
    }
    this.logger = logger;
  }

  async load(): Promise<void> {
    const knowledgeBasePath = this.environment.getPath('commands.json');
    try {
      if (await this.exists(knowledgeBasePath)) {
        const content = await fs.readFile(knowledgeBasePath, 'utf-8');
        const data: KnowledgeBaseData = JSON.parse(content);
        this.tools = data.tools || [];
      } else {
        await this.init();
      }
    } catch (error) {
      this.logger.warn(`Failed to load knowledge base, initializing empty: ${error instanceof Error ? error.message : String(error)}`);
      await this.init();
    }
  }

  async save(): Promise<void> {
    const knowledgeBaseDir = this.environment.getHomePath();
    const knowledgeBasePath = this.environment.getPath('commands.json');
    await fs.mkdir(knowledgeBaseDir, { recursive: true });
    const data: KnowledgeBaseData = {
      version: KB_VERSION,
      tools: this.tools
    };
    await fs.writeFile(knowledgeBasePath, JSON.stringify(data, null, 2));
  }

  addTool(tool: ToolInfo): void {
    const index = this.tools.findIndex(t => t.name === tool.name);
    if (index >= 0) {
      this.tools[index] = tool;
    } else {
      this.tools.push(tool);
    }
  }

  getCommand(commandName: string): CommandInfo | undefined {
    for (const tool of this.tools) {
      const cmd = tool.commands.find(c => c.name === commandName);
      if (cmd) return cmd;
    }
    return undefined;
  }

  searchCommands(query: string): CommandInfo[] {
    const results: CommandInfo[] = [];
    const keywords = query.toLowerCase().split(' ');

    for (const tool of this.tools) {
      for (const cmd of tool.commands) {
        const match = keywords.some(kw =>
          cmd.name.toLowerCase().includes(kw) ||
          cmd.description.toLowerCase().includes(kw)
        );
        if (match) {
          results.push(cmd);
        }
      }
    }

    return results;
  }

  getAllTools(): ToolInfo[] {
    return [...this.tools];
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async init(): Promise<void> {
    this.tools = [];
    await this.save();
  }
}
