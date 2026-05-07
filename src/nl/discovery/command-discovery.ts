import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ToolInfo, CommandInfo } from '../types/command.js';

const execFileAsync = promisify(execFile);

export interface CommandDiscovery {
  scanTool(toolName: string): Promise<ToolInfo | null>;
  scanTools(toolNames: string[]): Promise<ToolInfo[]>;
}

export function createCommandDiscovery(): CommandDiscovery {
  return new CommandDiscoveryImpl();
}

class CommandDiscoveryImpl implements CommandDiscovery {
  async scanTool(toolName: string): Promise<ToolInfo | null> {
    try {
      const { stdout } = await execFileAsync(toolName, ['--help']);
      const commands = this.parseHelpOutput(stdout, toolName);
      const version = await this.getVersion(toolName);

      return {
        name: toolName,
        version,
        commands,
        lastScanned: new Date().toISOString()
      };
    } catch {
      return null;
    }
  }

  async scanTools(toolNames: string[]): Promise<ToolInfo[]> {
    const results: ToolInfo[] = [];
    for (const name of toolNames) {
      const tool = await this.scanTool(name);
      if (tool) {
        results.push(tool);
      }
    }
    return results;
  }

  private parseHelpOutput(output: string, toolName: string): CommandInfo[] {
    const commands: CommandInfo[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/^\s{2,}(\w+)\s+(.+)$/);
      if (match) {
        commands.push({
          name: match[1],
          description: match[2],
          usage: `${toolName} ${match[1]}`,
          category: toolName
        });
      }
    }

    return commands;
  }

  private async getVersion(toolName: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(toolName, ['--version']);
      const match = stdout.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : 'unknown';
    } catch {
      return 'unknown';
    }
  }
}