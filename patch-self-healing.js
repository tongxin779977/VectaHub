import fs from 'node:fs';

const filePath = 'src/commands/run.ts';
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add import
if (!code.includes('../commands/self-healing.js')) {
  code = code.replace(
    "import { createRecordManager } from '../execution/record-manager.js';",
    "import { createRecordManager } from '../execution/record-manager.js';\nimport { runSelfHealingLoop } from './self-healing.js';"
  );
}

// 2. Wrap execution in a retry loop
const startExecutionStr = "logger.info('执行工作流...');";
const endExecutionStr = "if (result.status === 'FAILED') {\n        process.exit(1);\n      }";

const startIndex = code.indexOf(startExecutionStr);
const endIndex = code.indexOf(endExecutionStr) + endExecutionStr.length;

if (startIndex !== -1 && endIndex !== -1) {
    const originalExecutionBlock = code.substring(startIndex, endIndex);
    
    const newExecutionBlock = `
      let shouldRetry = true;
      while (shouldRetry) {
        shouldRetry = false;
        logger.info('执行工作流...');
        const mode = options.mode || 'relaxed';
        const result = await workflowEngine.execute(workflow!, { 
          mode: mode as any, 
          dryRun: options.dryRun,
          onProgress: createProgressCallback(workflow!.steps.length),
        });

        const recordManager = createRecordManager();
        const metadata: ExecutionMetadata = {
          source: options.file ? 'file' : 'nl',
          nlInput: options.file ? undefined : (intent.length > 0 ? intent.join(' ') : undefined),
          sourceFile: options.file ? path.resolve(options.file) : undefined,
          cwd: process.cwd(),
        };
        const recordToSave: Record<string, unknown> = { ...result };
        recordToSave.startedAt = (recordToSave.startedAt as Date).toISOString();
        if (recordToSave.endedAt) {
          recordToSave.endedAt = (recordToSave.endedAt as Date).toISOString();
        }
        recordToSave.metadata = metadata as unknown as Record<string, unknown>;
        await recordManager.save(recordToSave as unknown as ExecRecord);

        logger.info(\`\\n执行\${result.status === 'COMPLETED' ? '✅ 成功' : '❌ 失败'}\`);
        logger.info(\`耗时: \${result.duration}ms\`);

        if (result.steps.length > 0) {
          logger.info('\\n📊 步骤结果:');
          for (const step of result.steps) {
            logger.info(\`  \${step.stepId}: \${step.status}\`);
            if (step.output && step.output.length > 0) {
              logger.info(\`  输出:\`);
              for (const line of step.output) {
                logger.info(\`    \${String(line).trim()}\`);
              }
            }
            if (step.error) {
              logger.error(\`  错误: \${step.error}\`);
            }
          }
        }

        if (result.status === 'FAILED') {
          const llmConfig = createLLMConfig();
          if (llmConfig && !options.dryRun) {
            shouldRetry = await runSelfHealingLoop(result, workflow!, llmConfig);
            if (shouldRetry) {
              logger.info('🔄 正在重试工作流...');
              continue;
            }
          }
          process.exit(1);
        }
        break;
      }
    `;
    
    // We need to replace ALL occurrences of this block because run.ts has two (one for NL, one for File)
    // Actually my patch made it so it's a bit messy. Let's just do a global replace if they are identical.
    
    // To be safe, let's use a simpler approach: replace the specific failed block.
    code = code.split(originalExecutionBlock).join(newExecutionBlock);
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully integrated self-healing into run.ts');
