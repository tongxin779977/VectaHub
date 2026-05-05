/**
 * Chinese action verbs used by the intent splitter to determine
 * whether a connector (和/并/再/后/and) should split the input
 * into multiple intents or just connect parameters.
 *
 * These verbs are automatically extracted from intent templates'
 * core-tier weighted keywords at build time, but this fallback
 * list ensures the splitter works even without template injection.
 */
export const CHINESE_ACTION_VERBS = [
  // Git
  '提交', '推送', '拉取', '合并', '暂存', '切换', 'rebase',
  // File operations
  '创建', '新建', '查找', '找出', '搜索', '比较', '对比',
  '修改', '删除', '复制', '移动', '压缩', '解压',
  // Execution
  '运行', '执行', '构建', '启动', '安装', '测试',
  // Info/query
  '查看', '显示', '列出', '看看', '获取', '检查',
  // System/Network
  '监控', 'ping', '测试连通',
  // Social/Data
  '爬取', '抓取', '采集', '提取', '下载', '上传',
  // Other
  '发送', '接收', '打开', '关闭',
];

/**
 * Short connectors that require context-aware splitting.
 * The splitter checks if text before/after contains action verbs
 * before deciding to split.
 */
export const SHORT_CONNECTORS_PATTERN = /(?:和|并|再|后|and|then|also)/gi;

/**
 * Unconditional connectors - always split when matched.
 */
export const UNCONDITIONAL_CONNECTORS = [
  { pattern: /然后帮我|再帮我|并帮我/g, display: '然后帮我' },
  { pattern: /然后/g, display: '然后' },
  { pattern: /接着/g, display: '接着' },
  { pattern: /之后/g, display: '之后' },
  { pattern: /并且/g, display: '并且' },
];

/**
 * Check if text contains any action verbs.
 */
export function containsActionVerb(text: string): boolean {
  for (const verb of CHINESE_ACTION_VERBS) {
    if (text.includes(verb)) return true;
  }
  return false;
}

/**
 * Check if text is a short noun phrase (likely a parameter list item, not an intent).
 */
export function isShortNounPhrase(text: string, maxLength: number = 12): boolean {
  return text.trim().length <= maxLength && !containsActionVerb(text);
}
