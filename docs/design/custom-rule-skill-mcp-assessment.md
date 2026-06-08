# Custom Rule / Skill / MCP Ecosystem Reassessment

> Document Status: Assessment / Product Decision
> Authority: Current reassessment of custom rule, skill, and MCP ecosystem readiness
> Last Verified: 2026-06-01

## Overview

This document assesses the readiness and entry conditions for custom rules, skills, and MCP (Model Context Protocol) ecosystem, in light of the current VectaHub NL Workflow Orchestrator maturity.

## Current State Summary

Current reassessment can rely on these completed backlog foundations:
- OrchestrationPlan and WorkflowDraft contracts are available for the current orchestrator scope
- Plan safety review and confirmation policies are available for the current orchestrator scope
- Native feature passthrough policy is tracked by `P2-005`, but is not yet completed
- Worker capability matrix is documented in P2-002
- Trace, audit, verification, and feedback foundations exist for the current orchestrator scope

## Readiness Assessment by Capability

### 1. Custom Rules

**Current Status: Defer**

**Entry Conditions (All required before production):**
- [ ] Rule schema contract with typed inputs and outputs
- [ ] Rule safety evaluation contract
- [ ] Rule verification pipeline
- [ ] Rule audit and trace integration
- [ ] User confirmation policy for rule execution
- [ ] At least 10 semantic acceptance test cases for custom rules
- [ ] Rule sandboxing for script-based rules

**Recommended Timeline:** Post-1.0, after core orchestrator is hardened

---

### 2. Skills

**Current Status: Defer**

**Entry Conditions (All required before production):**
- [ ] Skill contract schema with input/output/safety/verification
- [ ] Skill catalog builder from discovery sources
- [ ] Skill safety review layer
- [ ] Skill verification gate
- [ ] Skill execution trace integration
- [ ] Skill dependency management (if any)
- [ ] At least 20 semantic acceptance test cases for custom skills
- [ ] Clear separation between built-in and custom skills

**Recommended Timeline:** Post-1.0, after custom rules

---

### 3. MCP (Model Context Protocol)

**Current Status: Defer**

**Entry Conditions (All required before production):**
- [ ] MCP client contract implementation
- [ ] MCP server discovery and validation
- [ ] MCP tool safety categorization
- [ ] MCP tool execution sandbox
- [ ] MCP tool audit and trace
- [ ] MCP verification gate
- [ ] MCP permission mapping to VectaHub security policies
- [ ] At least 30 semantic acceptance test cases for MCP tools
- [ ] Full MCP tool failure and recovery path

**Recommended Timeline:** Long-term roadmap, not currently scheduled

## Gap Analysis

### Security Gaps
- **Critical**: No custom code sandboxing infrastructure
- **Critical**: No dynamic tool safety evaluation pipeline
- **High**: No permission mapping for third-party tools
- **High**: No audit trail for custom/third-party tool execution

### Contract Gaps
- **Critical**: No schema contracts for custom rules/skills/MCP tools
- **High**: No verification pipeline integration for custom capabilities
- **Medium**: No trace integration for custom capabilities

### Testing Gaps
- **Critical**: No semantic acceptance tests for any custom capabilities
- **High**: No sandboxed test environment for third-party code

## Final Decision

| Capability | Decision | Rationale |
|------------|----------|-----------|
| Custom Rules | Defer | Not required for core orchestrator; requires significant security and contract infrastructure |
| Custom Skills | Defer | Not required for core orchestrator; depends on custom rules foundation |
| MCP Ecosystem | Defer | Long-term roadmap only; current priority is core NL Workflow Orchestrator stability |

## Next Steps (If/When Revisiting)

1. First, implement custom rule infrastructure (contracts, sandbox, verification)
2. Then, build custom skills on top of custom rules
3. Finally, assess MCP after skills are proven stable
4. Always prioritize:
   - Safety first
   - Contracts first
   - Verification first
   - Traceability first

## References

- [tools-security-management.md](../contracts/tools-security-management.md)
- [security-permission-loop.md](../contracts/security-permission-loop.md)
- [native-feature-passthrough-policy](../contracts/native-feature-passthrough-policy.md)
- [hybrid-ai-nl-engine.md](./hybrid-ai-nl-engine.md)
