import fs from 'node:fs';

const filePath = 'src/commands/run.ts';
let code = fs.readFileSync(filePath, 'utf8');

const startStr = '} else if (intent.length > 0) {';
const endStr = '} else {\n        logger.error(\'❌ 请提供自然语言描述或使用 --file 选项指定工作流文件\');';

const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr);

if (startIndex === -1 || endIndex === -1) {
  console.error('Cannot find block to replace', { startIndex, endIndex });
  process.exit(1);
}

const newBlock = `} else if (intent.length > 0) {
        const text = intent.join(' ');
        logger.info(\`解析意图: "\${text}"\`);

        const llmConfig = createLLMConfig();
        const useLLM = !!llmConfig;

        let steps: Step[] = [];

        if (useLLM && llmConfig) {
          logger.info(\`意图解析: LLM Tool Calling (provider=\${llmConfig.provider}, model=\${llmConfig.model})\`);
          const llmClient = new LLMClient(llmConfig);
          const tools = buildToolsFromTemplates();
          
          try {
            const llmResponse = await llmClient.complete('intent-parser-v1', text, {}, { tools, toolChoice: 'auto' });
            
            if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
              const toolCall = llmResponse.tool_calls[0];
              const parsed = convertToolCallToSteps(toolCall);
              if (parsed) {
                logger.info(\`意图: \${parsed.intent}\`);
                steps = parsed.steps;
              } else {
                logger.error(\`❌ 无法解析 Tool Call: \${toolCall.function.name}\`);
              }
            } else if (llmResponse.intent !== 'UNKNOWN') {
              logger.info(\`💡 LLM 识别为普通意图: \${llmResponse.intent}\`);
              if (llmResponse.workflow?.steps) {
                 steps = llmResponse.workflow.steps as unknown as Step[];
              }
            } else {
              logger.info('💡 LLM 无法识别操作意图，请描述具体的开发任务。');
              process.exit(1);
            }
          } catch (e) {
            logger.error(\`❌ LLM 请求失败: \${e}\`);
            process.exit(1);
          }
        } else {
          logger.info(\`意图解析: 规则匹配 (降级)\`);
          const { registry, executor } = createSkillSystem({ llmConfig });
          const patterns = adaptAllTemplates(INTENT_TEMPLATES);
          const keywordFallback = createKeywordFallback(patterns);
          const nlProcessor = createNLProcessor(registry, keywordFallback, { confidenceThreshold: 0.7, executor });
          
          const nlResult = await nlProcessor.parse({ input: text, options: { useLLM: false } });
          const matchedIntent = nlResult.intent || nlResult.taskList?.intent || 'UNKNOWN';
          logger.info(\`意图: \${matchedIntent}\`);
          
          if (nlResult.taskList && nlResult.taskList.tasks.length > 0) {
            let stepIndex = 1;
            for (const task of nlResult.taskList.tasks) {
              const commands = task.commands.length > 0 ? task.commands : [{ cli: 'echo', args: [] }];
              for (const cmd of commands) {
                steps.push({
                  id: \`step_\${stepIndex}\`,
                  type: 'exec' as const,
                  cli: cmd.cli,
                  args: (cmd.args || []).filter((arg): arg is string => arg !== undefined && arg !== ''),
                });
                stepIndex++;
              }
            }
          } else {
             logger.error('❌ 无法解析意图，请尝试更明确的输入！');
             process.exit(1);
          }
        }

        if (steps.length === 0) {
          logger.info(\`💡 没有可执行的命令步骤。\`);
          process.exit(1);
        }

        if (options.dryRun) {
          logger.info('\\n📋 将要执行的命令:');
          for (const s of steps) {
            logger.info(\`  \${s.cli} \${(s.args ?? []).join(' ')}\`);
          }
          process.exit(0);
        }

        workflow = await workflowEngine.createWorkflow(
          \`intent_\${Date.now()}\`,
          steps
        );

        logger.info(\`创建工作流，包含 \${steps.length} 个步骤\`);

        if (options.save) {
          await storage.saveWorkflow(workflow);
          logger.info('工作流已保存');
        }
      `;

const finalCode = code.substring(0, startIndex) + newBlock + code.substring(endIndex);
fs.writeFileSync(filePath, finalCode, 'utf8');
console.log('Successfully patched run.ts');
