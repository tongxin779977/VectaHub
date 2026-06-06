import { createIterativeRefinementSkill } from './index.js';
import { format } from 'node:util';

interface ExampleOutput {
  log(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
}

const exampleOutput: ExampleOutput = {
  log: (message?: unknown, ...optionalParams: unknown[]) => {
    const rendered = message === undefined && optionalParams.length === 0
      ? ''
      : format(message, ...optionalParams);
    process.stdout.write(`${rendered}\n`);
  },
  error: (message?: unknown, ...optionalParams: unknown[]) => {
    const rendered = message === undefined && optionalParams.length === 0
      ? ''
      : format(message, ...optionalParams);
    process.stderr.write(`${rendered}\n`);
  },
};

async function exampleFlakyTask(): Promise<string> {
  const random = Math.random();
  if (random < 0.7) {
    throw new Error('ENOENT: no such file or directory, open \'missing.txt\'');
  }
  return 'Task succeeded!';
}

async function exampleNetworkTask(): Promise<string> {
  const random = Math.random();
  if (random < 0.6) {
    throw new Error('connection refused: could not connect to server');
  }
  return 'Network request succeeded!';
}

async function main() {
  exampleOutput.log('╔════════════════════════════════════════════════════════════╗');
  exampleOutput.log('║           递归自我改进 Skill 使用示例                     ║');
  exampleOutput.log('╚════════════════════════════════════════════════════════════╝\n');

  const skill = createIterativeRefinementSkill({
    maxAttempts: 4,
    initialBackoff: 500,
    backoffMultiplier: 1.5,
    triggerAnalysisAfter: 2,
    enableAutoFix: true,
  });

  exampleOutput.log('配置:', skill.getConfig());
  exampleOutput.log();

  exampleOutput.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  exampleOutput.log('示例 1: 文件不存在错误 (会触发 5Whys 分析)');
  exampleOutput.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await skill.execute(exampleFlakyTask, {
    taskId: 'example_task_001',
    callbacks: {
      onAttempt: (attempt, context) => {
        exampleOutput.log(`[尝试 ${attempt}/${context.maxAttempts}] 执行中...`);
      },
      onSuccess: (result) => {
        exampleOutput.log('\n🎉 任务成功!');
        exampleOutput.log(`   总尝试次数: ${result.totalAttempts}`);
        exampleOutput.log(`   耗时: ${(result.duration / 1000).toFixed(2)}秒`);
      },
      onFailure: (result) => {
        exampleOutput.log('\n❌ 任务失败');
        exampleOutput.log(`   总尝试次数: ${result.totalAttempts}`);
        exampleOutput.log(`   最终错误: ${result.finalError}`);
      },
    },
  });

  exampleOutput.log();
  exampleOutput.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  exampleOutput.log('示例 2: 网络连接错误');
  exampleOutput.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const result2 = await skill.execute(exampleNetworkTask, {
    taskId: 'example_task_002',
  });

  exampleOutput.log('\n最终结果:');
  exampleOutput.log('成功:', result2.success);
  exampleOutput.log('尝试次数:', result2.totalAttempts);
  if (result2.result) {
    exampleOutput.log('返回值:', result2.result);
  }
  if (result2.finalError) {
    exampleOutput.log('错误:', result2.finalError);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    exampleOutput.error(error);
  });
}

export { main, exampleFlakyTask, exampleNetworkTask };
