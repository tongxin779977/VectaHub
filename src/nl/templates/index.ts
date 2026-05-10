export interface IntentTemplate {
  intent: string;
  category: string;
  patterns: RegExp[];
  examples: string[];
  priority: number;
  weight?: number;
  requiredParams?: string[];
  requiredContext?: string[];
  name?: string;
  description?: string;
  params?: Array<{ name: string; type: string; description: string; required: boolean }>;
}

export const INTENT_TEMPLATES: IntentTemplate[] = [
  {
    intent: 'workflow_generate',
    name: 'workflow_generate',
    description: 'Generate a VectaHub workflow YAML from natural language',
    category: 'workflow',
    patterns: [/workflow|generate|create.*workflow|build.*pipeline|yaml/i],
    examples: ['Generate a CI/CD pipeline', 'Create a workflow for deployment'],
    priority: 1,
  },
  {
    intent: 'workflow_run',
    name: 'workflow_run',
    description: 'Run or execute an existing workflow or CI pipeline',
    category: 'workflow',
    patterns: [/run.*workflow|execute.*pipeline|trigger.*ci/i],
    examples: ['Run the workflow', 'Execute the CI pipeline'],
    priority: 2,
  },
  {
    intent: 'doctor',
    name: 'doctor',
    description: 'Run system health check and diagnostics',
    category: 'system',
    patterns: [/doctor|health.*check|system.*check|诊断|检查.*健康/i],
    examples: ['Run doctor', 'Check system health'],
    priority: 1,
  },
  {
    intent: 'self_healing',
    name: 'self_healing',
    description: 'Run self-healing to auto-fix detected issues',
    category: 'system',
    patterns: [/self.?heal|auto.?fix|auto.?repair|自愈|自动.*修复/i],
    examples: ['Run self-healing', 'Auto fix issues'],
    priority: 1,
  },
  {
    intent: 'file_find',
    name: 'file_find',
    description: 'Find files matching a glob pattern',
    category: 'file',
    patterns: [/find.*file|search.*file|locate.*file|look.*for.*file|文件.*查找|搜索.*文件/i],
    examples: ['Find files matching a pattern', 'Search for config files'],
    priority: 3,
    requiredParams: ['glob'],
    params: [{ name: 'glob', type: 'string', description: 'Glob pattern to match files', required: true }],
  },
  {
    intent: 'file_read',
    name: 'file_read',
    description: 'Read and display file contents',
    category: 'file',
    patterns: [/read.*file|show.*file|open.*file|查看.*文件|读取.*文件/i],
    examples: ['Read a file', 'Show file contents'],
    priority: 3,
    requiredParams: ['file'],
    params: [{ name: 'file', type: 'string', description: 'Path to the file to read', required: true }],
  },
  {
    intent: 'file_edit',
    name: 'file_edit',
    description: 'Edit or modify a file',
    category: 'file',
    patterns: [/edit.*file|modify.*file|change.*file|update.*file|编辑.*文件|修改.*文件/i],
    examples: ['Edit a file', 'Modify source code'],
    priority: 3,
    requiredParams: ['file'],
    params: [{ name: 'file', type: 'string', description: 'Path to the file to edit', required: true }],
  },
  {
    intent: 'git_push',
    name: 'git_push',
    description: 'Push local commits to a remote repository',
    category: 'git',
    patterns: [/push|git.*push|upload.*commit|推送/i],
    examples: ['Push changes', 'Git push to origin'],
    priority: 2,
    requiredParams: ['remote', 'branch'],
    params: [
      { name: 'remote', type: 'string', description: 'Remote name (e.g. origin)', required: true },
      { name: 'branch', type: 'string', description: 'Branch name to push', required: true },
    ],
  },
  {
    intent: 'git_pull',
    name: 'git_pull',
    description: 'Pull latest changes from a remote repository',
    category: 'git',
    patterns: [/pull|git.*pull|fetch.*merge|拉取/i],
    examples: ['Pull latest changes', 'Git pull from origin'],
    priority: 2,
    requiredParams: ['remote', 'branch'],
    params: [
      { name: 'remote', type: 'string', description: 'Remote name (e.g. origin)', required: true },
      { name: 'branch', type: 'string', description: 'Branch name to pull', required: true },
    ],
  },
  {
    intent: 'git_commit',
    name: 'git_commit',
    description: 'Stage and commit changes with a message',
    category: 'git',
    patterns: [/commit|git.*commit|提交.*代码|暂存.*提交/i],
    examples: ['Commit changes', 'Create a git commit'],
    priority: 2,
    requiredContext: ['gitInitialized'],
    params: [{ name: 'message', type: 'string', description: 'Commit message', required: false }],
  },
  {
    intent: 'git_merge',
    name: 'git_merge',
    description: 'Merge a branch into the current branch',
    category: 'git',
    patterns: [/merge|git.*merge|合并.*分支/i],
    examples: ['Merge branches', 'Git merge feature branch'],
    priority: 2,
    params: [{ name: 'branch', type: 'string', description: 'Branch to merge', required: false }],
  },
  {
    intent: 'git_branch',
    name: 'git_branch',
    description: 'Create or switch git branches',
    category: 'git',
    patterns: [/branch|git.*branch|create.*branch|switch.*branch|创建.*分支|切换.*分支/i],
    examples: ['Create a new branch', 'Switch branches'],
    priority: 2,
    params: [{ name: 'branch', type: 'string', description: 'Branch name', required: false }],
  },
  {
    intent: 'ci_diagnose',
    name: 'ci_diagnose',
    description: 'Diagnose CI/CD pipeline failures and identify root cause',
    category: 'ci',
    patterns: [/ci.*fail|pipeline.*fail|build.*fail|ci.*error|pipeline.*error|diagnose.*ci|诊断.*ci|流水线.*失败|构建.*失败/i],
    examples: ['Diagnose CI failure', 'Check why the pipeline failed'],
    priority: 2,
  },
  {
    intent: 'ci_rerun',
    name: 'ci_rerun',
    description: 'Rerun a failed CI/CD pipeline',
    category: 'ci',
    patterns: [/rerun.*ci|retry.*pipeline|restart.*build|重新.*运行|重试.*ci/i],
    examples: ['Rerun the CI pipeline', 'Retry the failed build'],
    priority: 2,
  },
  {
    intent: 'tool_discover',
    name: 'tool_discover',
    description: 'Discover available CLI tools in the environment',
    category: 'tool',
    patterns: [/discover.*tool|detect.*tool|scan.*tool|find.*tool|发现.*工具|检测.*工具/i],
    examples: ['Discover available tools', 'Detect installed tools'],
    priority: 3,
  },
  {
    intent: 'tool_run',
    name: 'tool_run',
    description: 'Run a specific CLI tool with arguments',
    category: 'tool',
    patterns: [/run.*tool|execute.*tool|use.*tool|运行.*工具|执行.*工具/i],
    examples: ['Run a tool', 'Execute linter'],
    priority: 3,
    requiredParams: ['toolName'],
    params: [
      { name: 'toolName', type: 'string', description: 'Name of the tool to run', required: true },
      { name: 'args', type: 'string', description: 'Arguments to pass to the tool', required: false },
    ],
  },
  {
    intent: 'session_list',
    name: 'session_list',
    description: 'List all active sessions',
    category: 'system',
    patterns: [/list.*session|show.*session|view.*session|session.*list|查看.*会话|列出.*会话/i],
    examples: ['List sessions', 'Show recent sessions'],
    priority: 3,
  },
  {
    intent: 'session_inspect',
    name: 'session_inspect',
    description: 'Inspect details of a specific session',
    category: 'system',
    patterns: [/inspect.*session|view.*session.*detail|session.*info|检查.*会话|查看.*会话.*详情/i],
    examples: ['Inspect a session', 'View session details'],
    priority: 3,
    params: [{ name: 'sessionId', type: 'string', description: 'Session ID to inspect', required: false }],
  },
  {
    intent: 'QUERY_INFO',
    name: 'QUERY_INFO',
    description: 'Query information or answer questions about the project, codebase, or system',
    category: 'query',
    patterns: [/\bwhat\b.*\b(is|are|does|do)\b|\bhow\b.*\b(does|do|can|to)\b|查询.*信息|查看.*状态|获取.*详情/i],
    examples: ['What is the project structure?', 'How does the CI pipeline work?', '查询当前系统状态'],
    priority: 1,
  },
  {
    intent: 'vscode_diagnostic',
    name: 'vscode_diagnostic',
    description: 'Retrieve VS Code diagnostics including lint errors and code issues',
    category: 'vscode',
    patterns: [/vscode.*diagnostic|lint.*error|code.*issue|诊断.*vscode|代码.*错误|检查.*问题/i],
    examples: ['Show VS Code diagnostics', 'Get lint errors', '查看代码诊断'],
    priority: 2,
  },
  {
    intent: 'self_healing_run',
    name: 'self_healing_run',
    description: 'Auto-retry and fix based on last failed command logs',
    category: 'system',
    patterns: [/self.?healing.?run|auto.?retry|auto.?fix.*failed|重试.*失败|自动.*修复.*失败/i],
    examples: ['Run self-healing on failed command', 'Auto retry and fix', '自动重试并修复失败命令'],
    priority: 1,
  },
];

export function getAllIntentNames(): string[] {
  return INTENT_TEMPLATES.map(t => t.intent);
}

export function getTemplateForIntent(intent: string): IntentTemplate | undefined {
  return INTENT_TEMPLATES.find(t => t.intent === intent);
}

export function buildKeywordSummary(): string {
  return INTENT_TEMPLATES.map(t => `${t.intent}:\n  examples: ${t.examples.join(', ')}`).join('\n\n');
}
