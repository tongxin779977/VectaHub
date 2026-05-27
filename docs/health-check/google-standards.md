# 谷歌工程规范条例

本文档列出评估时必须对照的谷歌工程规范核心条例。所有条例分为三大类：代码设计原则、TypeScript 风格规范、第三方依赖规范。

## 一、代码设计原则

来源：[Google Engineering Practices - Code Review](https://github.com/google/eng-practices)

### G-01 设计优先

**条例**：代码评审最重要的是整体设计。变更中各个部分的代码交互是否正常？整个改动是否属于当前代码库？是否和系统中其他部分交互正常？

**检查要点**：
- 模块间的交互是否合理
- 是否引入了不必要的耦合
- 设计模式是否与项目既有模式一致
- 是否过度设计（增加当前不需要的功能）

### G-02 功能正确性

**条例**：代码必须对用户（实际用户 + 未来开发者）有用。评审者应站在用户角度确保代码没有 bug。

**检查要点**：
- 核心功能是否正确实现
- 是否考虑了并发场景（死锁、资源争抢）
- 是否处理了边界条件和特殊情况
- 是否有功能性 demo 或测试证明

### G-03 复杂度控制

**条例**：变更是否比预期的更复杂？代码阅读者能否快速理解代码？开发者尝试调用或修改此代码时是否会引入 bug？

**检查要点**：
- 单个函数是否超过 50 行
- 单个文件是否超过 300 行
- 嵌套深度是否超过 4 层
- 是否存在过度设计（为未来需求预留的抽象）
- 圈复杂度是否在合理范围（< 10）

### G-04 测试完备性

**条例**：变更必须包含测试。测试必须正确、合理、有用。测试本身无法测试自己，必须确保测试有效。

**检查要点**：
- 是否有对应的测试文件
- 每个测试是否有明确的断言
- 是否只测试了 happy path
- 测试是否独立不互相依赖
- 代码出问题时测试是否会失败
- 代码改动时测试是否会误报

### G-05 命名清晰性

**条例**：好的命名要能够充分表达一个项是什么或者用来做什么，但又不至于让人难以阅读。

**检查要点**：
- 变量名是否表达意图（避免 `data`, `temp`, `obj` 等模糊命名）
- 函数名是否描述行为（动词开头）
- 类名是否描述职责（名词）
- 常量是否使用 UPPER_SNAKE_CASE
- 布尔变量是否使用 `is`, `has`, `can` 前缀

### G-06 注释解释"为什么"

**条例**：注释应该解释清楚**为什么这么做**，而不是*做了什么*。如果代码不清晰，不能清楚地解释自己，那么代码可以写的更简单。

**检查要点**：
- 注释是否解释了决策原因
- 是否有描述代码行为的冗余注释
- 复杂算法是否有解释性注释
- 正则表达式是否有解释性注释
- 是否有标记为 `TODO`, `FIXME`, `HACK` 的注释

### G-07 文档同步

**条例**：如果变更改变了用户构建、测试、交互或者发布代码相关的逻辑，检测是否也更新了相关文档。

**检查要点**：
- 接口变更是否更新了 JSDoc
- 行为变更是否更新了 README
- 配置变更是否更新了配置文档
- 弃用功能是否标记了 `@deprecated`

### G-08 上下文感知

**条例**：必须在系统上下文中审视代码。不要通过哪些会损害系统健康的代码。很多系统变复杂都是因为一点一点的小改动日积月累造成的。

**检查要点**：
- 变更是否提升了系统健康度
- 是否引入了不必要的复杂性
- 是否与系统其他部分的风格一致
- 是否有可以复用的既有代码

### G-09 持续提升而非完美

**条例**：代码评审者不应该要求开发者打磨好每个细节才予以通过。评审者应该权衡项目进度和建议的重要性，追求**持续提高**，而不是追求完美。

**检查要点**：
- 是否有可以标记为后续改进的问题
- 是否阻断了有价值的变更
- 是否在追求完美中延误了交付

## 二、TypeScript 风格规范

来源：[Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)

### TS-01 命名导出优先

**条例**：必须使用 named exports，禁止 default exports。

**理由**：
- default exports 没有规范名称，维护困难
- named exports 在导入不存在的符号时会报错
- default exports 鼓励将所有内容放入一个大对象

```typescript
// ✅ 正确
export class Foo { ... }
export function bar() { ... }

// ❌ 错误
export default class Foo { ... }
```

### TS-02 可见性最小化

**条例**：尽可能限制符号的可见性。只导出模块外部需要的符号。

**检查要点**：
- 是否导出了不需要的内部类型
- 是否导出了不需要的内部函数
- 模块的公共 API 表面是否最小化

### TS-03 禁止可变导出

**条例**：不允许 `export let`。需要外部可变绑定时使用 getter 函数。

```typescript
// ❌ 错误
export let foo = 3;

// ✅ 正确
let foo = 3;
export function getFoo() { return foo; }
```

### TS-04 类型推断优先

**条例**：优先使用类型推断，而非冗余的类型标注。但函数参数和返回值应显式标注类型。

```typescript
// ❌ 冗余
const x: number = 3;
const arr: string[] = ['a', 'b'];

// ✅ 推断
const x = 3;
const arr = ['a', 'b'];

// ✅ 显式标注参数和返回值
function add(a: number, b: number): number {
  return a + b;
}
```

### TS-05 接口优先

**条例**：优先使用 interface 而非 type literal alias。

```typescript
// ✅ 正确
interface User {
  name: string;
  age: number;
}

// ❌ 避免
type User = {
  name: string;
  age: number;
};
```

### TS-06 结构化类型

**条例**：使用结构化类型（鸭子类型），而非依赖 `instanceof`。

```typescript
// ✅ 正确
interface Printable {
  print(): void;
}

function printItem(item: Printable) {
  item.print();
}

// ❌ 避免
if (item instanceof Printer) {
  item.print();
}
```

### TS-07 禁止 `any`

**条例**：禁止使用 `any` 类型。必要时使用 `unknown` + 类型守卫。

```typescript
// ❌ 错误
function process(data: any) { ... }

// ✅ 正确
function process(data: unknown) {
  if (typeof data === 'string') {
    // 现在 data 是 string 类型
  }
}
```

**例外**：第三方库类型定义不完整时，可使用 `@ts-expect-error` 注释说明原因。

### TS-08 相对导入

**条例**：同一项目内使用相对导入（`./foo`），而非绝对路径。

```typescript
// ✅ 正确
import { Foo } from './foo';
import { Bar } from '../bar';

// ❌ 避免
import { Foo } from 'src/modules/foo';
```

### TS-09 导入分组

**条例**：导入按顺序排列，各组之间空行分隔。

```typescript
// 1. Node.js 标准库
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

// 2. 第三方库
import { Command } from 'commander';
import pino from 'pino';

// 3. 内部模块
import { createLogger } from './logger.js';
import { Config } from './types.js';
```

### TS-10 UTF-8 编码

**条例**：所有源文件必须使用 UTF-8 编码。

### TS-11 JSDoc 文档

**条例**：所有模块顶层导出必须有 JSDoc 文档。

```typescript
/**
 * 创建工作流引擎实例
 * @param config - 引擎配置
 * @returns 工作流引擎实例
 */
export function createWorkflowEngine(config: EngineConfig): WorkflowEngine {
  ...
}
```

### TS-12 Array 类型语法

**条例**：优先使用 `T[]` 而非 `Array<T>`。

```typescript
// ✅ 正确
const items: string[] = [];

// ❌ 避免
const items: Array<string> = [];
```

### TS-13 禁止包装类型

**条例**：不使用 `Number`、`String`、`Boolean` 等包装类型。

```typescript
// ✅ 正确
const x: number = 3;
const s: string = 'hello';
const b: boolean = true;

// ❌ 错误
const x: Number = 3;
const s: String = 'hello';
const b: Boolean = true;
```

### TS-14 null/undefined 控制

**条例**：谨慎使用 null 和 undefined，明确区分两者语义。

- `undefined`：表示值未定义或缺失
- `null`：表示值有意为空

```typescript
// ✅ 明确语义
interface User {
  name: string;
  email: string | null;  // 用户可以没有邮箱
  avatar?: string;       // 头像可选
}
```

## 三、第三方依赖规范

来源：VectaHub 项目特定要求

### 3P-01 抽象层隔离

**条例**：调用第三方模块必须通过项目内部封装层，禁止直接在业务代码中裸调第三方 API。

**检查要点**：
- 是否有封装层（如 `infrastructure/logger/` 封装 pino）
- 业务代码是否直接 import 第三方库
- 封装层是否提供了统一的接口

```typescript
// ✅ 正确：通过封装层
import { createLogger } from '../infrastructure/logger/index.js';
const logger = createLogger('module-name');

// ❌ 错误：裸调第三方
import pino from 'pino';
const logger = pino();
```

### 3P-02 方法完整性

**条例**：第三方封装必须提供完整的语义方法，而非简单透传。

**检查要点**：
- 封装层是否提供了所有需要的方法
- 方法签名是否有语义化命名
- 是否只是简单转发调用而没有增加价值

### 3P-03 版本锁定

**条例**：第三方依赖版本必须明确锁定，不允许使用 `^` 或 `~` 的宽松范围。

```json
// ✅ 正确
{
  "dependencies": {
    "commander": "12.0.0"
  }
}

// ❌ 错误
{
  "dependencies": {
    "commander": "^12.0.0"
  }
}
```

### 3P-04 最小依赖

**条例**：引入新依赖必须评估必要性，优先使用已有依赖的能力。

**检查要点**：
- 是否有可被已有依赖替代的冗余依赖
- 引入新依赖的必要性论证
- 依赖的体积和维护状态

### 3P-05 依赖方向

**条例**：上层模块可依赖下层模块，禁止反向依赖和循环依赖。

```
✅ 正确方向：
Commands → Workflow Engine → Infrastructure
NL Engine → Agent Runtime → Infrastructure

❌ 错误方向：
Infrastructure → Commands（反向依赖）
Workflow Engine → NL Engine → Workflow Engine（循环依赖）
```

### 3P-06 Mock 友好

**条例**：封装层必须提供接口定义，便于测试时 Mock。

```typescript
// ✅ 正确：有接口定义
export interface ILogger {
  info(message: string, meta?: object): void;
  error(message: string, meta?: object): void;
}

export function createLogger(name: string): ILogger {
  ...
}

// ❌ 错误：没有接口，难以 Mock
export function createLogger(name: string) {
  return {
    info: (msg: string) => console.log(msg),
    error: (msg: string) => console.error(msg),
  };
}
```

## 条例索引

| 编号 | 类别 | 条例名称 | 优先级 |
|------|------|----------|--------|
| G-01 | 设计 | 设计优先 | P0 |
| G-02 | 设计 | 功能正确性 | P0 |
| G-03 | 设计 | 复杂度控制 | P1 |
| G-04 | 设计 | 测试完备性 | P1 |
| G-05 | 设计 | 命名清晰性 | P2 |
| G-06 | 设计 | 注释解释"为什么" | P2 |
| G-07 | 设计 | 文档同步 | P2 |
| G-08 | 设计 | 上下文感知 | P1 |
| G-09 | 设计 | 持续提升而非完美 | P3 |
| TS-01 | 风格 | 命名导出优先 | P1 |
| TS-02 | 风格 | 可见性最小化 | P2 |
| TS-03 | 风格 | 禁止可变导出 | P1 |
| TS-04 | 风格 | 类型推断优先 | P2 |
| TS-05 | 风格 | 接口优先 | P2 |
| TS-06 | 风格 | 结构化类型 | P2 |
| TS-07 | 风格 | 禁止 `any` | P0 |
| TS-08 | 风格 | 相对导入 | P2 |
| TS-09 | 风格 | 导入分组 | P3 |
| TS-10 | 风格 | UTF-8 编码 | P3 |
| TS-11 | 风格 | JSDoc 文档 | P2 |
| TS-12 | 风格 | Array 类型语法 | P3 |
| TS-13 | 风格 | 禁止包装类型 | P2 |
| TS-14 | 风格 | null/undefined 控制 | P2 |
| 3P-01 | 依赖 | 抽象层隔离 | P0 |
| 3P-02 | 依赖 | 方法完整性 | P1 |
| 3P-03 | 依赖 | 版本锁定 | P1 |
| 3P-04 | 依赖 | 最小依赖 | P2 |
| 3P-05 | 依赖 | 依赖方向 | P0 |
| 3P-06 | 依赖 | Mock 友好 | P1 |
