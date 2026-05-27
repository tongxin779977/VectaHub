import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';

const execAsync = promisify(exec);

export interface EnvAuditResult {
  timestamp: string;
  platform: string;
  linuxKernel: {
    userNamespaces: boolean;
    cgroupsV2: boolean;
  };
  shell: {
    uid: number;
    isRoot: boolean;
    hasSudo: boolean;
  };
  toolchain: {
    git: { installed: boolean; version?: string };
    node: { installed: boolean; version?: string };
    docker: { installed: boolean; version?: string };
  };
  sandboxReadiness: 'READY' | 'DEGRADED' | 'NOT_SUPPORTED';
  reasons: string[];
}

export async function performEnvAudit(): Promise<EnvAuditResult> {
  const result: EnvAuditResult = {
    timestamp: new Date().toISOString(),
    platform: platform(),
    linuxKernel: {
      userNamespaces: false,
      cgroupsV2: false,
    },
    shell: {
      uid: process.getuid ? process.getuid() : -1,
      isRoot: false,
      hasSudo: false,
    },
    toolchain: {
      git: { installed: false },
      node: { installed: false },
      docker: { installed: false },
    },
    sandboxReadiness: 'READY',
    reasons: [],
  };

  // 1. Deep Check: Linux Kernel Features
  if (result.platform === 'linux') {
    try {
      // Actual capability test for user namespaces
      await execAsync('unshare --user echo 1');
      result.linuxKernel.userNamespaces = true;
    } catch {
      result.linuxKernel.userNamespaces = false;
      result.reasons.push('User Namespaces test failed (unshare not permitted or disabled in kernel)');
      result.sandboxReadiness = 'DEGRADED';
    }

    try {
      // Check if cgroup2 is actually mounted
      const { stdout } = await execAsync('mount -t cgroup2');
      result.linuxKernel.cgroupsV2 = stdout.includes('cgroup2');
    } catch {
      result.linuxKernel.cgroupsV2 = false;
    }
  } else if (result.platform === 'darwin') {
    try {
      // Sandbox-exec availability test for macOS
      await execAsync('sandbox-exec -p "(version 1)(allow default)" echo 1');
    } catch {
      result.reasons.push('macOS sandbox-exec is restricted or unavailable');
      result.sandboxReadiness = 'DEGRADED';
    }
  } else {
    result.reasons.push(`Platform ${result.platform} has limited sandbox support`);
    result.sandboxReadiness = 'DEGRADED';
  }

  // 2. Deep Check: Shell Permissions
  result.shell.isRoot = result.shell.uid === 0;
  try {
    // Check if sudo is usable without a password prompt
    await execAsync('sudo -n -v');
    result.shell.hasSudo = true;
  } catch {
    result.shell.hasSudo = false;
  }

  // 3. Deep Check: Toolchain
  const checkTool = async (cmd: string) => {
    try {
      // Verify the binary exists in PATH
      const { stdout: pathOut } = await execAsync(`which ${cmd}`);
      if (!pathOut.trim()) return { installed: false };
      
      const { stdout } = await execAsync(`${cmd} --version`);
      return { installed: true, version: stdout.trim().split('\n')[0] };
    } catch {
      return { installed: false };
    }
  };

  result.toolchain.git = await checkTool('git');
  result.toolchain.node = await checkTool('node');
  result.toolchain.docker = await checkTool('docker');

  if (!result.toolchain.git.installed) {
    result.reasons.push('Git toolchain is missing or inaccessible in PATH');
    result.sandboxReadiness = 'DEGRADED';
  }

  return result;
}
