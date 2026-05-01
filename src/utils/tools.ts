import { Command } from 'commander';
import {
  getCliToolRegistry,
  getToolScanner,
  getAllKnownTools,
  getKnownTool,
  CommandRuleEngine,
  getSecurityTemplate,
  loadConfig,
  saveConfig,
} from '../cli-tools/index.js';
import { npmTool } from '../cli-tools/tools/npm.js';

export const toolsCmd = new Command('tools')
  .description('CLI tools management commands');

toolsCmd
  .command('list')
  .description('List all registered CLI tools')
  .action(() => {
    const registry = getCliToolRegistry();
    const tools = registry.getAllTools();
    
    if (tools.length === 0) {
      console.log('\n⚠️  No CLI tools registered.\n');
      return;
    }
    
    console.log('\n📦 Registered CLI Tools:');
    console.log('─'.repeat(80));
    
    for (const tool of tools) {
      const commandCount = Object.keys(tool.commands).length;
      const dangerousCount = tool.dangerousCommands?.length || 0;
      
      console.log(`${tool.name.padEnd(20)} ${tool.description}`);
      console.log(`  Commands: ${commandCount} | Dangerous: ${dangerousCount}`);
    }
    console.log('');
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
      process.exit(1);
    }
    
    console.log(`\n📦 ${tool.name}`);
    console.log('─'.repeat(80));
    console.log(`Description: ${tool.description}`);
    console.log(`Version: ${tool.version}`);
    console.log(`Commands: ${Object.keys(tool.commands).length}`);
    
    if (tool.dangerousCommands && tool.dangerousCommands.length > 0) {
      console.log(`\n⚠️  Dangerous Commands:`);
      for (const cmd of tool.dangerousCommands) {
        console.log(`  - ${cmd}`);
      }
    }
    console.log('');
  });

toolsCmd
  .command('commands <toolName>')
  .description('List all commands for a tool')
  .action((toolName: string) => {
    const registry = getCliToolRegistry();
    const tool = registry.getTool(toolName);
    
    if (!tool) {
      console.error(`❌ Tool not found: ${toolName}`);
      process.exit(1);
    }
    
    console.log(`\n📋 ${tool.name} Commands:`);
    console.log('─'.repeat(80));
    
    const commands = Object.values(tool.commands);
    for (const cmd of commands) {
      const dangerTag = cmd.dangerous ? ' ⚠️' : '';
      console.log(`${cmd.name.padEnd(25)} ${cmd.description}${dangerTag}`);
    }
    console.log('');
  });

toolsCmd
  .command('command <toolName> <commandName>')
  .description('Show detailed command information')
  .action((toolName: string, commandName: string) => {
    const registry = getCliToolRegistry();
    const tool = registry.getTool(toolName);
    
    if (!tool) {
      console.error(`❌ Tool not found: ${toolName}`);
      process.exit(1);
    }
    
    const cmd = registry.getCommandInfo(toolName, commandName);
    if (!cmd) {
      console.error(`❌ Command not found: ${commandName}`);
      console.error('Available commands:', Object.keys(tool.commands).join(', '));
      process.exit(1);
    }
    
    console.log(`\n📋 ${tool.name} ${cmd.name}`);
    console.log('─'.repeat(80));
    console.log(`Description: ${cmd.description}`);
    console.log(`Usage: ${cmd.usage}`);
    
    if (cmd.examples && cmd.examples.length > 0) {
      console.log('\nExamples:');
      for (const example of cmd.examples) {
        console.log(`  $ ${example}`);
      }
    }
    
    if (cmd.dangerous) {
      console.log(`\n⚠️  DANGER LEVEL: ${cmd.dangerLevel?.toUpperCase()}`);
      if (cmd.requiresConfirmation) {
        console.log('   Requires user confirmation');
      }
    }
    
    if (cmd.options && cmd.options.length > 0) {
      console.log('\nOptions:');
      for (const opt of cmd.options) {
        const alias = opt.alias ? `, -${opt.alias}` : '';
        const required = opt.required ? ' (required)' : '';
        console.log(`  --${opt.name}${alias}${required}`);
        console.log(`    ${opt.description}`);
      }
    }
    console.log('');
  });

