import { describe, it, expect } from 'vitest';
import {
  parseTasksFromLLMOutput,
  findChunkBoundary,
  splitDocIntoChunks,
  mergeAndDeduplicateDocTasks,
  fallbackParseByRegex,
  parseRoadmapTableTasks,
  DocTask
} from './parse-doc.js';

describe('parseTasksFromLLMOutput', () => {
  it('should parse valid JSON array', () => {
    const output = '[{"id": "1.1", "label": "实现登录"}, {"id": "1.2", "label": "实现注册"}]';
    const tasks = parseTasksFromLLMOutput(output);

    expect(tasks).toHaveLength(2);
    expect(tasks[0].id).toBe('1.1');
    expect(tasks[0].label).toBe('实现登录');
    expect(tasks[1].id).toBe('1.2');
    expect(tasks[1].label).toBe('实现注册');
  });

  it('should parse JSON wrapped in markdown code block', () => {
    const output = '```json\n[{"id": "1", "label": "task"}]\n```';
    const tasks = parseTasksFromLLMOutput(output);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('1');
  });

  it('should parse JSON wrapped in plain code block', () => {
    const output = '```\n[{"id": "2", "label": "task2"}]\n```';
    const tasks = parseTasksFromLLMOutput(output);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('2');
  });

  it('should extract JSON array from surrounding text', () => {
    const output = 'Here are the tasks:\n[{"id": "1.1", "label": "build UI"}]\nDone.';
    const tasks = parseTasksFromLLMOutput(output);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].label).toBe('build UI');
  });

  it('should throw on empty output', () => {
    expect(() => parseTasksFromLLMOutput('')).toThrow('LLM 输出中未找到有效的 JSON 数组');
  });

  it('should throw when no JSON array found', () => {
    expect(() => parseTasksFromLLMOutput('no json here')).toThrow('LLM 输出中未找到有效的 JSON 数组');
  });

  it('should include output preview in error when no JSON array found', () => {
    expect(() => parseTasksFromLLMOutput('This is plain text output')).toThrow(/输出前 200 字符/);
  });

  it('should throw on malformed JSON', () => {
    expect(() => parseTasksFromLLMOutput('[{broken json')).toThrow();
  });

  it('should throw when tasks lack id field', () => {
    const output = '[{"label": "no id"}]';
    expect(() => parseTasksFromLLMOutput(output)).toThrow('每个任务必须包含 id 和 label');
  });

  it('should throw when tasks lack label field', () => {
    const output = '[{"id": "1"}]';
    expect(() => parseTasksFromLLMOutput(output)).toThrow('每个任务必须包含 id 和 label');
  });

  it('should prefer first valid array when multiple candidates exist', () => {
    const output = 'Example: [{"id": "x", "label": "example"}]\nActual: [{"id": "1", "label": "real task"}]';
    const tasks = parseTasksFromLLMOutput(output);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('x');
  });

  it('should handle nested JSON with extra whitespace', () => {
    const output = '  \n  [{"id": "1.1", "label": "  spaced  "}]\n  ';
    const tasks = parseTasksFromLLMOutput(output);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].label).toBe('  spaced  ');
  });
});

describe('findChunkBoundary', () => {
  it('should cut at paragraph boundary (\\n\\n) within search range', () => {
    const content = 'line one\nline two\n\nline three\nline four';
    const boundary = findChunkBoundary(content, 20);
    expect(boundary).toBe(19);
    expect(content.substring(0, boundary)).toBe('line one\nline two\n\n');
  });

  it('should fallback to line boundary (\\n) when no paragraph boundary found', () => {
    const content = 'line one\nline two\nline three\nline four';
    const boundary = findChunkBoundary(content, 20);
    expect(boundary).toBe(18);
    expect(content.substring(0, boundary)).toBe('line one\nline two\n');
  });

  it('should return target position when no boundary found', () => {
    const content = 'this is a very long string with no line breaks at all';
    const boundary = findChunkBoundary(content, 25);
    expect(boundary).toBe(25);
  });

  it('should return target when content is shorter than target', () => {
    const content = 'short';
    const boundary = findChunkBoundary(content, 100);
    expect(boundary).toBe(100);
  });
});

describe('splitDocIntoChunks', () => {
  it('should return single chunk when content is shorter than maxLength', () => {
    const content = 'short document';
    const chunks = splitDocIntoChunks(content, 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('short document');
  });

  it('should split into multiple chunks at paragraph boundaries', () => {
    const paragraph1 = 'paragraph one content here.\n\n';
    const paragraph2 = 'paragraph two content here.\n\n';
    const paragraph3 = 'paragraph three content here.';
    const content = paragraph1 + paragraph2 + paragraph3;
    const maxLen = paragraph1.length + 5;
    const chunks = splitDocIntoChunks(content, maxLen);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]).toBe(paragraph1);
  });

  it('should handle equal length content', () => {
    const content = 'abc\n\ndef';
    const chunks = splitDocIntoChunks(content, content.length);
    expect(chunks).toHaveLength(1);
  });
});

