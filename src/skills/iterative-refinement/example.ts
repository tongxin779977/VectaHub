import { createIterativeRefinementSkill } from './index.js';

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
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           递归自我改进 Skill 使用示例                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const skill = createIterativeRefinementSkill({
    maxAttempts: 4,
    initialBackoff: 500,
    backoffMultiplier: 1.5,
    triggerAnalysisAfter: 2,
    enableAutoFix: true,
  });

  console.log('配置:', skill.getConfig());
  console.log();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('示例 1: 文件不存在错误 (会触发 5Whys 分析)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const result1 = await skill.execute(exampleFlakyTask, {
    taskId: 'example_task_001',
    callbacks: {
      onAttempt: (attempt, context) => {
        console.log(`[尝试 ${attempt}/${context.maxAttempts}] 执行中...`);
      },
      onSuccess: (result) => {
        console.log('\n🎉 任务成功!');
        console.log(`   总尝试次数: ${result.totalAttempts}`);
        console.log(`   耗时: ${(result.duration / 1000).toFixed(2)}秒`);
      },
      onFailure: (result) => {
        console.log('\n❌ 任务失败');
        console.log(`   总尝试次数: ${result.totalAttempts}`);
        console.log(`   最终错误: ${result.finalError}`);
      },
    },
  });

  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('示例 2: 网络连接错误');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const result2 = await skill.execute(exampleNetworkTask, {
    taskId: 'example_task_002',
  });

  console.log('\n最终结果:');
  console.log('成功:', result2.success);
  console.log('尝试次数:', result2.totalAttempts);
  if (result2.result) {
    console.log('返回值:', result2.result);
  }
  if (result2.finalError) {
    console.log('错误:', result2.finalError);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main, exampleFlakyTask, exampleNetworkTask };