toolsCmd
  .command('test <toolName> <command>')
  .description('Test if a command is dangerous')
  .action((toolName: string, command: string) => {
    const registry = getCliToolRegistry();
    
    const tool = registry.getTool(toolName);
    if (!tool) {
      console.error(`❌ Tool not found: ${toolName}`);
      process.exit(1);
    }
    
    const isDangerous = registry.isCommandDangerous(toolName, command);
    
    if (isDangerous) {
      const cmd = registry.getCommandInfo(toolName, command);
      console.log(`\n❌ DANGEROUS: "${command}" is marked as dangerous`);
      if (cmd) {
        console.log(`   Level: ${cmd.dangerLevel?.toUpperCase()}`);
        console.log(`   Requires confirmation: ${cmd.requiresConfirmation ? 'Yes' : 'No'}`);
      }
    } else {
      console.log(`\n✅ SAFE: "${command}" is not marked as dangerous`);
    }
    console.log('');
  });

toolsCmd
  .command('scan')
  .description('Scan system for known CLI tools and auto-register them')
  .action(async () => {
    const scanner = getToolScanner();
    const result = await scanner.scan();

    console.log('\n✅ 扫描完成！');
    console.log(`\n发现了 ${result.discoveredTools.length} 个工具（共扫描 ${result.totalScanned} 个）`);
    
    if (result.discoveredTools.length > 0) {
      console.log('\n📦 发现的工具：');
      console.log('─'.repeat(80));
      for (const tool of result.discoveredTools) {
        console.log(`${tool.knownTool.name.padEnd(20)} v${tool.version}`);
        console.log(`  ${tool.knownTool.description}`);
      }
    }

    if (result.failedChecks.length > 0) {
      console.log('\n⚠️  检测失败的工具：');
      for (const fail of result.failedChecks) {
        console.log(`  - ${fail.name}: ${fail.reason}`);
      }
    }
    console.log('');
  });

toolsCmd
  .command('known')
  .description('List all known tools that can be registered')
  .action(() => {
    const tools = getAllKnownTools();
    console.log('\n📚 已知工具库（共 ' + tools.length + ' 个）：');
    console.log('─'.repeat(80));

    for (const tool of tools) {
      console.log(`${tool.name.padEnd(20)} ${tool.description}`);
      console.log(`  版本要求: ${tool.versionRequirement}`);
      console.log(`  置信度: ${(tool.confidence * 100).toFixed(0)}%`);
    }
    console.log('');
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
      const allTools = getAllKnownTools();
      
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
        process.exit(1);
      }

      if (registry.getTool(toolName)) {
        console.log('\n⚠️  工具已注册:', toolName);
        process.exit(1);
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
  .action(async (options) => {
    const rules = getSecurityTemplate(options.template as any);

    console.log(`\n🔒 安全规则模板: ${options.template.toUpperCase()}`);
    console.log('─'.repeat(80));
    console.log('\n当前规则列表：\n');

    for (const rule of rules) {
      const actionIcon = rule.action === 'block' ? '⛔' : '✅';
      const reason = rule.reason ? ` (${rule.reason})` : '';
      const desc = rule.description ? ` - ${rule.description}` : '';

      console.log(`${actionIcon} ${rule.id.padEnd(25)} ${rule.pattern}${reason}${desc}`);
    }

    console.log('\n💡 提示：');
    console.log('  - "block"规则会先于安全协议执行');
    console.log('  - "allow"规则放行命令');
    console.log('  - 没有命中规则的命令会继续执行 02 沙盒文档的安全协议\n');
  });

toolsCmd
  .command('eval <command...>')
  .description('Evaluate a command against the rule engine')
  .option('-t, --template <template>', 'Security template to use: default | strict | relaxed', 'default')
  .action(async (args: string[], options) => {
    const command = args[0] || '';
    const cmdArgs = args.slice(1);
    const rules = getSecurityTemplate(options.template as any);
    const engine = new CommandRuleEngine(rules);
    const result = engine.evaluate(command, cmdArgs, process.cwd());

    console.log(`\n📋 命令: ${args.join(' ')}`);
    console.log(`模板: ${options.template.toUpperCase()}`);
    console.log('─'.repeat(80));
    console.log(`判决: ${result.decision.toUpperCase()}`);

    if (result.rule) {
      console.log(`规则: ${result.rule.id} (${result.scope || 'global'})`);
      console.log(`原因: ${result.rule.reason || '无'}`);
    }
    console.log('');
  });