describe('mergeAndDeduplicateDocTasks', () => {
  it('should merge tasks from multiple segments', () => {
    const seg1: DocTask[] = [{ id: '1.1', label: 'task A' }, { id: '1.2', label: 'task B' }];
    const seg2: DocTask[] = [{ id: '1.3', label: 'task C' }];
    const merged = mergeAndDeduplicateDocTasks([seg1, seg2]);
    expect(merged).toHaveLength(3);
  });

  it('should deduplicate by id, keeping first occurrence', () => {
    const seg1: DocTask[] = [{ id: '1.1', label: 'task A' }];
    const seg2: DocTask[] = [{ id: '1.1', label: 'task A duplicate' }, { id: '1.2', label: 'task B' }];
    const merged = mergeAndDeduplicateDocTasks([seg1, seg2]);
    expect(merged).toHaveLength(2);
    expect(merged[0].label).toBe('task A');
  });

  it('should return empty array for empty input', () => {
    const merged = mergeAndDeduplicateDocTasks([]);
    expect(merged).toHaveLength(0);
  });

  it('should handle empty segments', () => {
    const seg1: DocTask[] = [{ id: '1.1', label: 'task' }];
    const seg2: DocTask[] = [];
    const merged = mergeAndDeduplicateDocTasks([seg1, seg2]);
    expect(merged).toHaveLength(1);
  });
});

describe('fallbackParseByRegex', () => {
  it('should match P0-N style heading IDs', () => {
    const content = '### 📋 P0-1：结账与反结账功能\n### 📋 P0-2：凭证号断号管理';
    const tasks = fallbackParseByRegex(content);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].id).toBe('P0-1');
    expect(tasks[0].label).toContain('结账');
    expect(tasks[1].id).toBe('P0-2');
    expect(tasks[1].label).toContain('凭证号');
  });

  it('should match P1-N style heading IDs', () => {
    const content = '### P1-1：辅助核算标签\n### P1-2：置信度阈值配置';
    const tasks = fallbackParseByRegex(content);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].id).toBe('P1-1');
    expect(tasks[1].id).toBe('P1-2');
  });

  it('should still match numeric IDs', () => {
    const content = '### 1.1 实现登录\n### 1.2 实现注册';
    const tasks = fallbackParseByRegex(content);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].id).toBe('1.1');
    expect(tasks[1].id).toBe('1.2');
  });

  it('should match P2-N style heading IDs', () => {
    const content = '### P2-1：自定义报表配置\n### P2-2：结账检查清单';
    const tasks = fallbackParseByRegex(content);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].id).toBe('P2-1');
    expect(tasks[1].id).toBe('P2-2');
  });

  it('should parse roadmap table by status semantics and only keep pending gaps', () => {
    const content = [
      '## 3. 功能路线图',
      '| 功能ID | 模块 | 功能 | 状态 | 说明 |',
      '| --- | --- | --- | --- | --- |',
      '| IMP-001 | M01 | Excel/CSV 上传和预览 | 已有 | 已支持基础上传和预览 |',
      '| IMP-005 | M03 | 标准化数据入账 | 待补 | 增加标准化映射后自动入账 |',
      '| IMP-006 | M03 | 导入任务审计 | 部分 | 已有任务记录，需增强错误行和可追溯详情 |',
      '| M06-001 | M06 | AI 助理 | 暂停 | v8.1 暂不进入范围 |',
      '',
      '## 7. 当前开发优先级',
      '1. 打通 M01 到 M03',
      '2. 完善导入任务错误链路',
      '',
      '## 8. 不进入当前版本的需求',
      '1. AI 自动记账',
    ].join('\n');

    const tasks = fallbackParseByRegex(content);
    const ids = tasks.map(task => task.id);
    const labels = tasks.map(task => task.label).join(' | ');

    expect(ids).toContain('IMP-005');
    expect(ids).toContain('IMP-006');
    expect(ids).toContain('1');
    expect(ids).toContain('2');

    expect(ids).not.toContain('IMP-001');
    expect(ids).not.toContain('M06-001');
    expect(labels).toContain('增强导入任务审计');
    expect(labels).toContain('错误行');
    expect(labels).not.toContain('AI 自动记账');
  });

  it('should keep legacy heading parsing when no roadmap status table exists', () => {
    const content = [
      '## 需求',
      '### P0-1：结账与反结账功能',
      '### P0-2：凭证号断号管理',
      '### 1.1 补充对账入口',
    ].join('\n');
    const tasks = fallbackParseByRegex(content);
    expect(tasks.map(task => task.id)).toEqual(['P0-1', 'P0-2', '1.1']);
  });
});

