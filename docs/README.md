# VectaHub 文档

## 快速导航

| 你是谁 | 看哪个 |
|--------|--------|
| 想了解这个项目是什么 | [product/01_product_positioning.md](product/01_product_positioning.md) |
| 想看完整功能清单 | [product/02_feature_planning.md](product/02_feature_planning.md) |
| 想了解技术架构 | [design/01_system_architecture.md](design/01_system_architecture.md) |
| 想开始开发（agent 专用） | [design/04_agent_tasks.md](design/04_agent_tasks.md) |
| 想了解实施路径 | [design/03_implementation_roadmap.md](design/03_implementation_roadmap.md) |
| 想看 CLI 命令清单 | [design/05_cli_commands.md](design/05_cli_commands.md) |
| 想看工作流引擎设计 | [design/06_workflow_engine_design.md](design/06_workflow_engine_design.md) |
| 想看工程改进计划 | [design/11_engineering_improvement_plan.md](design/11_engineering_improvement_plan.md) |

## 目录结构

```
docs/
├── product/                          # 产品文档（给人看）
│   ├── 01_product_positioning.md     # 产品定位、与 OpenCLI 关系
│   └── 02_feature_planning.md        # 功能清单、三步规划
│
└── design/                           # 技术文档（给人 + agent 看）
    ├── 01_system_architecture.md     # 系统架构、数据结构、数据流
    ├── 02_sandbox_design.md          # 沙箱设计
    ├── 03_implementation_roadmap.md  # 实施路线图（给人看：为什么做、验收标准）
    ├── 04_agent_tasks.md             # 开发任务（给 agent 看：精确到代码行）
    ├── 06_workflow_engine_design.md  # 工作流引擎设计
    └── 11_engineering_improvement_plan.md  # 工程改进计划
```
