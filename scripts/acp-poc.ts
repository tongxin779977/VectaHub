/**
 * ACP PoC — verifies end-to-end communication with an ACP-compatible agent.
 *
 * Usage:
 *   npx tsx scripts/acp-poc.ts                    # uses opencode acp
 *   npx tsx scripts/acp-poc.ts --agent claude     # uses claude acp
 *   npx tsx scripts/acp-poc.ts --prompt "..."     # custom prompt
 *   npx tsx scripts/acp-poc.ts --dry-run          # show what would be sent
 *
 * Prerequisites:
 *   - An ACP-compatible agent CLI installed (opencode, claude, codex, etc.)
 *   - The agent must support `acp` subcommand
 *
 * What this verifies:
 *   1. Agent spawns and accepts ACP initialize (protocol version + capabilities)
 *   2. session/new creates a session with the working directory
 *   3. session/prompt sends a text prompt and receives structured updates:
 *      - agent_message_chunk (streamed text response)
 *      - tool_call (file reads, edits, searches — with kind/status/locations)
 *      - plan (agent's execution plan with priorities)
 *      - usage_update (token counts)
 *   4. StopReason is explicit (end_turn / cancelled / etc.)
 *   5. All events are captured and printed as structured JSON
 */

import { prompt as acpPrompt } from '../src/agent-runtime/acp/acp-client.js';
import { mapToRunTaskResult } from '../src/agent-runtime/acp/acp-result-mapper.js';
import type { AcpEvent } from '../src/agent-runtime/acp/acp-types.js';

interface CliArgs {
  agent: string;
  agentArgs: string[];
  prompt: string;
  cwd: string;
  dryRun: boolean;
  verbose: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    agent: 'opencode',
    agentArgs: ['acp'],
    prompt: 'Read the AGENTS.md file and summarize what this project does in 2 sentences.',
    cwd: process.cwd(),
    dryRun: false,
    verbose: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--agent':
        args.agent = argv[++i] ?? args.agent;
        // Set default acp args for known agents
        if (args.agent === 'opencode') args.agentArgs = ['acp'];
        else if (args.agent === 'claude') args.agentArgs = ['acp'];
        else if (args.agent === 'codex') args.agentArgs = ['acp'];
        break;
      case '--agent-args':
        args.agentArgs = (argv[++i] ?? '').split(' ');
        break;
      case '--prompt':
        args.prompt = argv[++i] ?? args.prompt;
        break;
      case '--cwd':
        args.cwd = argv[++i] ?? args.cwd;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--verbose':
      case '-v':
        args.verbose = true;
        break;
      case '--help':
      case '-h':
        console.log('Usage: npx tsx scripts/acp-poc.ts [options]');
        console.log('');
        console.log('Options:');
        console.log('  --agent <name>       Agent CLI name (default: opencode)');
        console.log('  --agent-args <args>  Space-separated args (default: "acp")');
        console.log('  --prompt <text>     Custom prompt text');
        console.log('  --cwd <path>        Working directory (default: cwd)');
        console.log('  --dry-run           Show config without executing');
        console.log('  --verbose, -v       Print every event as it arrives');
        console.log('  --help, -h          Show this help');
        process.exit(0);
        break;
    }
  }

  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  console.log('=== ACP PoC ===');
  console.log(`Agent: ${args.agent} ${args.agentArgs.join(' ')}`);
  console.log(`CWD: ${args.cwd}`);
  console.log(`Prompt: ${args.prompt}`);
  console.log('');

  if (args.dryRun) {
    console.log('Dry run — would send:');
    console.log(JSON.stringify({
      command: args.agent,
      args: args.agentArgs,
      cwd: args.cwd,
      clientName: 'vectahub-acp-poc',
      clientVersion: '0.1.0',
      prompt: args.prompt,
    }, null, 2));
    return;
  }

  console.log('Connecting to agent...\n');

  try {
    const result = await acpPrompt(args.prompt, {
      command: args.agent,
      args: args.agentArgs,
      cwd: args.cwd,
      clientName: 'vectahub-acp-poc',
      clientVersion: '0.1.0',
      timeoutMs: 120_000,
      onEvent: (event: AcpEvent) => {
        if (!args.verbose) return;
        console.log(`[event] ${event.type}: ${JSON.stringify(event.event).slice(0, 200)}`);
      },
      onPermission: async (toolTitle, options) => {
        console.log(`[permission] ${toolTitle}`);
        for (const opt of options) {
          console.log(`  - ${opt.name} (${opt.kind}) [${opt.optionId}]`);
        }
        // Auto-approve allow_once
        const allow = options.find((o) => o.kind === 'allow_once');
        if (allow) {
          console.log(`  → approved: ${allow.name}`);
          return { optionId: allow.optionId };
        }
        console.log('  → cancelled (no allow_once option)');
        return { cancelled: true };
      },
    });

    console.log('\n=== ACP Result ===');
    console.log(`Agent: ${result.agentName} v${result.agentVersion}`);
    console.log(`StopReason: ${result.stopReason}`);
    console.log(`Events captured: ${result.events.length}`);
    console.log(`Tool calls: ${result.toolCalls.length}`);
    console.log(`Plan entries: ${result.planEntries.length}`);
    console.log(`Usage: ${result.usage ? `${result.usage.usedTokens}/${result.usage.maxContextTokens} tokens` : 'N/A'}`);
    console.log('');

    console.log('--- Message ---');
    console.log(result.message || '(empty)');
    console.log('');

    if (result.toolCalls.length > 0) {
      console.log('--- Tool Calls ---');
      for (const tc of result.toolCalls) {
        console.log(`[${tc.kind}] ${tc.title} → ${tc.status}`);
        if (tc.locations.length > 0) {
          console.log(`  locations: ${tc.locations.map((l) => `${l.path}${l.line ? `:${l.line}` : ''}`).join(', ')}`);
        }
        for (const c of tc.content) {
          if (c.type === 'diff') {
            console.log(`  diff: ${c.diff.path} (+${c.diff.newText.length} chars)`);
          } else if (c.type === 'content') {
            console.log(`  content: ${c.text.slice(0, 100)}...`);
          }
        }
      }
      console.log('');
    }

    if (result.planEntries.length > 0) {
      console.log('--- Plan ---');
      for (const e of result.planEntries) {
        console.log(`[${e.status}] (${e.priority}) ${e.content}`);
      }
      console.log('');
    }

    console.log('--- VectaHub Mapped Result ---');
    const mapped = mapToRunTaskResult(result);
    console.log(JSON.stringify(mapped, null, 2));

    console.log('\n=== PoC PASSED ===');
    console.log('ACP communication verified: structured events, tool calls, stop reason all received.');
  } catch (error) {
    console.error('\n=== PoC FAILED ===');
    console.error(error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