describe('parseRoadmapTableTasks', () => {
  it('should return detected false when no status table', () => {
    const result = parseRoadmapTableTasks('## 普通需求\n### P0-1: 实现结账');
    expect(result.detected).toBe(false);
    expect(result.tasks).toHaveLength(0);
  });

  it('should skip out-of-scope section tasks in current-version exclusion section', () => {
    const content = [
      '| ID | 功能 | 状态 | 说明 |',
      '| --- | --- | --- | --- |',
      '| IMP-010 | 对账中心 | 待补 | 打通对账闭环 |',
      '',
      '## 不进入当前版本的需求',
      '1. 不应进入任务',
    ].join('\n');
    const result = parseRoadmapTableTasks(content);
    expect(result.detected).toBe(true);
    expect(result.tasks.some(task => task.id === '1')).toBe(false);
    expect(result.tasks.some(task => task.id === 'IMP-010')).toBe(true);
  });

  it('should keep only pending gaps for partial status rows in roadmap-style docs', () => {
    const content = [
      '| 功能ID | 功能 | 状态 | 说明 |',
      '| --- | --- | --- | --- |',
      '| VCH-005 | 审核 / 过账 | 部分 | 需要补强制单人和审核人分离 |',
      '| RPT-004 | 利润表 | 部分 | 已按损益科目汇总，需完善收入/费用映射 |',
      '| AUD-003 | 识别结果确认 | 部分 | 可确认生成后续数据，需增强字段级校验 |',
      '| SYS-006 | 账套 / 项目 | 部分 | 有项目接口，需完善前端体验和隔离校验 |',
    ].join('\n');

    const result = parseRoadmapTableTasks(content);
    expect(result.detected).toBe(true);
    expect(result.tasks).toHaveLength(4);

    const vch = result.tasks.find(task => task.id === 'VCH-005');
    const rpt = result.tasks.find(task => task.id === 'RPT-004');
    const aud = result.tasks.find(task => task.id === 'AUD-003');
    const sys = result.tasks.find(task => task.id === 'SYS-006');

    expect(vch?.label).toContain('制单人和审核人分离');
    expect(rpt?.label).toContain('收入/费用映射');
    expect(aud?.label).toContain('字段级校验');
    expect(sys?.label).toContain('前端体验和隔离校验');

    expect(vch?.label).not.toContain('已有');
    expect(rpt?.label).not.toContain('已按');
    expect(aud?.label).not.toContain('可确认');
    expect(sys?.label).not.toContain('有项目接口');
  });

  it('should exclude existing roadmap items and keep only partial gaps in real roadmap style', () => {
    const content = [
      '## 3. P0 主流程能力',
      '### M01 数据接入',
      '| 功能 ID | 功能 | 状态 | 说明 |',
      '| --- | --- | --- | --- |',
      '| IMP-001 | Excel/CSV 上传和预览 | 已有 | 支持文件解析、表头和样例预览 |',
      '| IMP-005 | 标准化数据入账 | 待补 | 有效行需要进入草稿凭证或标准化待确认池 |',
      '| IMP-006 | 导入任务审计 | 部分 | 已有任务记录，需增强错误行和可追溯详情 |',
      '',
      '### M03 凭证引擎',
      '| 功能 ID | 功能 | 状态 | 说明 |',
      '| --- | --- | --- | --- |',
      '| VCH-001 | 凭证生成 | 已有 | 支持根据数据生成凭证头和分录 |',
      '| VCH-005 | 审核 / 过账 | 部分 | 需要补强制单人和审核人分离 |',
      '',
      '### M05 对账引擎',
      '| 功能 ID | 功能 | 状态 | 说明 |',
      '| --- | --- | --- | --- |',
      '| REC-001 | 对账任务管理 | 已有 | 支持创建、查询、删除任务 |',
      '',
      '### 系统与基础能力',
      '| 功能 ID | 功能 | 状态 | 说明 |',
      '| --- | --- | --- | --- |',
      '| SYS-001 | 首次配置向导 | 已有 | 支持初始化配置 |',
    ].join('\n');

    const result = parseRoadmapTableTasks(content);
    const ids = result.tasks.map(task => task.id);
    const vch = result.tasks.find(task => task.id === 'VCH-005');

    expect(result.detected).toBe(true);
    expect(ids).toContain('IMP-005');
    expect(ids).toContain('IMP-006');
    expect(ids).toContain('VCH-005');
    expect(ids).not.toContain('IMP-001');
    expect(ids).not.toContain('VCH-001');
    expect(ids).not.toContain('REC-001');
    expect(ids).not.toContain('SYS-001');
    expect(vch?.label).toContain('制单人和审核人分离');
  });
});
