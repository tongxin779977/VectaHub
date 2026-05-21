import { Command } from 'commander';
import {
  getCliToolRegistry,
  getAllKnownTools,
  getKnownTool,
  CommandRuleEngine,
  getSecurityTemplate,
  loadConfig,
  saveConfig,
} from '../cli-tools/index.js';
import { npmTool } from '../cli-tools/tools/npm.js';
import type { CliCommand, CliTool } from '../cli-tools/types.js';
import type { SecurityTemplate, CommandRule, CommandRuleResult } from '../cli-tools/command-rules/types.js';
import type { KnownTool } from '../cli-tools/discovery/types.js';
import { loadConfig as loadSetupConfig } from '../setup/first-run-wizard.js';
import { scanSingleTool, syncCLIToolPermissionState } from '../setup/cli-scanner.js';
import { getBuiltInAgentDescriptors } from './agent-cli-adapter.js';
import { type InfrastructureContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';

const SECURITY_TEMPLATES: SecurityTemplate[] = ['default', 'strict', 'relaxed'];

function normalizeSecurityTemplate(template: string): SecurityTemplate {
  return SECURITY_TEMPLATES.includes(template as SecurityTemplate)
    ? template as SecurityTemplate
    : 'default';
}

function formatToolList(tools: CliTool[]): string {
  if (tools.length === 0) {
    return '\n⚠️  No CLI tools registered.\n';
  }

  const lines = ['\n📦 Registered CLI Tools:', '─'.repeat(80)];

  for (const tool of tools) {
    const commandCount = Object.keys(tool.commands).length;
    const dangerousCount = tool.dangerousCommands?.length || 0;

    lines.push(`${tool.name.padEnd(20)} ${tool.description}`);
    lines.push(`  Commands: ${commandCount} | Dangerous: ${dangerousCount}`);
  }
  lines.push('');

  return lines.join('\n');
}

function formatToolInfo(tool: CliTool): string {
  const lines = [
    `\n📦 ${tool.name}`,
    '─'.repeat(80),
    `Description: ${tool.description}`,
    `Version: ${tool.version}`,
    `Commands: ${Object.keys(tool.commands).length}`,
  ];

  if (tool.dangerousCommands && tool.dangerousCommands.length > 0) {
    lines.push(`\n⚠️  Dangerous Commands:`);
    for (const cmd of tool.dangerousCommands) {
      lines.push(`  - ${cmd}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

function formatToolCommands(tool: CliTool): string {
  const lines = [`\n📋 ${tool.name} Commands:`, '─'.repeat(80)];

  const commands = Object.values(tool.commands);
  for (const command of commands) {
    const dangerTag = command.dangerous ? ' ⚠️' : '';
    lines.push(`${command.name.padEnd(25)} ${command.description}${dangerTag}`);
  }
  lines.push('');

  return lines.join('\n');
}

function formatCommandDetail(tool: CliTool, cmd: CliCommand): string {
  const lines = [
    `\n📋 ${tool.name} ${cmd.name}`,
    '─'.repeat(80),
    `Description: ${cmd.description}`,
    `Usage: ${cmd.usage}`,
  ];

  if (cmd.examples && cmd.examples.length > 0) {
    lines.push('\nExamples:');
    for (const example of cmd.examples) {
      lines.push(`  $ ${example}`);
    }
  }

  if (cmd.dangerous) {
    lines.push(`\n⚠️  DANGER LEVEL: ${cmd.dangerLevel?.toUpperCase()}`);
    if (cmd.requiresConfirmation) {
      lines.push('   Requires user confirmation');
    }
  }

  if (cmd.options && cmd.options.length > 0) {
    lines.push('\nOptions:');
    for (const opt of cmd.options) {
      const alias = opt.alias ? `, -${opt.alias}` : '';
      const required = opt.required ? ' (required)' : '';
      lines.push(`  --${opt.name}${alias}${required}`);
      lines.push(`    ${opt.description}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

function formatTestResult(toolName: string, command: string, isDangerous: boolean, cmd?: CliCommand): string {
  if (isDangerous) {
    const lines = [
      `\n❌ DANGEROUS: "${command}" is marked as dangerous`,
    ];
    if (cmd) {
      lines.push(`   Level: ${cmd.dangerLevel?.toUpperCase()}`);
      lines.push(`   Requires confirmation: ${cmd.requiresConfirmation ? 'Yes' : 'No'}`);
    }
    return lines.join('\n') + '\n';
  } else {
    return `\n✅ SAFE: "${command}" is not marked as dangerous\n`;
  }
}

function formatKnownTools(tools: KnownTool[]): string {
  const lines = [`\n📚 已知工具库（共 ${tools.length} 个）：`, '─'.repeat(80)];

  for (const tool of tools) {
    lines.push(`${tool.name.padEnd(20)} ${tool.description}`);
    lines.push(`  版本要求: ${tool.versionRequirement}`);
    lines.push(`  置信度: ${(tool.confidence * 100).toFixed(0)}%`);
  }
  lines.push('');

  return lines.join('\n');
}

function formatRuleList(template: SecurityTemplate, rules: CommandRule[]): string {
  const lines = [
    `\n🔒 安全规则模板: ${template.toUpperCase()}`,
    '─'.repeat(80),
    '\n当前规则列表：\n',
  ];

  for (const rule of rules) {
    const actionIcon = rule.action === 'block' ? '⛔' : '✅';
    const reason = rule.reason ? ` (${rule.reason})` : '';
    const desc = rule.description ? ` - ${rule.description}` : '';

    lines.push(`${actionIcon} ${rule.id.padEnd(25)} ${rule.pattern}${reason}${desc}`);
  }

  lines.push('\n💡 提示：');
  lines.push('  - "block"规则会先于安全协议执行');
  lines.push('  - "allow"规则放行命令');
  lines.push('  - 没有命中规则的命令会继续执行 02 沙盒文档的安全协议\n');

  return lines.join('\n');
}

function formatEvalResult(args: string[], template: SecurityTemplate, result: CommandRuleResult): string {
  const lines = [
    `\n📋 命令: ${args.join(' ')}`,
    `模板: ${template.toUpperCase()}`,
    '─'.repeat(80),
    `判决: ${result.decision.toUpperCase()}`,
  ];

  if (result.rule) {
    lines.push(`规则: ${result.rule.id} (${result.scope || 'global'})`);
    lines.push(`原因: ${result.rule.reason || '无'}`);
  }
  lines.push('');

  return lines.join('\n');
}

function formatCategoryList(categories: string[]): string {
  const lines = [
    `\n📁 工具分类（共 ${categories.length} 个）：`,
    '─'.repeat(80),
  ];

  categories.forEach(category => {
    lines.push(`  ${category}`);
  });
  lines.push('');

  return lines.join('\n');
}

function formatSearchResults(
  tools: CliTool[],
  commands: Array<{ tool: CliTool; command: CliCommand }>
): string {
  const lines = ['\n🔍 搜索结果：', '─'.repeat(80)];

  if (tools.length > 0) {
    lines.push(`\n📦 匹配的工具（${tools.length} 个）：`);
    tools.forEach(tool => {
      const category = tool.category ? ` [${tool.category}]` : '';
      lines.push(`  ${tool.name.padEnd(20)}${category} ${tool.description}`);
      if (tool.tags && tool.tags.length > 0) {
        lines.push(`    Tags: ${tool.tags.join(', ')}`);
      }
    });
  }

  if (commands.length > 0) {
    lines.push(`\n📋 匹配的命令（${commands.length} 个）：`);
    commands.forEach(item => {
      const dangerTag = item.command.dangerous ? ' ⚠️' : '';
      // 找到命令的名称
      let commandName = '';
      for (const [name, cmd] of Object.entries(item.tool.commands)) {
        if (cmd === item.command) {
          commandName = name;
          break;
        }
      }
      lines.push(`  ${item.tool.name} ${commandName.padEnd(15)}${dangerTag} ${item.command.description}`);
    });
  }

  if (tools.length === 0 && commands.length === 0) {
    lines.push('\n  未找到匹配的结果');
  }

  lines.push('');

  return lines.join('\n');
}

function formatCategoryTools(category: string, tools: CliTool[]): string {
  const lines = [
    `\n📁 分类：${category}`,
    '─'.repeat(80),
  ];

  if (tools.length === 0) {
    lines.push('\n  该分类下暂无工具');
  } else {
    lines.push(`\n📦 工具列表（${tools.length} 个）：`);
    tools.forEach(tool => {
      const cmdCount = Object.keys(tool.commands).length;
      lines.push(`  ${tool.name.padEnd(20)} ${tool.description}`);
      lines.push(`    Commands: ${cmdCount}`);
    });
  }

  lines.push('');

  return lines.join('\n');
}

export function createToolsCmd(context: InfrastructureContext): Command {
  const toolsCmd = new Command('tools')
    .description('CLI tools management commands');

  toolsCmd
  .command('list')
  .description('List all registered CLI tools')
  .option('--json', 'Output results in JSON format')
  .action((options: { json?: boolean }) => {
    const registry = getCliToolRegistry();
    const tools = registry.getAllTools();

    if (options.json) {
      console.log(JSON.stringify({
        ok: true,
        tools: tools.map(t => ({
          name: t.name,
          description: t.description,
          commandCount: Object.keys(t.commands).length,
          dangerousCount: t.dangerousCommands?.length || 0
        }))
      }, null, 2));
    } else {
      console.log(formatToolList(tools));
    }
  });

toolsCmd
  .command('agents')
  .description('List AI Agent CLIs with installation status')
  .option('--json', 'Output results in JSON format')
  .option('--sync-config', 'Sync detected permission state back into VectaHub config')
  .action(async (options: { json?: boolean; syncConfig?: boolean }) => {
    const appConfig = loadSetupConfig();
    const externalCli = appConfig.external_cli || {};
    const knownNames = getBuiltInAgentDescriptors().map((descriptor) => descriptor.id);
    const names = Array.from(new Set([...knownNames, ...Object.keys(externalCli)]));

    const detectedTools = await Promise.all(names.map(async (name) => {
      const detected = await scanSingleTool(name, context);
      return { name, detected };
    }));

    if (options.syncConfig) {
      syncCLIToolPermissionState(
        detectedTools
          .map(item => item.detected)
          .filter((item): item is NonNullable<typeof item> => item !== null),
      );
    }

    const agents = detectedTools.map(({ name, detected }) => {
      const cfg = externalCli[name] || { enabled: true, has_permission: true };
      return detected ? {
        name,
        installed: detected.installed,
        version: detected.version,
        configured_enabled: cfg.enabled,
        has_permission: cfg.has_permission,
        invocable: detected.invocable,
        ready: detected.ready,
      } : {
        name,
        installed: false,
        version: undefined,
        configured_enabled: cfg.enabled,
        has_permission: cfg.has_permission,
        invocable: false,
        ready: false,
      };
    });

    if (options.json) {
      console.log(JSON.stringify({ ok: true, agents }, null, 2));
      return;
    }

    if (agents.length === 0) {
      console.log('\n⚠️  No AI Agent CLIs configured.\n');
      return;
    }

    const lines = ['\n🤖 AI Agent CLIs:', '─'.repeat(80)];
    for (const agent of agents) {
      const isAvailable = agent.installed && agent.configured_enabled && agent.has_permission && agent.invocable && agent.ready;
      const statusIcon = isAvailable ? '✅' : (agent.installed ? '⚠️' : '❌');
      const versionStr = agent.version ? ` (${agent.version})` : '';
      const reasons: string[] = [];
      if (!agent.installed) reasons.push('not installed');
      if (agent.installed && !agent.configured_enabled) reasons.push('disabled');
      if (agent.installed && !agent.has_permission) reasons.push('no permission');
      if (agent.installed && agent.has_permission && !agent.invocable) reasons.push('not invocable');
      if (agent.installed && agent.has_permission && agent.invocable && !agent.ready) reasons.push('not ready');
      const statusStr = reasons.length > 0 ? ` [${reasons.join(', ')}]` : ' [available]';
      lines.push(`${statusIcon} ${agent.name.padEnd(15)}${versionStr}${statusStr}`);
    }
    lines.push('');
    console.log(lines.join('\n'));
  });

toolsCmd
  .command('info <toolName>')
  .description('Show tool information')
  .action((toolName: string) => {
    const registry = getCliToolRegistry();
    const tool = registry.getTool(toolName);

    if (!tool) {
      console.error(`❌ Tool not found: ${toolName}`);
      console.error('Available tools:', registry.getAllTools().map(t => t.name).join(', '));
      throw new VectaHubError(`Tool not found: ${toolName}`, ErrorType.RUNTIME);
    }

    console.log(formatToolInfo(tool));
  });

toolsCmd
  .command('commands <toolName>')
  .description('List all commands for a tool')
  .action((toolName: string) => {
    const registry = getCliToolRegistry();
    const tool = registry.getTool(toolName);

    if (!tool) {
      console.error(`❌ Tool not found: ${toolName}`);
      throw new VectaHubError(`Tool not found: ${toolName}`, ErrorType.RUNTIME);
    }

    console.log(formatToolCommands(tool));
  });

toolsCmd
  .command('command <toolName> <commandName>')
  .description('Show detailed command information')
  .action((toolName: string, commandName: string) => {
    const registry = getCliToolRegistry();
    const tool = registry.getTool(toolName);

    if (!tool) {
      console.error(`❌ Tool not found: ${toolName}`);
      throw new VectaHubError(`Tool not found: ${toolName}`, ErrorType.RUNTIME);
    }

    const cmd = registry.getCommandInfo(toolName, commandName);
    if (!cmd) {
      console.error(`❌ Command not found: ${commandName}`);
      console.error('Available commands:', Object.keys(tool.commands).join(', '));
      throw new VectaHubError(`Command not found: ${commandName}`, ErrorType.RUNTIME);
    }

    console.log(formatCommandDetail(tool, cmd));
  });

toolsCmd
  .command('test <toolName> <command>')
  .description('Test if a command is dangerous')
  .action((toolName: string, command: string) => {
    const registry = getCliToolRegistry();

    const tool = registry.getTool(toolName);
    if (!tool) {
      console.error(`❌ Tool not found: ${toolName}`);
      throw new VectaHubError(`Tool not found: ${toolName}`, ErrorType.RUNTIME);
    }

    const isDangerous = registry.isCommandDangerous(toolName, command);
    const cmd = registry.getCommandInfo(toolName, command);

    console.log(formatTestResult(toolName, command, isDangerous, cmd));
  });

toolsCmd
  .command('known')
  .description('List all known tools that can be registered')
  .action(() => {
    const tools = getAllKnownTools();
    console.log(formatKnownTools(tools));
  });

toolsCmd
  .command('register <toolName>')
  .description('Register a known tool (or all known tools with "all")')
  .action(async (toolName: string) => {
    const registry = getCliToolRegistry();
    const config = await loadConfig();

    if (toolName === 'all') {
      console.log('\n🚀 注册所有已知工具...');
      let registeredCount = 0;

      // 已经有 git 和 npm 工具定义了
      // 这里可以完善更多工具定义
      console.log('   跳过：完整的工具定义需要逐个实现');
      console.log('   当前已注册: git');

      // 注册 npm 工具
      if (!registry.getTool('npm')) {
        registry.register(npmTool);
        config.registeredTools.push('npm');
        registeredCount++;
        console.log('   ✅ 已注册 npm');
      }

      await saveConfig(config);
      console.log('\n   总计新注册: ' + registeredCount + ' 个工具\n');
    } else {
      const known = getKnownTool(toolName);
      if (!known) {
        console.error('\n❌ 未知工具:', toolName);
        console.log('使用 tools known 查看所有可用工具\n');
        throw new VectaHubError(`Unknown tool: ${toolName}`, ErrorType.RUNTIME);
      }

      if (registry.getTool(toolName)) {
        console.log('\n⚠️  工具已注册:', toolName);
        throw new VectaHubError(`Tool already registered: ${toolName}`, ErrorType.RUNTIME);
      }

      if (toolName === 'npm') {
        registry.register(npmTool);
        config.registeredTools.push('npm');
        await saveConfig(config);
        console.log('\n✅ 成功注册:', toolName);
      } else {
        console.log('\n⚠️  工具定义尚未完全实现:', toolName);
        console.log('这是 09 设计文档中的架构，完整实现需要逐个编写工具定义\n');
      }
    }
  });

toolsCmd
  .command('rules')
  .description('Show command rule engine status and default rules')
  .option('-t, --template <template>', 'Security template to use: default | strict | relaxed', 'default')
  .action(async (options: { template: string }) => {
    const template = normalizeSecurityTemplate(options.template);
    const rules = getSecurityTemplate(template);

    console.log(formatRuleList(template, rules));
  });

toolsCmd
  .command('eval <command...>')
  .description('Evaluate a command against the rule engine')
  .option('-t, --template <template>', 'Security template to use: default | strict | relaxed', 'default')
  .action(async (args: string[], options: { template: string }) => {
    const command = args[0] || '';
    const cmdArgs = args.slice(1);
    const template = normalizeSecurityTemplate(options.template);
    const rules = getSecurityTemplate(template);
    const engine = new CommandRuleEngine(rules);
    const result = engine.evaluate(command, cmdArgs, context.environment.getCwd());

    console.log(formatEvalResult(args, template, result));
  });

toolsCmd
  .command('search <keyword>')
  .description('Search tools and commands by keyword')
  .action((keyword: string) => {
    const registry = getCliToolRegistry();
    const tools = registry.searchTools(keyword);
    const commands = registry.searchCommands(keyword);

    console.log(formatSearchResults(tools, commands));
  });

toolsCmd
  .command('categories')
  .description('List all tool categories')
  .action(() => {
    const registry = getCliToolRegistry();
    const categories = registry.getAllCategories();

    console.log(formatCategoryList(categories));
  });

toolsCmd
  .command('category <name>')
  .description('List tools in a specific category')
  .action((categoryName: string) => {
    const registry = getCliToolRegistry();
    const tools = registry.getToolsByCategory(categoryName);

    console.log(formatCategoryTools(categoryName, tools));
  });

  return toolsCmd;
}
