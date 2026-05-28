/**
 * YAML 第三方依赖封装层。
 * 将 `yaml` 库的调用隔离到此模块，业务代码不应直接 import yaml。
 * @module chat/yaml-parser
 */
import YAML from 'yaml';

/**
 * 解析 YAML 字符串并返回强类型结果。
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
  return YAML.parse(input) as T;
}
