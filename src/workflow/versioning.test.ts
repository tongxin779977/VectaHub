import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  saveVersion,
  listVersions,
  rollbackVersion,
  type WorkflowVersion,
} from './versioning.js';
import { MockEnvironmentService } from '../infrastructure/testing/mock-services.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let TEST_DIR: string;
const WF_ID = 'wf_test_123';
let environment: MockEnvironmentService;

function makeYAML(name: string, stepCount: number): string {
  const steps = Array.from({ length: stepCount }, (_, i) =>
    `  - id: s${i + 1}\n    type: exec\n    cli: echo\n    args: ["step ${i + 1}"]`
  ).join('\n');
  return `name: ${name}\nmode: relaxed\nsteps:\n${steps}\n`;
}

describe('WorkflowVersioning', () => {
  beforeEach(() => {
    environment = new MockEnvironmentService();
    TEST_DIR = mkdtempSync(join(tmpdir(), 'vectahub-test-versioning-'));
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('saveVersion', () => {
    it('should save a version and return version info', () => {
      const yaml = makeYAML('test-wf', 2);
      const version = saveVersion(environment, TEST_DIR, WF_ID, yaml, 'Initial version');
      expect(version.version).toBe(1);
      expect(version.workflowId).toBe(WF_ID);
      expect(version.message).toBe('Initial version');
      expect(version.createdAt).toBeInstanceOf(Date);
    });

    it('should increment version numbers', () => {
      const v1 = saveVersion(environment, TEST_DIR, WF_ID, makeYAML('wf', 1), 'v1');
      const v2 = saveVersion(environment, TEST_DIR, WF_ID, makeYAML('wf', 2), 'v2');
      const v3 = saveVersion(environment, TEST_DIR, WF_ID, makeYAML('wf', 3), 'v3');
      expect(v1.version).toBe(1);
      expect(v2.version).toBe(2);
      expect(v3.version).toBe(3);
    });

    it('should create version directory structure', () => {
      saveVersion(environment, TEST_DIR, WF_ID, makeYAML('wf', 1), 'first');
      const versionDir = environment.joinPath(TEST_DIR, WF_ID, 'versions', '1');
      expect(environment.exists(versionDir)).toBe(true);
      expect(environment.exists(environment.joinPath(versionDir, 'workflow.yaml'))).toBe(true);
      expect(environment.exists(environment.joinPath(versionDir, 'meta.json'))).toBe(true);
    });

    it('should persist YAML content', () => {
      const yaml = makeYAML('test', 5);
      saveVersion(environment, TEST_DIR, WF_ID, yaml, 'save');
      const saved = environment.readFile(environment.joinPath(TEST_DIR, WF_ID, 'versions', '1', 'workflow.yaml'));
      expect(saved).toBe(yaml);
    });

    it('should persist meta with message', () => {
      saveVersion(environment, TEST_DIR, WF_ID, makeYAML('wf', 1), 'my message');
      const meta = JSON.parse(
        environment.readFile(environment.joinPath(TEST_DIR, WF_ID, 'versions', '1', 'meta.json'))
      );
      expect(meta.message).toBe('my message');
      expect(meta.version).toBe(1);
    });
  });

  describe('listVersions', () => {
    it('should list all versions', () => {
      saveVersion(environment, TEST_DIR, WF_ID, makeYAML('wf', 1), 'v1');
      saveVersion(environment, TEST_DIR, WF_ID, makeYAML('wf', 2), 'v2');
      saveVersion(environment, TEST_DIR, WF_ID, makeYAML('wf', 3), 'v3');
      const versions = listVersions(environment, TEST_DIR, WF_ID);
      expect(versions.length).toBe(3);
      expect(versions.map(v => v.version)).toEqual([1, 2, 3]);
    });

    it('should return empty for unknown workflow', () => {
      const versions = listVersions(environment, TEST_DIR, 'wf_unknown');
      expect(versions.length).toBe(0);
    });

    it('should include version messages', () => {
      saveVersion(environment, TEST_DIR, WF_ID, makeYAML('wf', 1), 'first commit');
      saveVersion(environment, TEST_DIR, WF_ID, makeYAML('wf', 2), 'second commit');
      const versions = listVersions(environment, TEST_DIR, WF_ID);
      expect(versions[0].message).toBe('first commit');
      expect(versions[1].message).toBe('second commit');
    });
  });

  describe('rollbackVersion', () => {
    it('should return the YAML of the specified version', () => {
      const yaml1 = makeYAML('wf-v1', 1);
      const yaml2 = makeYAML('wf-v2', 2);
      const yaml3 = makeYAML('wf-v3', 3);
      saveVersion(environment, TEST_DIR, WF_ID, yaml1, 'v1');
      saveVersion(environment, TEST_DIR, WF_ID, yaml2, 'v2');
      saveVersion(environment, TEST_DIR, WF_ID, yaml3, 'v3');

      const rolled = rollbackVersion(environment, TEST_DIR, WF_ID, 1);
      expect(rolled).toBe(yaml1);
    });

    it('should return latest version when version is 0', () => {
      saveVersion(environment, TEST_DIR, WF_ID, makeYAML('old', 1), 'old');
      saveVersion(environment, TEST_DIR, WF_ID, makeYAML('new', 2), 'new');

      const rolled = rollbackVersion(environment, TEST_DIR, WF_ID, 0);
      expect(rolled).toContain('new');
    });

    it('should throw for non-existent version', () => {
      expect(() => rollbackVersion(environment, TEST_DIR, WF_ID, 99)).toThrow();
    });

    it('should throw for unknown workflow', () => {
      expect(() => rollbackVersion(environment, TEST_DIR, 'wf_unknown', 1)).toThrow();
    });
  });
});
