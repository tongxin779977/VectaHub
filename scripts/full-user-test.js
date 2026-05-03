#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const distPath = path.join(projectRoot, 'dist', 'cli.js');

console.log('🧪 VectaHub 1.0.0 全量用户测试套件\n');
console.log('='.repeat(80) + '\n');

const results = [];
let passed = 0;
let failed = 0;

async function runTest(name, args = [], options = {}) {
  console.log(`\n📋 测试: ${name}`);
  console.log(`   命令: vectahub ${args.join(' ')}`);

  return new Promise((resolve) => {
    const proc = spawn('node', [distPath, ...args], {
      cwd: projectRoot,
      ...options
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      if (options.verbose) {
        process.stdout.write(data);
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      if (options.verbose) {
        process.stderr.write(data);
      }
    });

    proc.on('close', (code) => {
      const success = code === 0;
      const result = {
        name,
        command: `vectahub ${args.join(' ')}`,
        success,
        code,
        stdout: stdout.slice(0, 800),
        stderr: stderr.slice(0, 800)
      };

      if (success) {
        console.log(`   ✅ 通过`);
        passed++;
      } else {
        console.log(`   ❌ 失败 (code: ${code})`);
        if (stderr) {
          console.log(`      错误: ${stderr.slice(0, 200)}`);
        }
        failed++;
      }

      results.push(result);
      resolve(success);
    });
  });
}

async function main() {
  console.log('📝 测试配置:');
  console.log(`   项目根目录: ${projectRoot}`);
  console.log(`   构建文件: ${distPath}`);
  console.log(`   测试类型: 全量用户测试（无高危操作）`);

  // ========== 第一组: 基本 CLI 命令 ==========
  console.log('\n' + '='.repeat(80));
  console.log('📦 第一组: 基本 CLI 命令');
  console.log('='.repeat(80));

  await runTest('查看版本', ['--version']);
  await runTest('查看帮助', ['--help']);
  await runTest('查看命令列表', ['--help']);

  // ========== 第二组: Doctor 完整检查 ==========
  console.log('\n' + '='.repeat(80));
  console.log('🔍 第二组: Doctor 完整检查');
  console.log('='.repeat(80));

  await runTest('运行 doctor', ['doctor']);
  await runTest('doctor --verbose', ['doctor', '--verbose']);

  // ========== 第三组: Dev 命令完整测试 ==========
  console.log('\n' + '='.repeat(80));
  console.log('🛠️  第三组: Dev 命令完整测试');
  console.log('='.repeat(80));

  await runTest('dev --help', ['dev', '--help']);
  await runTest('dev check', ['dev', 'check']);
  await runTest('dev status', ['dev', 'status']);
  await runTest('dev validate', ['dev', 'validate']);
  await runTest('dev module list', ['dev', 'module', 'list']);

  // ========== 第四组: Tools 命令完整测试 ==========
  console.log('\n' + '='.repeat(80));
  console.log('🔧 第四组: Tools 命令完整测试');
  console.log('='.repeat(80));

  await runTest('tools --help', ['tools', '--help']);
  await runTest('tools list', ['tools', 'list']);
  await runTest('tools categories', ['tools', 'categories']);
  await runTest('tools info git', ['tools', 'info', 'git']);
  await runTest('tools info npm', ['tools', 'info', 'npm']);
  await runTest('tools search version', ['tools', 'search', 'version']);

  // ========== 第五组: 安全 & 审计完整测试 ==========
  console.log('\n' + '='.repeat(80));
  console.log('🛡️  第五组: 安全 & 审计完整测试');
  console.log('='.repeat(80));

  await runTest('security --help', ['security', '--help']);
  await runTest('security status', ['security', 'status']);
  await runTest('security policy', ['security', 'policy']);
  await runTest('audit --help', ['audit', '--help']);
  await runTest('audit list', ['audit', 'list']);

  // ========== 第六组: Mode & 历史命令 ==========
  console.log('\n' + '='.repeat(80));
  console.log('📜 第六组: Mode & 历史命令');
  console.log('='.repeat(80));

  await runTest('mode --help', ['mode', '--help']);
  await runTest('mode show', ['mode', 'show']);
  await runTest('history --help', ['history', '--help']);
  await runTest('history list', ['history', 'list']);

  // ========== 第七组: 工作流完整命令 ==========
  console.log('\n' + '='.repeat(80));
  console.log('⚡ 第七组: 工作流完整命令');
  console.log('='.repeat(80));

  await runTest('list --help', ['list', '--help']);
  await runTest('list', ['list']);
  await runTest('generate --help', ['generate', '--help']);
  await runTest('generate "list project files"', ['generate', 'list project files']);

  // ========== 第八组: 全量自然语言安全测试 ==========
  console.log('\n' + '='.repeat(80));
  console.log('🤖 第八组: 全量自然语言安全测试（dry-run）');
  console.log('='.repeat(80));

  const safeNLTests = [
    // 文件操作类（只读）
    '查看当前目录',
    '列出所有文件',
    '显示目录树',
    '查看 README',
    '查看 package.json',
    
    // Git 操作类（只读）
    '查看 git 状态',
    '显示 git 日志',
    '查看当前分支',
    '检查 git 配置',
    
    // npm 操作类
    '查看已安装包',
    '显示 npm 配置',
    '查看 package.json 内容',
    
    // 系统信息类（只读）
    '显示当前时间',
    '显示系统信息',
    '查看内存使用',
    '查看磁盘使用',
    '显示网络信息',
    '检查系统环境',
    
    // 开发相关
    '运行 typecheck',
    '查看项目结构',
    '列出 src 目录',
    '列出 docs 目录',
    
    // 配置相关
    '查看配置文件',
    '显示当前设置'
  ];

  for (const test of safeNLTests) {
    await runTest(`NL: "${test}"`, ['run', test, '--no-edit', '--dry-run']);
  }

  // ========== 测试汇总 ==========
  console.log('\n' + '='.repeat(80));
  console.log('📊 测试汇总');
  console.log('='.repeat(80));
  console.log(`\n✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`📋 总计: ${passed + failed}`);

  if (failed === 0) {
    console.log(`\n🎉 所有测试通过！VectaHub 1.0.0 运行正常！`);
  } else {
    console.log(`\n⚠️  有 ${failed} 个测试失败，请检查`);
  }

  // 保存测试结果
  const reportPath = path.join(projectRoot, 'docs', 'reports', 'full-user-test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    summary: { passed, failed, total: passed + failed },
    results
  }, null, 2));

  console.log(`\n📝 测试报告已保存: ${reportPath}`);
}

main().catch(console.error);
