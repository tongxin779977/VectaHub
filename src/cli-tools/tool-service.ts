import type { CliTool, CliToolRegistry } from './types.js';
import { getCliToolRegistry } from './registry.js';
import { KNOWN_TOOLS } from './discovery/index.js';
import { gitTool } from './tools/git.js';
import { npmTool } from './tools/npm.js';
import { dockerTool } from './tools/docker.js';
import { curlTool } from './tools/curl.js';

export interface ToolServiceOptions {
  autoRegister?: boolean;
  includeBuiltin?: boolean;
  discoveryEnabled?: boolean;
}

export class ToolService {
  private registry: CliToolRegistry;
  private options: Required<ToolServiceOptions>;

  constructor(
    registry?: CliToolRegistry,
    options: ToolServiceOptions = {}
  ) {
    this.registry = registry || getCliToolRegistry();
    this.options = {
      autoRegister: true,
      includeBuiltin: true,
      discoveryEnabled: true,
      ...options,
    };

    if (this.options.includeBuiltin) {
      this.registerBuiltinTools();
    }
  }

  getRegistry(): CliToolRegistry {
    return this.registry;
  }

  register(tool: CliTool): void {
    this.registry.register(tool);
  }

  registerMany(tools: CliTool[]): void {
    tools.forEach(tool => this.registry.register(tool));
  }

  getTool(name: string): CliTool | undefined {
    return this.registry.getTool(name);
  }

  getAllTools(): CliTool[] {
    return this.registry.getAllTools();
  }

  getToolsByCategory(category: string): CliTool[] {
    return this.registry.getToolsByCategory(category);
  }

  getAllCategories(): string[] {
    return this.registry.getAllCategories();
  }

  searchTools(keyword: string): CliTool[] {
    return this.registry.searchTools(keyword);
  }

  isCommandDangerous(toolName: string, command: string): boolean {
    return this.registry.isCommandDangerous(toolName, command);
  }

  getCommandInfo(toolName: string, command: string) {
    return this.registry.getCommandInfo(toolName, command);
  }

  private registerBuiltinTools(): void {
    const builtinTools = [gitTool, npmTool, dockerTool, curlTool];
    
    for (const tool of builtinTools) {
      try {
        this.registry.register(tool);
      } catch (e) {
        console.warn(`Failed to load builtin ${tool?.name} tool:`, e);
      }
    }
  }

  getDiscoverySummary(): {
    totalRegistered: number;
    categories: string[];
    toolsByCategory: Record<string, string[]>;
  } {
    const allTools = this.getAllTools();
    const toolsByCategory: Record<string, string[]> = {};

    allTools.forEach(tool => {
      const categories = tool.category ? [tool.category] : ['uncategorized'];
      categories.forEach(cat => {
        if (!toolsByCategory[cat]) {
          toolsByCategory[cat] = [];
        }
        toolsByCategory[cat].push(tool.name);
      });
    });

    return {
      totalRegistered: allTools.length,
      categories: this.getAllCategories(),
      toolsByCategory,
    };
  }
}

let globalToolService: ToolService | null = null;

export function getToolService(options?: ToolServiceOptions): ToolService {
  if (!globalToolService) {
    globalToolService = new ToolService(undefined, options);
  }
  return globalToolService;
}

export function resetToolService(): void {
  globalToolService = null;
}
