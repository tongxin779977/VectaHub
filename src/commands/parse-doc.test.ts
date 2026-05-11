import { describe, it, expect } from 'vitest';
import { parseTasksFromLLMOutput, findChunkBoundary, splitDocIntoChunks, mergeAndDeduplicateDocTasks, DocTask } from './parse-doc.js';

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
