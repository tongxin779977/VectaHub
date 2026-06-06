import type { CliTool, CliToolRegistry } from './types.js';
import { getCliToolRegistry } from './registry.js';
import { gitTool } from './tools/git.js';
import { npmTool } from './tools/npm.js';
import { dockerTool } from './tools/docker.js';
import { curlTool } from './tools/curl.js';
import { ghTool } from './tools/gh.js';

/**
 * 工具服务选项接口
 */
export interface ToolServiceOptions {
  /** 是否自动注册工具 */
  autoRegister?: boolean;
  /** 是否包含内置工具 */
  includeBuiltin?: boolean;
  /** 是否启用工具发现 */
  discoveryEnabled?: boolean;
}

/**
 * 工具服务依赖接口
 */
export interface ToolServiceDeps {
  /** 日志记录器 */
  logger: Pick<Console, 'warn'>;
}

const silentToolServiceLogger: ToolServiceDeps['logger'] = {
  warn(): void {},
};

/**
 * 工具服务类
 * 提供 CLI 工具的注册、管理和查询功能
 */
export class ToolService {
  private registry: CliToolRegistry;
  private options: Required<ToolServiceOptions>;
  private readonly logger: Pick<Console, 'warn'>;

  constructor(
    registry?: CliToolRegistry,
    options: ToolServiceOptions = {},
    deps: ToolServiceDeps = { logger: silentToolServiceLogger },
  ) {
    this.registry = registry || getCliToolRegistry();
    this.logger = deps.logger;
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

  /** 获取工具注册表 */
  getRegistry(): CliToolRegistry {
    return this.registry;
  }

  /** 注册一个工具 */
  register(tool: CliTool): void {
    this.registry.register(tool);
  }

  /** 注册多个工具 */
  registerMany(tools: CliTool[]): void {
    tools.forEach(tool => this.registry.register(tool));
  }

  /** 根据名称获取工具 */
  getTool(name: string): CliTool | undefined {
    return this.registry.getTool(name);
  }

  /** 获取所有已注册的工具 */
  getAllTools(): CliTool[] {
    return this.registry.getAllTools();
  }

  /** 根据分类获取工具 */
  getToolsByCategory(category: string): CliTool[] {
    return this.registry.getToolsByCategory(category);
  }

  /** 获取所有分类 */
  getAllCategories(): string[] {
    return this.registry.getAllCategories();
  }

  /** 搜索工具 */
  searchTools(keyword: string): CliTool[] {
    return this.registry.searchTools(keyword);
  }

  /** 检查命令是否危险 */
  isCommandDangerous(toolName: string, command: string): boolean {
    return this.registry.isCommandDangerous(toolName, command);
  }

  /** 获取命令信息 */
  getCommandInfo(toolName: string, command: string) {
    return this.registry.getCommandInfo(toolName, command);
  }

  private registerBuiltinTools(): void {
    const builtinTools = [gitTool, npmTool, dockerTool, curlTool, ghTool];
    
    for (const tool of builtinTools) {
      try {
        this.registry.register(tool);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Failed to load builtin ${tool?.name} tool: ${message}`);
      }
    }
  }

  /** 获取工具发现摘要 */
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

/**
 * 获取全局工具服务实例
 * @param options - 工具服务选项
 * @param deps - 工具服务依赖
 * @returns 工具服务实例
 */
export function getToolService(options?: ToolServiceOptions, deps?: ToolServiceDeps): ToolService {
  if (!globalToolService) {
    globalToolService = new ToolService(undefined, options, deps);
  }
  return globalToolService;
}

/**
 * 重置全局工具服务实例
 * 用于测试或重新初始化
 */
export function resetToolService(): void {
  globalToolService = null;
}
