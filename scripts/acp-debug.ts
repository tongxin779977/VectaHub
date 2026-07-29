/**
 * ACP Debug PoC — prints the full initialize response and session config options
 * to understand what the agent exposes for permission control.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { Writable, Readable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';

async function main(): Promise<void> {
  const child = spawn('opencode', ['acp', '--print-logs'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'inherit'],
    env: process.env,
  });

  const stream = acp.ndJsonStream(
    Writable.toWeb(child.stdin!),
    Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
  );

  await acp
    .client({ name: 'debug-client' })
    .onRequest(acp.methods.client.session.requestPermission, (ctx) => {
      console.log('\n>>> PERMISSION REQUEST <<<');
      console.log(JSON.stringify(ctx.params, null, 2));
      const allow = ctx.params.options.find((o: { kind: string }) => o.kind === 'allow_once');
      if (allow) {
        return { outcome: { outcome: 'selected' as const, optionId: allow.optionId } };
      }
      return { outcome: { outcome: 'cancelled' as const } };
    })
    .connectWith(stream, async (ctx) => {
      // 1. Initialize — print full response
      console.log('=== INITIALIZE ===');
      const init = await ctx.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true,
          session: { configOptions: { boolean: true } },
        },
        clientInfo: { name: 'debug-client', version: '0.1.0' },
      });

      console.log('Protocol version:', init.protocolVersion);
      console.log('Agent info:', JSON.stringify(init.agentInfo, null, 2));
      console.log('Agent capabilities:', JSON.stringify(init.agentCapabilities, null, 2));
      console.log('Auth methods:', JSON.stringify(init.authMethods, null, 2));

      // 2. Create session
      console.log('\n=== SESSION/NEW ===');
      const session = await ctx.buildSession(process.cwd()).start();
      console.log('Session ID:', session.sessionId);

      // 3. Try to list config options
      console.log('\n=== PROBING CONFIG ===');
      // Try setting a known config option to see what's available
      try {
        const configResult = await ctx.request(acp.methods.agent.session.setConfigOption, {
          sessionId: session.sessionId,
          option: 'auto_approve',
          value: false,
        });
        console.log('setConfigOption(auto_approve=false):', JSON.stringify(configResult, null, 2));
      } catch (e) {
        console.log('setConfigOption(auto_approve=false) failed:', e instanceof Error ? e.message : String(e));
      }

      // Try other common config options
      for (const opt of ['auto', 'permission', 'approve', 'trust', 'sandbox']) {
        try {
          const result = await ctx.request(acp.methods.agent.session.setConfigOption, {
            sessionId: session.sessionId,
            option: opt,
            value: false,
          });
          console.log(`setConfigOption(${opt}=false):`, JSON.stringify(result, null, 2));
        } catch (e) {
          console.log(`setConfigOption(${opt}=false) failed:`, e instanceof Error ? e.message : String(e).slice(0, 100));
        }
      }

      // 4. Send a prompt that should trigger permission
      console.log('\n=== SENDING PROMPT ===');
      console.log('Prompt: "Run: echo TEST > /tmp/acp-debug-marker.txt"');

      session.prompt('Run the shell command: echo TEST > /tmp/acp-debug-marker.txt');

      for (;;) {
        const msg = await session.nextUpdate();
        if (msg.kind === 'stop') {
          console.log('\n=== STOP ===');
          console.log('StopReason:', msg.stopReason);
          break;
        }
        const u = msg.update;
        switch (u.sessionUpdate) {
          case 'agent_message_chunk':
            if (u.content.type === 'text') {
              process.stdout.write(u.content.text);
            }
            break;
          case 'tool_call':
            console.log(`\n[tool_call] ${u.title} kind=${u.kind} status=${u.status}`);
            console.log(`  rawInput: ${JSON.stringify(u.rawInput).slice(0, 200)}`);
            break;
          case 'tool_call_update':
            console.log(`[tool_call_update] ${u.toolCallId} status=${u.status}`);
            if (u.rawOutput) {
              console.log(`  rawOutput: ${JSON.stringify(u.rawOutput).slice(0, 200)}`);
            }
            break;
          case 'usage_update':
            console.log(`[usage] ${u.used}/${u.size} tokens`);
            break;
        }
      }

      child.kill('SIGTERM');
      return init;
    });

  console.log('\n=== DONE ===');
}

main().catch((error) => {
  console.error('Fatal:', error);
  process.exit(1);
});
