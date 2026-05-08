import { describe, it, expect, beforeEach } from 'vitest';
import { TaskRunRecord, createTaskHistory, TaskHistoryService } from '../src/project/taskHistory.js';

describe('TaskHistory Service', () => {
  let historyService: TaskHistoryService;

  beforeEach(() => {
    historyService = createTaskHistory();
    historyService.clear();
  });

  describe('TaskRunRecord model', () => {
    it('should create a valid TaskRunRecord', () => {
      const record: TaskRunRecord = {
        id: 'test-1',
        label: 'test-task',
        kind: 'test',
        source: 'package-json',
        status: 'success',
        startedAt: new Date(),
        endedAt: new Date()
      };

      expect(record.id).toBe('test-1');
      expect(record.label).toBe('test-task');
      expect(record.status).toBe('success');
    });

    it('should support failed status', () => {
      const record: TaskRunRecord = {
        id: 'test-2',
        label: 'failed-task',
        kind: 'test',
        source: 'package-json',
        status: 'failed',
        errorMessage: 'Command failed',
        startedAt: new Date(),
        endedAt: new Date()
      };

      expect(record.status).toBe('failed');
      expect(record.errorMessage).toBe('Command failed');
    });
  });

  describe('add()', () => {
    it('should add a record to history', () => {
      const record: TaskRunRecord = {
        id: 'record-1',
        label: 'Test Task',
        kind: 'test',
        source: 'package-json',
        status: 'success',
        startedAt: new Date(),
        endedAt: new Date()
      };

      historyService.add(record);

      const recent = historyService.getRecent(10);
      expect(recent).toHaveLength(1);
      expect(recent[0].id).toBe('record-1');
    });

    it('should add failed record to both recent and failed', () => {
      const record: TaskRunRecord = {
        id: 'record-2',
        label: 'Failed Task',
        kind: 'test',
        source: 'package-json',
        status: 'failed',
        errorMessage: 'Test failed',
        startedAt: new Date(),
        endedAt: new Date()
      };

      historyService.add(record);

      const recent = historyService.getRecent(10);
      const failed = historyService.getFailed(10);

      expect(recent).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0].id).toBe('record-2');
      expect(failed[0].status).toBe('failed');
    });
  });

  describe('getRecent()', () => {
    it('should return empty array when no records', () => {
      const recent = historyService.getRecent(10);
      expect(recent).toHaveLength(0);
    });

    it('should return records in LIFO order', () => {
      const record1: TaskRunRecord = {
        id: 'record-1',
        label: 'Task 1',
        kind: 'test',
        source: 'package-json',
        status: 'success',
        startedAt: new Date(),
        endedAt: new Date()
      };
      const record2: TaskRunRecord = {
        id: 'record-2',
        label: 'Task 2',
        kind: 'build',
        source: 'package-json',
        status: 'success',
        startedAt: new Date(),
        endedAt: new Date()
      };

      historyService.add(record1);
      historyService.add(record2);

      const recent = historyService.getRecent(10);
      expect(recent).toHaveLength(2);
      expect(recent[0].id).toBe('record-2');
      expect(recent[1].id).toBe('record-1');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        historyService.add({
          id: `record-${i}`,
          label: `Task ${i}`,
          kind: 'test',
          source: 'package-json',
          status: 'success',
          startedAt: new Date(),
          endedAt: new Date()
        });
      }

      const recent = historyService.getRecent(3);
      expect(recent).toHaveLength(3);
      expect(recent[0].id).toBe('record-4');
      expect(recent[2].id).toBe('record-2');
    });
  });

  describe('getFailed()', () => {
    it('should return empty array when no failed records', () => {
      historyService.add({
        id: 'success-record',
        label: 'Success Task',
        kind: 'test',
        source: 'package-json',
        status: 'success',
        startedAt: new Date(),
        endedAt: new Date()
      });

      const failed = historyService.getFailed(10);
      expect(failed).toHaveLength(0);
    });

    it('should return only failed records', () => {
      historyService.add({
        id: 'success-record',
        label: 'Success Task',
        kind: 'test',
        source: 'package-json',
        status: 'success',
        startedAt: new Date(),
        endedAt: new Date()
      });
      historyService.add({
        id: 'failed-record-1',
        label: 'Failed Task 1',
        kind: 'test',
        source: 'package-json',
        status: 'failed',
        errorMessage: 'Error 1',
        startedAt: new Date(),
        endedAt: new Date()
      });
      historyService.add({
        id: 'failed-record-2',
        label: 'Failed Task 2',
        kind: 'build',
        source: 'package-json',
        status: 'failed',
        errorMessage: 'Error 2',
        startedAt: new Date(),
        endedAt: new Date()
      });

      const failed = historyService.getFailed(10);
      expect(failed).toHaveLength(2);
      expect(failed.every(r => r.status === 'failed')).toBe(true);
    });

    it('should return failed records in LIFO order', () => {
      historyService.add({
        id: 'failed-1',
        label: 'Failed Task 1',
        kind: 'test',
        source: 'package-json',
        status: 'failed',
        startedAt: new Date(),
        endedAt: new Date()
      });
      historyService.add({
        id: 'failed-2',
        label: 'Failed Task 2',
        kind: 'test',
        source: 'package-json',
        status: 'failed',
        startedAt: new Date(),
        endedAt: new Date()
      });

      const failed = historyService.getFailed(10);
      expect(failed).toHaveLength(2);
      expect(failed[0].id).toBe('failed-2');
      expect(failed[1].id).toBe('failed-1');
    });
  });
});