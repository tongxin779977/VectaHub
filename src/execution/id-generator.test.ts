import { describe, it, expect } from 'vitest';
import { generateId, parseTimestamp } from './id-generator.js';

describe('generateId', () => {
  it('should generate ID with correct format', () => {
    const id = generateId();
    expect(id).toMatch(/^exec_\d{8}_\d{6}_[a-f0-9]{4}$/);
  });

  it('should generate unique IDs on multiple calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('should match the required regex pattern', () => {
    const pattern = /^exec_\d{8}_\d{6}_[a-f0-9]{4}$/;
    for (let i = 0; i < 10; i++) {
      expect(generateId()).toMatch(pattern);
    }
  });
});

describe('parseTimestamp', () => {
  it('should parse valid ID to correct date', () => {
    const date = parseTimestamp('exec_20260507_143025_a1b2');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(4);
    expect(date!.getDate()).toBe(7);
    expect(date!.getHours()).toBe(14);
    expect(date!.getMinutes()).toBe(30);
    expect(date!.getSeconds()).toBe(25);
  });

  it('should return null for invalid ID format', () => {
    expect(parseTimestamp('invalid')).toBeNull();
    expect(parseTimestamp('exec_bad')).toBeNull();
    expect(parseTimestamp('exec_12345_67890_abcd')).toBeNull();
    expect(parseTimestamp('')).toBeNull();
  });

  it('should return null for IDs that do not match format', () => {
    expect(parseTimestamp('exec_99999999_99999_abcd')).toBeNull();
    expect(parseTimestamp('exec_1234_56_78_12_34_56_xyz')).toBeNull();
  });

  it('should produce consistent results with generated IDs', () => {
    const id = generateId();
    const date = parseTimestamp(id);
    expect(date).not.toBeNull();
    expect(date instanceof Date).toBe(true);
  });
});
