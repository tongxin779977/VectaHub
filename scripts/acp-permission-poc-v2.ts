/**
 * ACP Permission PoC v2 — configures OpenCode to require permission for bash,
 * then verifies the full session/request_permission → approve/reject flow.
 *
 * Creates a local opencode.json in a temp workspace with permission rules
 * that deny bash by default, forcing the agent to ask the ACP client.
 */

import { prompt as acpPrompt } from '../src/agent-runtime/acp/acp-client.js';
import { mapToRunTaskResult } from '../src/agent-runtime/acp/acp-result-mapper.js';
import type { AcpEvent } from '../src/agent-runtime/acp/acp-types.js';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
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

  const tempDir = mkdtempSync(join(tmpdir(), 'acp-perm-v2-'));
  const markerFile = '/tmp/acp-perm-v2-marker.txt';

  // Create an opencode.json that forces permission ask for bash
  const opencodeConfig = {
    $schema: 'https://opencode.ai/config.json',
    permission: {
      bash: 'ask',
      edit: 'ask',
    },
  };
  writeFileSync(join(tempDir, 'opencode.json'), JSON.stringify(opencodeConfig, null, 2));

  console.log('=== ACP Permission PoC v2 ===');
  console.log(`Mode: ${args.reject ? 'REJECT' : 'APPROVE'}`);
  console.log(`Temp workspace: ${tempDir}`);
  console.log(`OpenCode config: deny bash by default → force session/request_permission`);
  console.log('');

  // Clean up any previous marker
  rmSync(markerFile, { force: true });

  const promptText = 'Run the shell command: echo TEST > /tmp/acp-perm-v2-marker.txt';

  console.log(`Prompt: ${promptText}\n`);

  let permissionRequested = false;
  let permissionTitle = '';
  let permissionOptions: { optionId: string; name: string; kind: string }[] = [];

  try {
    console.log('Connecting to OpenCode via ACP...\n');

    const result = await acpPrompt(promptText, {
      command: 'opencode',
      args: ['acp', '--print-logs'],
      cwd: tempDir,
      clientName: 'vectahub-perm-poc-v2',
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

    if (result.toolCalls.length > 0) {
      console.log('--- Tool Calls ---');
      for (const tc of result.toolCalls) {
        console.log(`[${tc.kind}] ${tc.title} → ${tc.status}`);
        if (tc.rawInput) console.log(`  rawInput: ${JSON.stringify(tc.rawInput).slice(0, 200)}`);
        if (tc.rawOutput) console.log(`  rawOutput: ${JSON.stringify(tc.rawOutput).slice(0, 200)}`);
      }
      console.log('');
    }

    console.log('--- Message ---');
    console.log(result.message || '(empty)');
    console.log('');

    const markerExists = existsSync(markerFile);
    console.log('--- File System Check ---');
    console.log(`Marker file exists: ${markerExists}`);
    if (markerExists) {
      console.log(`Content: ${JSON.stringify(readFileSync(markerFile, 'utf-8'))}`);
      rmSync(markerFile, { force: true });
    }
    console.log('');

    console.log('--- VectaHub Mapped Result ---');
    const mapped = mapToRunTaskResult(result);
    console.log(JSON.stringify(mapped, null, 2));

    console.log('\n=== VERDICT ===');
    if (!permissionRequested) {
      console.log('⚠️  Permission was NOT requested.');
      console.log('   OpenCode may not support the permission config we provided.');
      console.log('   Check the logs above for permission evaluation messages.');
    } else if (args.reject) {
      if (!markerExists) {
        console.log('✅ PASS: Permission requested → REJECTED → command NOT executed.');
        console.log('   Full reject flow verified: agent asked, we rejected, agent respected.');
      } else {
        console.log('❌ FAIL: Permission requested and rejected, but command still ran.');
      }
    } else {
      if (markerExists) {
        console.log('✅ PASS: Permission requested → APPROVED → command executed.');
        console.log('   Full approve flow verified: agent asked, we approved, agent proceeded.');
      } else {
        console.log('⚠️  PARTIAL: Permission requested and approved, but command not executed.');
      }
    }
  } catch (error) {
    console.error('\n=== ERROR ===');
    console.error(error);
    process.exit(1);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
    rmSync(markerFile, { force: true });
    console.log(`\nCleaned up temp workspace and marker file.`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
