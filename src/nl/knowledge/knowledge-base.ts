import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { ToolInfo, CommandInfo, KnowledgeBaseData } from '../types/command.js';

const KB_VERSION = '1.0.0';
const KB_DIR = join(homedir(), '.vectahub');
const KB_PATH = join(KB_DIR, 'commands.json');

export interface KnowledgeBase {
  load(): Promise<void>;
  save(): Promise<void>;
  addTool(tool: ToolInfo): void;
  getCommand(commandName: string): CommandInfo | undefined;
  searchCommands(query: string): CommandInfo[];
  getAllTools(): ToolInfo[];
}

export function createKnowledgeBase(): KnowledgeBase {
  return new KnowledgeBaseImpl();
}

class KnowledgeBaseImpl implements KnowledgeBase {
  private tools: ToolInfo[] = [];

  async load(): Promise<void> {
    try {
      if (await this.exists(KB_PATH)) {
        const content = await fs.readFile(KB_PATH, 'utf-8');
        const data: KnowledgeBaseData = JSON.parse(content);
        this.tools = data.tools || [];
      } else {
        await this.init();
      }
    } catch {
      await this.init();
    }
  }

  async save(): Promise<void> {
    await fs.mkdir(KB_DIR, { recursive: true });
    const data: KnowledgeBaseData = {
      version: KB_VERSION,
      tools: this.tools
    };
    await fs.writeFile(KB_PATH, JSON.stringify(data, null, 2));
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