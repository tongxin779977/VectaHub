import { execFile } from 'child_process';
import { promisify } from 'util';
import { parse } from 'path';
import type { KnownTool, DiscoveredTool, DiscoveryResult, ToolInfo } from './types.js';
import { KNOWN_TOOLS, getAllKnownTools } from './known-tools.js';

const exec = promisify(execFile);

export class ToolScanner {
  private knownTools: KnownTool[];

  constructor(tools?: KnownTool[]) {
    this.knownTools = tools || getAllKnownTools();
  }

  async scan(): Promise<DiscoveryResult> {
    console.log('\n🔍 开始扫描系统中的 CLI 工具...');
    
    const discovered: DiscoveredTool[] = [];
    const failed: { name: string; reason: string }[] = [];
    let totalScanned = 0;

    const pathTools = await this.scanPath();
    const brewTools = await this.scanBrew();

    const allCandidates = new Map<string, ToolInfo>();
    [...pathTools, ...brewTools].forEach(tool => {
      if (!allCandidates.has(tool.name)) {
        allCandidates.set(tool.name, tool);
      }
    });

    for (const toolInfo of allCandidates.values()) {
      const knownTool = this.knownTools.find(t => t.name === toolInfo.name);
      if (knownTool) {
        totalScanned++;
        const version = await this.getVersion(knownTool);
        if (version) {
          discovered.push({
            knownTool,
            path: toolInfo.path,
            version,
            confidence: knownTool.confidence,
            foundBy: toolInfo.foundBy,
          });
        } else {
          failed.push({ name: knownTool.name, reason: '版本检测失败' });
        }
      }
    }

    return {
      discoveredTools: discovered,
      failedChecks: failed,
      totalScanned,
    };
  }

  private async scanPath(): Promise<ToolInfo[]> {
    const tools: ToolInfo[] = [];
    const paths = (process.env.PATH || '').split(':');

    for (const knownTool of this.knownTools) {
      let path = await this.findInPath(knownTool.name, paths);
      if (path) {
        tools.push({
          name: knownTool.name,
          path,
          foundBy: 'path',
        });
      }
    }

    return tools;
  }

  private async findInPath(name: string, paths: string[]): Promise<string | null> {
    const { access } = await import('fs/promises');
    const { join } = await import('path');

    for (const dir of paths) {
      const fullPath = join(dir, name);
      try {
        await access(fullPath);
        return fullPath;
      } catch {
        continue;
      }
    }

    return null;
  }

  private async scanBrew(): Promise<ToolInfo[]> {
    const tools: ToolInfo[] = [];
    try {
      const { stdout } = await exec('brew', ['list']);
      const brewFormulae = stdout.split('\n').filter(Boolean);

      for (const knownTool of this.knownTools) {
        if (brewFormulae.includes(knownTool.name) || brewFormulae.includes(knownTool.id)) {
          let path = await this.findInPath(knownTool.name, ['/usr/local/bin', '/opt/homebrew/bin']);
          if (path) {
            tools.push({
              name: knownTool.name,
              path,
              foundBy: 'brew',
            });
          }
        }
      }
    } catch {
    }

    return tools;
  }

  private async getVersion(tool: KnownTool): Promise<string | null> {
    for (const cmd of tool.versionCommands) {
      try {
        const parts = cmd.split(' ');
        const bin = parts[0];
        const args = parts.slice(1);
        
        const { stdout } = await exec(bin, args, { timeout: 5000 });
        
        if (tool.checkOutputRegex) {
          const regex = new RegExp(tool.checkOutputRegex);
          const match = stdout.match(regex);
          if (match) {
            return `${match[1]}.${match[2]}.${match[3]}`;
          }
        }
        
        const trimmed = stdout.trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
      } catch {
        continue;
      }
    }
    return null;
  }
}
