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
