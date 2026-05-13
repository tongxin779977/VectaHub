# VectaHub Security & Sandbox

> Sandbox, security protocol, command rules, and audit. Read this when modifying security-related modules.

## Architecture

```
src/sandbox/                    # Command isolation
├── sandbox.ts                  # SandboxManager — multi-strategy isolation
├── detector.ts                 # Command danger detection
├── semantic-detector.ts        # Semantic analysis of commands
├── memory-monitor.ts           # Memory usage monitoring
├── constants.ts                # Sandbox constants & profiles
└── index.ts

src/security-protocol/          # Security rule database & enforcement
├── protocol-manager.ts         # RBAC policy management
├── rule-loader.ts              # Load security rules from config
└── index.ts

src/command-rules/              # Command matching engine
├── engine.ts                   # Rule evaluation engine
├── matcher.ts                  # Pattern matching for commands
├── loader.ts                   # Load rule definitions
├── types.ts                    # Rule types
└── index.ts

src/cli-tools/                  # Tool registration & execution
├── registry.ts                 # Tool registry
├── tool-chain.ts               # Chained tool execution
├── tool-service.ts             # Tool service layer
├── types.ts                    # Tool types
├── index.ts
├── command-rules/              # CLI tool command rules
├── discovery/                  # Tool discovery
├── registration/               # Tool registration
└── tools/                      # Built-in tools

src/commands/security.ts        # `vectahub security` CLI command
src/commands/audit-cmd.ts       # `vectahub audit` CLI command
```

## Sandbox Isolation Strategies

| Strategy | Platform | Description |
|----------|----------|-------------|
| `sandbox-exec` | macOS | Apple sandbox-exec with deny-allow profile |
| `bubblewrap` | Linux | bwrap with user/mount/pid namespace unsharing |
| `unshare` | Linux | unshare --user --mount --pid --fork |
| `directory` | Fallback | Simple cwd-based isolation, no namespaces |

Selection is automatic based on platform capabilities.

## Danger Detection (Two-Layer)

1. **Security Protocol Manager** — regex patterns from rule database
2. **Built-in regex patterns** — hardcoded danger levels:
   - `critical`: sudo, rm -rf /, fork bombs
   - `high`: writes to /etc, iptables
   - `medium`: eval, pipe to shell
   - `low`: rm (non-recursive)

## Security Rules

- **No raw `exec()`** — all external commands must go through sandbox/security protocol
- **Path whitelist** — file operations via `getVectaHubPath()` or registered context paths
- **User confirmation** — dangerous commands (rm, sudo, curl, git push) require explicit confirmation
- **No secrets access** — do not read, print, log, or commit secrets/tokens/keys/`.env`
- **No bypass** — do not skip sandbox detection, command rules matching, or user confirmation

## CLI Commands

```bash
# List security rules
npm run dev -- security list

# Test command safety
npm run dev -- security test -- <command>

# Audit logs
npm run dev -- audit list --limit 20
npm run dev -- audit query --event <type>
npm run dev -- audit stats
```

### Audit Event Types

`cli_command` / `workflow_start` / `workflow_step` / `workflow_end` / `sandbox_detect` / `intent_match`

## Verification After Changes

```bash
# 1. Typecheck
npm run typecheck

# 2. Security rules intact
npm run dev -- security list

# 3. Test command safety
npm run dev -- security test -- "rm -rf /tmp/test"

# 4. Run tests
npx vitest run src/sandbox/ src/security-protocol/ src/command-rules/ --reporter=verbose

# 5. Full diagnostics (if sandbox policies changed)
npm run dev -- doctor
```

## Security Change Report Template

```markdown
## Security Change Report

### Scope
- Files: [modified files]
- Impact: [effect on security policies]

### Verification
- typecheck: pass/fail
- security list: pass/fail
- security test: [commands tested]
- tests: pass/fail

### Checklist
- [ ] No raw exec() introduced
- [ ] All path ops via getVectaHubPath()
- [ ] Dangerous commands keep user confirmation
- [ ] No secrets leaked