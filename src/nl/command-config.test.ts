import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { loadCommandConfig, loadIntentConfig, CommandConfig, IntentConfig } from './command-config.js';

const TEST_DIR = '/tmp/vectahub-test-command-config';

const TEMPLATES_YAML = `
version: '1.0.0'
templates:
  GIT_OPERATION:
    - name: commit
      cli: git
      args: ['commit', '-m', '\${message}']
      params:
        message: auto commit
    - name: push
      cli: git
      args: ['push', 'origin', '\${branch}']
      params:
        branch: main

  PACKAGE_INSTALL:
    - name: install
      cli: '\${detectedCLI}'
      args: ['install', '\${flags}', '\${package}']
      params:
        flags: ''

  QUERY_EXEC:
    - name: ls
      cli: ls
      args: ['\${path}']
      params:
        path: .
`;

const INTENTS_YAML = `
version: '1.0.0'
intents:
  GIT_WORKFLOW:
    taskType: GIT_OPERATION
    selection:
      - when:
          keywords: [push]
          exclude: [add, commit]
        pick: push
      - when:
          keywords: [commit]
          exclude: [add]
        pick: commit
      - default: true
        pick: [add, commit]

  SYSTEM_INFO:
    taskType: QUERY_EXEC
    selection:
      - when:
          keywords: [磁盘, disk]
        pick: ls
        override:
          cli: df
          args: ['-h']
      - default: true
        pick: ls
        override:
          cli: uname
          args: ['-a']

  INSTALL_PACKAGE:
    taskType: PACKAGE_INSTALL
    selection:
      - default: true
        pick: install
        params:
          package: lodash
`;

