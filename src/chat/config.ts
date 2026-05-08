// src/chat/config.ts
export interface ChatConfig {
  // 日志配置
  logLevel: 'quiet' | 'normal' | 'verbose' | 'debug';

  // 执行配置
  executeMode: 'manual' | 'confirm' | 'auto';

  // 显示配置
  showWorkflowSummary: boolean;
  showWorkflowSteps: boolean;
  showWorkflowYAML: boolean;
  showIntentDetails: boolean;

  // 命令配置
  enableCommandBridge: boolean;
  commandBridgePrefix: '/' | '!';

  // Skill 扫描配置
  enableSkillScan: boolean;
  skillScanOnError: boolean;
}

// 默认配置
export const defaultConfig: ChatConfig = {
  logLevel: 'normal',
  executeMode: 'manual',
  showWorkflowSummary: true,
  showWorkflowSteps: true,
  showWorkflowYAML: false,
  showIntentDetails: false,
  enableCommandBridge: true,
  commandBridgePrefix: '/',
  enableSkillScan: true,
  skillScanOnError: true,
};
