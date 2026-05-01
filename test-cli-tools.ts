// 测试 09 cli 工具集成系统的核心功能

console.log('\n🚀 09 文档 - CLI 工具集成系统测试');
console.log('─'.repeat(80));

// 1. 测试已知工具库
import { getAllKnownTools, getKnownTool } from './src/cli-tools/index.js';

console.log('\n1️⃣  已知工具库:');
const tools = getAllKnownTools();
console.log(`   找到 ${tools.length} 个工具`);
for (const tool of tools) {
  console.log(`   ✅ ${tool.name} - ${tool.description}`);
}

// 2. 测试 Command Rule Engine
import { CommandRuleEngine, getSecurityTemplate } from './src/cli-tools/index.js';

console.log('\n2️⃣  命令规则引擎:');

const defaultRules = getSecurityTemplate('default');
console.log(`   默认模板有 ${defaultRules.length} 条规则`);

// 初始化引擎
const engine = new CommandRuleEngine(defaultRules);

// 测试一些命令
const testCommands = ['rm -rf /', 'git status', 'npm install'];
console.log('\n   测试命令:');
for (const cmd of testCommands) {
  const parts = cmd.split(' ');
  const command = parts[0];
  const args = parts.slice(1);
  const result = engine.evaluate(command, args, '.');
  const icon = result.decision === 'block' ? '⛔' : result.decision === 'allow' ? '✅' : '➡️';
  console.log(`   ${icon} ${cmd.padEnd(25)} -> ${result.decision.toUpperCase()}`);
}

// 3. 测试 git 工具
import { gitTool } from './src/cli-tools/index.js';
import { getCliToolRegistry } from './src/cli-tools/index.js';

console.log('\n3️⃣  工具注册表:');
const registry = getCliToolRegistry();
registry.register(gitTool);
const registered = registry.getAllTools();
console.log(`   已注册 ${registered.length} 个工具`);

for (const regTool of registered) {
  console.log(`   ✅ ${regTool.name}`);
  const hasDangerous = regTool.dangerousCommands && regTool.dangerousCommands.length > 0;
  if (hasDangerous) {
    console.log(`      危险命令数: ${regTool.dangerousCommands!.length}`);
  }
  console.log(`      可用命令: ${Object.keys(regTool.commands).length}`);
}

// 4. 测试 npm 工具
import { npmTool } from './src/cli-tools/index.js';
console.log('\n4️⃣  测试 npm 工具:');
console.log(`   npm 工具已定义: ${npmTool.name}`);
console.log(`   版本要求: ${npmTool.version}`);
console.log(`   危险命令: ${npmTool.dangerousCommands?.join(', ')}`);

console.log('\n' + '─'.repeat(80));
console.log('🎉 所有核心系统架构实现完成！');
console.log('   - 10: 工具注册配置');
console.log('   - 11: 工具发现 & 已知工具库');
console.log('   - 12: 命令黑白名单规则引擎');
console.log('\n');
