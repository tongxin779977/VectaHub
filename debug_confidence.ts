import { createCoordinator, createMatchingPipeline } from './src/nl/core/index.js';
import { INTENT_TEMPLATES } from './src/nl/templates/index.js';
import { adaptAllTemplates } from './src/nl/core/adapter.js';

const patterns = adaptAllTemplates(INTENT_TEMPLATES);
const coordinator = createCoordinator(patterns);
const pipeline = createMatchingPipeline();

const testCases = [
  '查找文件',
  '创建新文件',
  '打包目录',
  '修改权限',
  '安装依赖',
  '构建项目',
  '查看系统信息',
  '提交代码',
  '查看热榜',
  '比较文件',
  '监控cpu',
  '网络状态',
  '查看当前目录',
];

console.log('=== Coordinator Results ===');
for (const input of testCases) {
  const result = coordinator.match(input);
  const primary = result.intents[0];
  const flag = primary.confidence < 0.7 ? ' ⚠️ LOW' : '';
  console.log(`"${input}" → ${primary.intent} (confidence: ${primary.confidence.toFixed(4)})${flag}`);
}

console.log('\n=== Pipeline Results (all patterns) ===');
for (const input of testCases) {
  const result = pipeline.match(input, patterns);
  const flag = result.confidence < 0.7 && result.intent !== 'UNKNOWN' ? ' ⚠️ LOW' : '';
  console.log(`"${input}" → ${result.intent} (confidence: ${result.confidence.toFixed(4)})${flag}`);
  if (result.matchedKeywords?.length > 0) {
    console.log(`  keywords: ${result.matchedKeywords.join(', ')}`);
  }
  if (result.matchedPhrases?.length > 0) {
    console.log(`  phrases: ${result.matchedPhrases.join(', ')}`);
  }
  if (result.triggeredNegatives?.length > 0) {
    console.log(`  negatives: ${result.triggeredNegatives.join(', ')}`);
  }
}
