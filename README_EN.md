# VectaHub: Antigravity CACP Framework (Vite + React) 🚀

![VectaHub CACP Architecture](./public/assets/cacp_architecture.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Vite](https://img.shields.io/badge/Vite-5.0+-646CFF?logo=vite)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18.0+-61DAFB?logo=react)](https://reactjs.org/)
[![Protocol](https://img.shields.io/badge/Protocol-CACP%202.0-orange)](./.gemini/GEMINI.md)

> **VectaHub** (Antigravity CACP Framework) is an industrial-grade foundational template for the AI-Native collaboration era. Beyond high-performance Vite + React integration, it features the **CACP 2.0 (Cross-Agent Communication Protocol)**—an asynchronous, mailbox-driven architecture enabling seamless interaction between sandboxed AI agents and native OS environments.

**English Version** | [中文说明](./README.md)

---

## 🏗️ Core Engine: CACP 2.0 (Cross-Agent Communication Protocol)

The definitive competitive edge of this project is its **CACP 2.0 Asynchronous Drive Architecture**. It shatters the "Sandbox Wall" that typically restricts AI assistants from executing native binary commands (e.g., `npm install`, `git push`, `docker build`).

### Industrial-Grade Communication SOP

1. **Command Post**: The Antigravity Agent serializes task instructions into `.task` files within `.gemini/tasks/`.
2. **Event Heartbeat**: `gemini_watcher.sh` acts as a host-level daemon, scanning the "Outbox" via a 2s high-frequency heartbeat to trigger elevated command execution via the Gemini CLI.
3. **Result Feedback**: Execution logs (Stdout/Stderr/ExitCode) are encapsulated into `.response` files, allowing the Agent to perform logic self-healing based on real-time feedback.
4. **Permission Re-delegation**: Upon task completion, the watcher leverages `root` privileges to auto-execute `chown` and `chmod`. This ensures all AI-generated file ownership is instantly returned to the local IDE user, permanently fixing `EPERM` deadlocks.

---

## 🛠️ Technical Excellence

- **High-Speed Build**: Vite 5.x for millisecond-level Hot Module Replacement (HMR).
- **Modern UI**: React 18.x with Concurrent Mode for high-performance rendering.
- **Collaboration Layer**: Gemini CLI + CACP 2.0 bridging the sandbox-to-native gap.
- **Rules Autonomy**: Structured `.gemini/GEMINI.md` defines the project's "Digital Constitution," establishing Agent behavioral boundaries.

---

## 🏗️ Deep Architectural Insights: Why "Industrial-Grade"?

As an AI-driven automated coding solution, VectaHub is designed to bridge the final gap between **"Dialogue and Delivery."**

### 1. Sandbox Traversal (Cross-Sandbox Atomicity)

Traditional AI assistants are confined within sandboxes, unable to reach complex local binary chains (binary isolation). CACP 2.0 establishes a decoupled communication model based on a "Mailbox" system, allowing the Agent to focus on business logic while the Executor handles heavy-duty native execution.

### 2. Dynamic Ownership Self-Healing (Auto-Chown)

In mixed AI-human development environments, permission conflicts (`EPERM`) are the leading cause of CI/CD failures. `gemini_watcher.sh` automatically corrections file ownership after every task execution, ensuring a **"AI Generated, User Owned"** zero-friction experience.

### 3. Self-Evolution & Bootstrapping (Autonomous Code Generation)

VectaHub is theoretically capable of **"Self-Evolution based on Documentation."**

- **Doc-Driven**: It can ingest PRD or ADR documents within the project.
- **Closed-Loop Execution**: Leveraging the CACP protocol, it autonomously modifies source code, runs tests, monitors errors, and iterates on fixes until logical alignment is achieved.
- **Provenance**: This project's own documentation and protocol architecture are real-world products of this very scheme.

---

## 🚀 Quick Start

### 1. Environment Initialization

```bash
git clone <your-repo-url>
cd <project-name>
npm install
```

### 2. Activate Sandbox-Traversal Watcher (CRITICAL)

Launch the watcher in your native terminal (outside the IDE's terminal). `sudo` is recommended for initial runs to enable automated permission re-delegation:

```bash
sudo sh scripts/gemini_watcher.sh
```

### 3. Launch Development Server

```bash
npm run dev
```

---

## 🛡️ Security, Privacy & Permissions

### Why Sudo?

In CACP 2.0, `sudo` is the prerequisite for **"Generation as Possession"**:

- **Escaping Sandbox Constraints**: Sandboxed Agents cannot access native binary environments directly.
- **Dynamic Ownership Correction (Auto-Chown)**: The watcher uses `root` privileges to forcibly re-assign file ownership to the current user `$(whoami)`, ensuring a frictionless IDE experience.

### Privacy & Compliance

This project is **GitHub Ready**:

- Dynamic user identification via `$(id -u):$(id -g)`—zero hardcoding.
- Sensitive credentials and paths protected by `.geminiignore` for safe open-source distribution.

---

## ✨ Automated Self-Provenance

> **This project's scaffolding, CACP communication protocols, script logic, and all documentation (including the one you are reading) were autonomously generated by the built-in CACP-driven Agent.**

This project is not just a template—it is an industrial-grade validation of **AI-Driven Software Engineering**.

---

## 📂 Project Structure

```text
├── .agents/            # Agent logic and workflow definitions
├── .gemini/
│   ├── tasks/          # Task Outbox
│   ├── responses/      # Execution Inbox (Responses)
│   └── GEMINI.md       # CACP 2.0 Constitution (Protocol)
├── scripts/
│   └── gemini_watcher.sh # Sandbox-Traversal Daemon (5s heartbeat)
├── src/                # Source Code (React + Vite)
└── vite.config.js      # Build Configuration
```

---

## 📄 License

Open-sourced under the [MIT License](./LICENSE).