describe('CommandConfig', () => {
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

  describe('loadCommandConfig', () => {
    it('should load templates from YAML file', () => {
      const configPath = join(TEST_DIR, 'templates.yaml');
      writeFileSync(configPath, TEMPLATES_YAML);
      const config = loadCommandConfig(configPath);
      expect(config.version).toBe('1.0.0');
      expect(config.templates.GIT_OPERATION).toBeDefined();
      expect(config.templates.GIT_OPERATION.length).toBe(2);
      expect(config.templates.GIT_OPERATION[0].name).toBe('commit');
    });

    it('should return empty config when file not found', () => {
      const config = loadCommandConfig('/nonexistent/path.yaml');
      expect(config.version).toBe('');
      expect(Object.keys(config.templates).length).toBe(0);
    });

    it('should parse command template fields correctly', () => {
      const configPath = join(TEST_DIR, 'templates.yaml');
      writeFileSync(configPath, TEMPLATES_YAML);
      const config = loadCommandConfig(configPath);
      const commit = config.templates.GIT_OPERATION[0];
      expect(commit.cli).toBe('git');
      expect(commit.args).toEqual(['commit', '-m', '${message}']);
      expect(commit.params).toEqual({ message: 'auto commit' });
    });

    it('should parse template with variable CLI', () => {
      const configPath = join(TEST_DIR, 'templates.yaml');
      writeFileSync(configPath, TEMPLATES_YAML);
      const config = loadCommandConfig(configPath);
      const install = config.templates.PACKAGE_INSTALL[0];
      expect(install.cli).toBe('${detectedCLI}');
      expect(install.args).toContain('${package}');
    });

    it('should return empty config for invalid YAML', () => {
      const configPath = join(TEST_DIR, 'invalid.yaml');
      writeFileSync(configPath, 'invalid: yaml: [[[');
      const config = loadCommandConfig(configPath);
      expect(config.version).toBe('');
      expect(Object.keys(config.templates).length).toBe(0);
    });

    it('should load all TaskType keys', () => {
      const configPath = join(TEST_DIR, 'templates.yaml');
      writeFileSync(configPath, TEMPLATES_YAML);
      const config = loadCommandConfig(configPath);
      expect(Object.keys(config.templates)).toContain('GIT_OPERATION');
      expect(Object.keys(config.templates)).toContain('PACKAGE_INSTALL');
      expect(Object.keys(config.templates)).toContain('QUERY_EXEC');
    });

    it('should preserve template name field', () => {
      const configPath = join(TEST_DIR, 'templates.yaml');
      writeFileSync(configPath, TEMPLATES_YAML);
      const config = loadCommandConfig(configPath);
      expect(config.templates.GIT_OPERATION[0].name).toBe('commit');
      expect(config.templates.GIT_OPERATION[1].name).toBe('push');
    });
  });

  describe('loadIntentConfig', () => {
    it('should load intent mappings from YAML file', () => {
      const configPath = join(TEST_DIR, 'intents.yaml');
      writeFileSync(configPath, INTENTS_YAML);
      const config = loadIntentConfig(configPath);
      expect(config.version).toBe('1.0.0');
      expect(config.intents.GIT_WORKFLOW).toBeDefined();
      expect(config.intents.GIT_WORKFLOW.taskType).toBe('GIT_OPERATION');
    });

    it('should return empty config when file not found', () => {
      const config = loadIntentConfig('/nonexistent/path.yaml');
      expect(config.version).toBe('');
      expect(Object.keys(config.intents).length).toBe(0);
    });

    it('should parse selection with when keywords', () => {
      const configPath = join(TEST_DIR, 'intents.yaml');
      writeFileSync(configPath, INTENTS_YAML);
      const config = loadIntentConfig(configPath);
      const gitSel = config.intents.GIT_WORKFLOW.selection;
      expect(gitSel[0].when?.keywords).toEqual(['push']);
      expect(gitSel[0].pick).toBe('push');
    });

    it('should parse selection with exclude', () => {
      const configPath = join(TEST_DIR, 'intents.yaml');
      writeFileSync(configPath, INTENTS_YAML);
      const config = loadIntentConfig(configPath);
      const gitSel = config.intents.GIT_WORKFLOW.selection;
      expect(gitSel[0].when?.exclude).toEqual(['add', 'commit']);
    });

    it('should parse default selection', () => {
      const configPath = join(TEST_DIR, 'intents.yaml');
      writeFileSync(configPath, INTENTS_YAML);
      const config = loadIntentConfig(configPath);
      const defaultSel = config.intents.GIT_WORKFLOW.selection[2];
      expect(defaultSel.default).toBe(true);
      expect(defaultSel.pick).toEqual(['add', 'commit']);
    });

    it('should parse override commands', () => {
      const configPath = join(TEST_DIR, 'intents.yaml');
      writeFileSync(configPath, INTENTS_YAML);
      const config = loadIntentConfig(configPath);
      const sysInfo = config.intents.SYSTEM_INFO.selection;
      expect(sysInfo[0].override?.cli).toBe('df');
      expect(sysInfo[0].override?.args).toEqual(['-h']);
    });

    it('should parse selection params', () => {
      const configPath = join(TEST_DIR, 'intents.yaml');
      writeFileSync(configPath, INTENTS_YAML);
      const config = loadIntentConfig(configPath);
      const install = config.intents.INSTALL_PACKAGE.selection[0];
      expect(install.params?.package).toBe('lodash');
    });

    it('should load all intent keys', () => {
      const configPath = join(TEST_DIR, 'intents.yaml');
      writeFileSync(configPath, INTENTS_YAML);
      const config = loadIntentConfig(configPath);
      expect(Object.keys(config.intents)).toContain('GIT_WORKFLOW');
      expect(Object.keys(config.intents)).toContain('SYSTEM_INFO');
      expect(Object.keys(config.intents)).toContain('INSTALL_PACKAGE');
    });

    it('should load the full config from the project', () => {
      const configPath = join(process.cwd(), 'config', 'commands', 'intents.yaml');
      if (existsSync(configPath)) {
        const config = loadIntentConfig(configPath);
        expect(Object.keys(config.intents).length).toBeGreaterThanOrEqual(14);
      }
    });
  });
});
