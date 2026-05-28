/**
 * YAML 第三方依赖封装层。
 * 将 `yaml` 库的调用隔离到此模块，业务代码不应直接 import yaml。
 * 内置解析缓存，对相同 YAML 输入直接返回缓存结果。
 * @module chat/yaml-parser
 */
import YAML from 'yaml';
import { SimpleCache } from './utils.js';

/** YAML 解析缓存 TTL（毫秒），60 秒 */
const YAML_CACHE_TTL_MS = 60_000;

/** YAML 解析缓存最大容量 */
const YAML_CACHE_MAX_SIZE = 100;

/** 模块级 YAML 解析缓存 */
const yamlCache = new SimpleCache<unknown>(YAML_CACHE_TTL_MS, YAML_CACHE_MAX_SIZE);

/**
 * 解析 YAML 字符串并返回强类型结果。
 * 内置缓存机制：相同输入在 TTL 内直接返回缓存的解析结果。
 *
 * @typeParam T - 解析后期望的类型
 * @param input - YAML 格式字符串
 * @returns 解析后的对象
 * @throws 当 YAML 格式无效时抛出 `Error`
 *
 * @example
 * ```ts
 * const data = parseYAML<{ steps: unknown[] }>('steps:\n  - id: s1');
 * ```
 */
export function parseYAML<T = unknown>(input: string): T {
  const cached = yamlCache.get(input);
  if (cached !== undefined) {
    return cached as T;
  }

  const result = YAML.parse(input) as T;
  yamlCache.set(input, result);
  return result;
}

/**
 * 清空 YAML 解析缓存。
 * 在测试或配置变更时调用。
 */
export function clearYAMLCache(): void {
  yamlCache.clear();
}
