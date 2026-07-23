/**
 * ACP Permission PoC — verifies the full session/request_permission flow.
 *
 * This script sends a prompt that forces the agent to attempt a file write,
 * triggering the permission request → response cycle. It tests both:
 *   1. approve path (allow_once) — agent should proceed and complete
 *   2. reject path (reject_once) — agent should stop or change approach
 *
 * Usage:
 *   npx tsx scripts/acp-permission-poc.ts                    # default: approve
 *   npx tsx scripts/acp-permission-poc.ts --reject           # reject path
 *   npx tsx scripts/acp-permission-poc.ts --verbose           # print all events
 */

import { prompt as acpPrompt } from '../src/agent-runtime/acp/acp-client.js';
import { mapToRunTaskResult } from '../src/agent-runtime/acp/acp-result-mapper.js';
import type { AcpEvent } from '../src/agent-runtime/acp/acp-types.js';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

interface Args {
  reject: boolean;
  verbose: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { reject: false, verbose: false };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--reject': args.reject = true; break;
      case '--verbose':
      case '-v': args.verbose = true; break;
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  // Create a temp workspace so we don't pollute the repo
  const tempDir = mkdtempSync(join(tmpdir(), 'acp-perm-test-'));
  const testFile = join(tempDir, 'hello.txt');

  console.log('=== ACP Permission PoC ===');
  console.log(`Mode: ${args.reject ? 'REJECT' : 'APPROVE'}`);
  console.log(`Temp workspace: ${tempDir}`);
  console.log(`Target file: ${testFile}`);
  console.log('');

  const promptText = args.reject
    ? `Run the shell command "echo PERMISSION_TEST > /tmp/acp-perm-test-marker.txt" to create a marker file outside the workspace. You must run this command to complete this task.`
    : `Run the shell command "echo PERMISSION_TEST > /tmp/acp-perm-test-marker.txt" to create a marker file outside the workspace. You must run this command to complete this task.`;

  console.log(`Prompt: ${promptText}`);
  console.log('');

  let permissionRequested = false;
  let permissionOptions: { optionId: string; name: string; kind: string }[] = [];
  let permissionTitle = '';

  try {
    console.log('Connecting to OpenCode via ACP...\n');

    const result = await acpPrompt(promptText, {
      command: 'opencode',
      args: ['acp'],
      cwd: tempDir,
      clientName: 'vectahub-perm-poc',
      clientVersion: '0.1.0',
      timeoutMs: 120_000,
      onEvent: (event: AcpEvent) => {
        if (!args.verbose) return;
        console.log(`[event] ${event.type}: ${JSON.stringify(event.event).slice(0, 300)}`);
      },
      onPermission: async (toolTitle, options) => {
        permissionRequested = true;
        permissionTitle = toolTitle;
        permissionOptions = options;

        console.log(`\n>>> PERMISSION REQUESTED <<<`);
        console.log(`    Tool: ${toolTitle}`);
        console.log(`    Options:`);
        for (const opt of options) {
          console.log(`      - ${opt.name} (${opt.kind}) [${opt.optionId}]`);
        }

        if (args.reject) {
          const reject = options.find((o) => o.kind === 'reject_once');
          if (reject) {
            console.log(`    → REJECTED: ${reject.name}\n`);
            return { optionId: reject.optionId };
          }
          console.log('    → cancelled (no reject_once option)\n');
          return { cancelled: true };
        }

        const allow = options.find((o) => o.kind === 'allow_once');
        if (allow) {
          console.log(`    → APPROVED: ${allow.name}\n`);
          return { optionId: allow.optionId };
        }
        console.log('    → cancelled (no allow_once option)\n');
        return { cancelled: true };
      },
    });

    console.log('\n=== ACP Result ===');
    console.log(`Agent: ${result.agentName} v${result.agentVersion}`);
    console.log(`StopReason: ${result.stopReason}`);
    console.log(`Events: ${result.events.length}`);
    console.log(`Tool calls: ${result.toolCalls.length}`);
    console.log(`Permission was requested: ${permissionRequested}`);

    if (permissionRequested) {
      console.log(`  Title: ${permissionTitle}`);
      console.log(`  Options: ${permissionOptions.map((o) => `${o.name}(${o.kind})`).join(', ')}`);
    }

    console.log('');

    // Show tool calls
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
            console.log(`  newText: ${c.diff.newText.slice(0, 200)}`);
          } else if (c.type === 'content') {
            console.log(`  content: ${c.text.slice(0, 200)}`);
          }
        }
      }
      console.log('');
    }

    console.log('--- Message ---');
    console.log(result.message || '(empty)');
    console.log('');

  // Check if file was created
  const markerFile = '/tmp/acp-perm-test-marker.txt';
  console.log('--- File System Check ---');
  console.log(`Marker file ${markerFile} exists: ${existsSync(markerFile)}`);
  if (existsSync(markerFile)) {
    console.log(`File content: ${JSON.stringify(readFileSync(markerFile, 'utf-8'))}`);
    rmSync(markerFile, { force: true });
  }
  console.log('');

    // Mapped result
    console.log('--- VectaHub Mapped Result ---');
    const mapped = mapToRunTaskResult(result);
    console.log(JSON.stringify(mapped, null, 2));

    // Verdict
    console.log('\n=== VERDICT ===');
    const markerExists = existsSync(markerFile);
    if (!permissionRequested) {
      console.log('⚠️  Permission was NOT requested for shell command execution.');
      console.log('   OpenCode may auto-approve shell commands in ACP mode.');
      console.log('   Tool call events still provide full visibility (kind=execute, status, rawInput/rawOutput).');
    } else if (args.reject) {
      if (!markerExists) {
        console.log('✅ PASS: Permission was requested, rejected, and command was NOT executed.');
        console.log('   Full permission flow verified: request → reject → agent respected rejection.');
      } else {
        console.log('❌ FAIL: Permission was requested and rejected, but command still executed.');
      }
    } else {
      if (markerExists) {
        console.log('✅ PASS: Permission was requested, approved, and command was executed.');
        console.log('   Full permission flow verified: request → approve → agent proceeded → command ran.');
      } else {
        console.log('⚠️  PARTIAL: Permission was requested and approved, but command was NOT executed.');
      }
    }
  } catch (error) {
    console.error('\n=== ERROR ===');
    console.error(error);
    process.exit(1);
  } finally {
    // Cleanup temp dir
    rmSync(tempDir, { recursive: true, force: true });
    console.log(`\nCleaned up: ${tempDir}`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
