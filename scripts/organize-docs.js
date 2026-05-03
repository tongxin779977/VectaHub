#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsDir = path.join(__dirname, '../docs');

console.log('📁 优化文档结构...\n');

// 创建新目录
const newDirs = ['guides', 'reference', 'archive'];
for (const dir of newDirs) {
  const dirPath = path.join(docsDir, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✅ 创建目录: ${dir}/`);
  }
}

console.log('\n📂 移动文档...');

// 移动到 guides/ - 用户指南
const toGuides = [
  'design/05_cli_commands.md'
];

for (const file of toGuides) {
  const src = path.join(docsDir, file);
  const dest = path.join(docsDir, 'guides/cli-commands.md');
  if (fs.existsSync(src)) {
    fs.renameSync(src, dest);
    console.log(`  ${file} → guides/cli-commands.md`);
  }
}

// 移动到 reference/ - 架构参考
const toReference = [
  'design/01_system_architecture.md',
  'design/02_sandbox_design.md',
  'design/06_workflow_engine_design.md'
];

for (const file of toReference) {
  const src = path.join(docsDir, file);
  const dest = path.join(docsDir, 'reference', path.basename(file));
  if (fs.existsSync(src)) {
    fs.renameSync(src, dest);
    console.log(`  ${file} → reference/${path.basename(file)}`);
  }
}

// 移动到 archive/ - 已完成任务
const toArchive = [
  'design/03_implementation_roadmap.md',
  'design/04_agent_tasks.md',
  'design/05_test_tasks.md',
  'design/11_engineering_improvement_plan.md',
  'product/02_feature_planning.md',
  'product/04_next_phase_roadmap.md'
];

for (const file of toArchive) {
  const src = path.join(docsDir, file);
  const dest = path.join(docsDir, 'archive', path.basename(file));
  if (fs.existsSync(src)) {
    fs.renameSync(src, dest);
    console.log(`  ${file} → archive/${path.basename(file)}`);
  }
}

console.log('\n✅ 文档结构优化完成！\n');
console.log('新的文档结构:');
console.log('docs/');
console.log('├── design/');
console.log('├── product/');
console.log('├── guides/');
console.log('├── reference/');
console.log('├── archive/');
console.log('├── reports/');
console.log('└── README.md');
