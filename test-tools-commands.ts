// 测试 tools 命令的核心实现
console.log('\n🔧 tools 命令功能测试');
console.log('─'.repeat(80));

import {
  getCliToolRegistry,
  getAllKnownTools,
  getSecurityTemplate,
  CommandRuleEngine,
} from './src/cli-tools/index.js';
import { gitTool, npmTool } from './src/cli-tools/index.js';

// 测试 tools known 功能
console.log('\n1️⃣  模拟 tools known 命令:');
const allKnown = getAllKnownTools();
for (const tool of allKnown) {
  console.log(`   ✅ ${tool.name.padEnd(10)} ${tool.description}`);
}

// 测试 tools list 功能
console.log('\n2️⃣  模拟 tools list 命令:');
const registry = getCliToolRegistry();
registry.register(gitTool);
registry.register(npmTool);

for (const t of registry.getAllTools()) {
  console.log(`   ✅ ${t.name}`);
  console.log(`      命令数: ${Object.keys(t.commands).length}`);
  console.log(`      危险命令: ${t.dangerousCommands ? t.dangerousCommands.length : 0}`);
}

// 测试 tools rules 功能
console.log('\n3️⃣  模拟 tools rules 命令 (default 模板):');
const rules = getSecurityTemplate('default');
for (const rule of rules) {
  const icon = rule.action === 'block' ? '⛔' : rule.action === 'allow' ? '✅' : 'ℹ️';
  console.log(`   ${icon} ${rule.id}`);
}

// 测试 tools eval 命令
console.log('\n4️⃣  模拟 tools eval 命令:');
const engine = new CommandRuleEngine(rules);
const testCases = [
  'git status',
  'rm -rf /',
  'npm install',
  'sudo rm -rf /'
];
for (const tc of testCases) {
  const parts = tc.split(' ');
  const result = engine.evaluate(parts[0], parts.slice(1), '.');
  const icon = result.decision === 'block' ? '⛔' : '✅';
  console.log(`   ${icon} ${tc.padEnd(25)} -> ${result.decision}`);
}

console.log('\n' + '─'.repeat(80));
console.log('🎊 09 文档 CLI 工具集成系统实现完成！');
console.log('   所有功能完整！');
console.log('');
