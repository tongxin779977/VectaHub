import type { CliTool, CliCommand, CliToolRegistry } from './types.js';

class CliToolRegistryImpl implements CliToolRegistry {
  private tools: Map<string, CliTool> = new Map();

  register(tool: CliTool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`CLI tool "${tool.name}" is already registered. Overwriting.`);
    }
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): CliTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): CliTool[] {
    return Array.from(this.tools.values());
  }

  getToolsByCategory(category: string): CliTool[] {
    return this.getAllTools().filter(
      (tool) => tool.category?.toLowerCase() === category.toLowerCase()
    );
  }

  getAllCategories(): string[] {
    const categories = new Set<string>();
    for (const tool of this.getAllTools()) {
      if (tool.category) {
        categories.add(tool.category);
      }
    }
    return Array.from(categories).sort();
  }

  searchTools(keyword: string): CliTool[] {
    const lowerKeyword = keyword.toLowerCase();
    return this.getAllTools().filter((tool) => {
      if (tool.name.toLowerCase().includes(lowerKeyword)) return true;
      if (tool.description.toLowerCase().includes(lowerKeyword)) return true;
      if (tool.category?.toLowerCase().includes(lowerKeyword)) return true;
      if (tool.tags?.some((tag) => tag.toLowerCase().includes(lowerKeyword))) return true;
      return false;
    });
  }

  searchCommands(keyword: string): Array<{ tool: CliTool; command: CliCommand }> {
    const lowerKeyword = keyword.toLowerCase();
    const results: Array<{ tool: CliTool; command: CliCommand }> = [];
    
    for (const tool of this.getAllTools()) {
      for (const [commandName, command] of Object.entries(tool.commands)) {
        if (commandName.toLowerCase().includes(lowerKeyword)) {
          results.push({ tool, command });
          continue;
        }
        if (command.description.toLowerCase().includes(lowerKeyword)) {
          results.push({ tool, command });
          continue;
        }
        if (command.tags?.some((tag) => tag.toLowerCase().includes(lowerKeyword))) {
          results.push({ tool, command });
        }
      }
    }
    
    return results;
  }

  isCommandDangerous(toolName: string, command: string): boolean {
    const tool = this.tools.get(toolName);
    if (!tool) return false;

    const cmd = tool.commands[command];
    if (cmd?.dangerous) return true;

    if (tool.dangerousCommands) {
      return tool.dangerousCommands.includes(command);
    }

    return false;
  }

  getCommandInfo(toolName: string, commandName: string): CliCommand | undefined {
    const tool = this.tools.get(toolName);
    if (!tool) return undefined;
    return tool.commands[commandName];
  }
}

let registryInstance: CliToolRegistry | null = null;

export function getCliToolRegistry(): CliToolRegistry {
  if (!registryInstance) {
    registryInstance = new CliToolRegistryImpl();
  }
  return registryInstance;
}

export function resetRegistry(): void {
  registryInstance = null;
}
