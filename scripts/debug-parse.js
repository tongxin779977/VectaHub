#!/usr/bin/env node
import { createNLParser } from './src/nl/parser.js';

const parser = createNLParser();
const input = '提交当前修改，消息是修复 LLM 集成测试问题';

console.log('测试输入:', input);
console.log();

const result = parser.parseToTaskList(input);
console.log('解析结果:', JSON.stringify(result, null, 2));
