import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  saveVersion,
  listVersions,
  rollbackVersion,
  type WorkflowVersion,
} from './versioning.js';

const TEST_DIR = '/tmp/vectahub-test-versioning';
const WF_ID = 'wf_test_123';

function makeYAML(name: string, stepCount: number): string {
  const steps = Array.from({ length: stepCount }, (_, i) =>
    `  - id: s${i + 1}\n    type: exec\n    cli: echo\n    args: ["step ${i + 1}"]`
  ).join('\n');
  return `name: ${name}\nmode: relaxed\nsteps:\n${steps}\n`;
}

describe('WorkflowVersioning', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('saveVersion', () => {
    it('should save a version and return version info', () => {
      const yaml = makeYAML('test-wf', 2);
      const version = saveVersion(TEST_DIR, WF_ID, yaml, 'Initial version');
      expect(version.version).toBe(1);
      expect(version.workflowId).toBe(WF_ID);
      expect(version.message).toBe('Initial version');
      expect(version.createdAt).toBeInstanceOf(Date);
    });

    it('should increment version numbers', () => {
      const v1 = saveVersion(TEST_DIR, WF_ID, makeYAML('wf', 1), 'v1');
      const v2 = saveVersion(TEST_DIR, WF_ID, makeYAML('wf', 2), 'v2');
      const v3 = saveVersion(TEST_DIR, WF_ID, makeYAML('wf', 3), 'v3');
      expect(v1.version).toBe(1);
      expect(v2.version).toBe(2);
      expect(v3.version).toBe(3);
    });

    it('should create version directory structure', () => {
      saveVersion(TEST_DIR, WF_ID, makeYAML('wf', 1), 'first');
      const versionDir = join(TEST_DIR, WF_ID, 'versions', '1');
      expect(existsSync(versionDir)).toBe(true);
      expect(existsSync(join(versionDir, 'workflow.yaml'))).toBe(true);
      expect(existsSync(join(versionDir, 'meta.json'))).toBe(true);
    });

    it('should persist YAML content', () => {
      const yaml = makeYAML('test', 5);
      saveVersion(TEST_DIR, WF_ID, yaml, 'save');
      const saved = readFileSync(join(TEST_DIR, WF_ID, 'versions', '1', 'workflow.yaml'), 'utf-8');
      expect(saved).toBe(yaml);
    });

    it('should persist meta with message', () => {
      saveVersion(TEST_DIR, WF_ID, makeYAML('wf', 1), 'my message');
      const meta = JSON.parse(
        readFileSync(join(TEST_DIR, WF_ID, 'versions', '1', 'meta.json'), 'utf-8')
      );
      expect(meta.message).toBe('my message');
      expect(meta.version).toBe(1);
    });
  });

  describe('listVersions', () => {
    it('should list all versions', () => {
      saveVersion(TEST_DIR, WF_ID, makeYAML('wf', 1), 'v1');
      saveVersion(TEST_DIR, WF_ID, makeYAML('wf', 2), 'v2');
      saveVersion(TEST_DIR, WF_ID, makeYAML('wf', 3), 'v3');
      const versions = listVersions(TEST_DIR, WF_ID);
      expect(versions.length).toBe(3);
      expect(versions.map(v => v.version)).toEqual([1, 2, 3]);
    });

    it('should return empty for unknown workflow', () => {
      const versions = listVersions(TEST_DIR, 'wf_unknown');
      expect(versions.length).toBe(0);
    });

    it('should include version messages', () => {
      saveVersion(TEST_DIR, WF_ID, makeYAML('wf', 1), 'first commit');
      saveVersion(TEST_DIR, WF_ID, makeYAML('wf', 2), 'second commit');
      const versions = listVersions(TEST_DIR, WF_ID);
      expect(versions[0].message).toBe('first commit');
      expect(versions[1].message).toBe('second commit');
    });
  });

  describe('rollbackVersion', () => {
    it('should return the YAML of the specified version', () => {
      const yaml1 = makeYAML('wf-v1', 1);
      const yaml2 = makeYAML('wf-v2', 2);
      const yaml3 = makeYAML('wf-v3', 3);
      saveVersion(TEST_DIR, WF_ID, yaml1, 'v1');
      saveVersion(TEST_DIR, WF_ID, yaml2, 'v2');
      saveVersion(TEST_DIR, WF_ID, yaml3, 'v3');

      const rolled = rollbackVersion(TEST_DIR, WF_ID, 1);
      expect(rolled).toBe(yaml1);
    });

    it('should return latest version when version is 0', () => {
      saveVersion(TEST_DIR, WF_ID, makeYAML('old', 1), 'old');
      saveVersion(TEST_DIR, WF_ID, makeYAML('new', 2), 'new');

      const rolled = rollbackVersion(TEST_DIR, WF_ID, 0);
      expect(rolled).toContain('new');
    });

    it('should throw for non-existent version', () => {
      expect(() => rollbackVersion(TEST_DIR, WF_ID, 99)).toThrow();
    });

    it('should throw for unknown workflow', () => {
      expect(() => rollbackVersion(TEST_DIR, 'wf_unknown', 1)).toThrow();
    });
  });
});
