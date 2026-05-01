# VectaHub: Natural Language Workflow Automation Engine 🚀

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-21+-339933?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript)](https://www.typescriptlang.org/)

> **VectaHub** is a natural language-driven workflow automation engine. Simply describe what you want to do in plain language, and it will automatically generate, execute, and record the entire workflow.

**[中文说明](./README.md)** | **English Version**

---

## Core Value: One Line to Understand VectaHub

| Tool | What You Write | VectaHub Does |
|------|---------------|---------------|
| Taskfile | Write YAML: `tasks: { compress: ... }` | Say "compress images" |
| Shell Script | Write bash: `for f in *.jpg; do...` | Say "compress images" |
| Claude Code | Manually guide AI step by step | Say "compress images" |
| **VectaHub** | **Say what you want** | **Say "compress images"** |

---

## 🎯 Core Use Cases

### Scenario 1: Daily File Processing

```bash
$ vectahub "compress images in current directory"

🤖 Intent: IMAGE_COMPRESS
📋 Generated Workflow:
  Step 1: find . -type f \( -name "*.jpg" -o -name "*.png" \)
  Step 2: for each: convert ${item} -resize 50% ${item}
⏳ Mode: CONSENSUS

Confirm execution? [Y/n] y
▶️ Running...
✅ Done: 12 files compressed
```

### Scenario 2: Developer Workflows

```bash
$ vectahub "run tests, if passed then deploy"

🤖 Intent: CI_PIPELINE
📋 Generated Workflow:
  Step 1: npm test
  Step 2: if (exit_code == 0) then npm run deploy
⏳ Mode: STRICT (auto-strict for CI scenarios)

▶️ Running...
  ▶ npm test ... ✅
  ▶ npm run deploy ... ✅
```

### Scenario 3: Git Collaboration

```bash
$ vectahub "commit and push all changes"

🤖 Intent: GIT_WORKFLOW
📋 Generated Workflow:
  Step 1: git add -A
  Step 2: git commit -m "update"
  Step 3: git push
```

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        VectaHub                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │  NL Parser  │───▶│   Workflow  │───▶│  Executor   │   │
│  │ (Intent     │    │   Engine    │    │             │   │
│  │  Parsing)   │    │             │    │             │   │
│  └─────────────┘    └─────────────┘    └─────────────┘   │
│         │                  │                  │           │
│         ▼                  ▼                  ▼           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │ Intent       │    │ Workflow    │    │ Sandbox     │   │
│  │ Templates    │    │ Storage     │    │ (macOS)     │   │
│  └─────────────┘    └─────────────┘    └─────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

| Component | Responsibility |
|-----------|----------------|
| **NL Parser** | Converts natural language to Workflow objects |
| **Workflow Engine** | Manages workflow lifecycle and step execution |
| **Executor** | Executes CLI commands in sandbox |
| **Sandbox** | macOS sandbox isolation for secure execution |
| **CLI Tools Registry** | Standardized CLI tool integration |

---

## 🛡️ Security Mechanisms

### Three Execution Modes

| Mode | Non-dangerous Commands | Dangerous Commands | Use Case |
|------|------------------------|-------------------|----------|
| **STRICT** | Auto-execute | Block | CI/CD |
| **RELAXED** | Auto-execute | Block | Dev debugging |
| **CONSENSUS** | Confirm then execute | Confirm then execute | Interactive |

### Dangerous Command Detection

```typescript
const DANGEROUS_PATTERNS = {
  critical: [
    /^sudo\s+/,                          // Privilege escalation
    /^chmod\s+777/,                      // Global permissions
    /^rm\s+-rf\s+\/(?!sandbox)/,         // Recursive root deletion
  ]
};
```

---

## 📦 Built-in Intent Templates

| Intent | Description | Example |
|--------|-------------|---------|
| `IMAGE_COMPRESS` | Compress images | "compress images in current directory" |
| `FILE_FIND` | Find files | "find all files larger than 100M" |
| `BACKUP` | Backup files/directories | "backup Documents to external drive" |
| `CI_PIPELINE` | CI workflows | "run tests, deploy if passed" |
| `BATCH_RENAME` | Batch rename | "rename all .jpeg to .jpg" |
| `GIT_WORKFLOW` | Git operations | "commit and push" |

---

## 🚀 Quick Start

### 1. Install

```bash
npm install -g vectahub
```

### 2. Run Natural Language Commands

```bash
vectahub run "compress images in current directory"
vectahub run "commit and push all changes"
vectahub run "find all files larger than 100M"
```

### 3. Run Workflow from File

```bash
vectahub run -f workflow.yaml
```

---

## 📂 Project Structure

```
VectaHub/
├── docs/design/              # Design documents
├── src/
│   ├── cli.ts               # CLI entry point
│   ├── nl/                  # Natural language parsing
│   │   ├── parser.ts
│   │   ├── intent-matcher.ts
│   │   └── templates/
│   ├── workflow/            # Workflow engine
│   │   ├── engine.ts
│   │   ├── executor.ts
│   │   └── storage.ts
│   ├── sandbox/            # Sandbox isolation
│   │   ├── detector.ts
│   │   └── sandbox.ts
│   ├── cli-tools/          # CLI tool integration
│   │   ├── registry.ts
│   │   └── tools/
│   └── utils/              # Utilities
├── workflows/               # User workflows
└── intents/                # Custom intents
```

---

## 🛠️ Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js 21+
- **Build**: tsup
- **CLI**: Commander.js
- **Configuration**: YAML

---

## 📄 License

Open-sourced under the [MIT License](./LICENSE).
