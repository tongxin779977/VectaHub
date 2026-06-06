import { describe, it, expect } from 'vitest';
import {
  buildDependencyGraph,
  topologicalSort,
  detectCycles,
  getReadyNodes,
  updateDependency,
  validateDependencies,
} from './dag.js';

interface TestNode {
  id: string;
  dependsOn?: string[];
}

describe('dag', () => {
  describe('buildDependencyGraph', () => {
    it('should build graph for independent nodes', () => {
      const nodes: TestNode[] = [
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
      ];

      const graph = buildDependencyGraph(nodes);

      expect(graph.nodeMap.size).toBe(3);
      expect(graph.inDegree.get('a')).toBe(0);
      expect(graph.inDegree.get('b')).toBe(0);
      expect(graph.inDegree.get('c')).toBe(0);
    });

    it('should build graph with dependencies', () => {
      const nodes: TestNode[] = [
        { id: 'a' },
        { id: 'b', dependsOn: ['a'] },
        { id: 'c', dependsOn: ['b'] },
      ];

      const graph = buildDependencyGraph(nodes);

      expect(graph.inDegree.get('a')).toBe(0);
      expect(graph.inDegree.get('b')).toBe(1);
      expect(graph.inDegree.get('c')).toBe(1);
      expect(graph.dependents.get('a')).toEqual(['b']);
      expect(graph.dependents.get('b')).toEqual(['c']);
    });

    it('should handle multiple dependencies', () => {
      const nodes: TestNode[] = [
        { id: 'a' },
        { id: 'b' },
        { id: 'c', dependsOn: ['a', 'b'] },
      ];

      const graph = buildDependencyGraph(nodes);

      expect(graph.inDegree.get('c')).toBe(2);
    });

    it('should throw for non-existent dependencies', () => {
      const nodes: TestNode[] = [
        { id: 'a', dependsOn: ['non-existent'] },
      ];

      expect(() => buildDependencyGraph(nodes)).toThrow('Missing dependency target');
    });
  });

  describe('topologicalSort', () => {
    it('should sort independent nodes', () => {
      const nodes: TestNode[] = [
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
      ];

      const sorted = topologicalSort(nodes);

      expect(sorted.length).toBe(3);
      expect(sorted.map(n => n.id).sort()).toEqual(['a', 'b', 'c']);
    });

    it('should sort nodes with dependencies', () => {
      const nodes: TestNode[] = [
        { id: 'c', dependsOn: ['b'] },
        { id: 'a' },
        { id: 'b', dependsOn: ['a'] },
      ];

      const sorted = topologicalSort(nodes);

      expect(sorted.map(n => n.id)).toEqual(['a', 'b', 'c']);
    });

    it('should detect cycles in strict mode', () => {
      const nodes: TestNode[] = [
        { id: 'a', dependsOn: ['c'] },
        { id: 'b', dependsOn: ['a'] },
        { id: 'c', dependsOn: ['b'] },
      ];

      expect(() => topologicalSort(nodes, 'strict')).toThrow('Cyclic dependency');
    });

    it('should detect cycles in relaxed mode', () => {
      const nodes: TestNode[] = [
        { id: 'a', dependsOn: ['c'] },
        { id: 'b', dependsOn: ['a'] },
        { id: 'c', dependsOn: ['b'] },
      ];

      expect(() => topologicalSort(nodes, 'relaxed')).toThrow('Cyclic dependency');
    });

    it('should handle diamond dependencies', () => {
      const nodes: TestNode[] = [
        { id: 'a' },
        { id: 'b', dependsOn: ['a'] },
        { id: 'c', dependsOn: ['a'] },
        { id: 'd', dependsOn: ['b', 'c'] },
      ];

      const sorted = topologicalSort(nodes);

      expect(sorted[0].id).toBe('a');
      expect(['b', 'c']).toContain(sorted[1].id);
      expect(['b', 'c']).toContain(sorted[2].id);
      expect(sorted[3].id).toBe('d');
    });
  });

  describe('detectCycles', () => {
    it('should return empty for DAG', () => {
      const nodes: TestNode[] = [
        { id: 'a' },
        { id: 'b', dependsOn: ['a'] },
      ];

      const cycles = detectCycles(nodes);

      expect(cycles.length).toBe(0);
    });

    it('should detect simple cycle', () => {
      const nodes: TestNode[] = [
        { id: 'a', dependsOn: ['b'] },
        { id: 'b', dependsOn: ['a'] },
      ];

      const cycles = detectCycles(nodes);

      expect(cycles.length).toBeGreaterThan(0);
    });

    it('should detect multiple cycles', () => {
      const nodes: TestNode[] = [
        { id: 'a', dependsOn: ['b'] },
        { id: 'b', dependsOn: ['a'] },
        { id: 'c', dependsOn: ['d'] },
        { id: 'd', dependsOn: ['c'] },
      ];

      const cycles = detectCycles(nodes);

      expect(cycles.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getReadyNodes', () => {
    it('should return nodes with zero in-degree', () => {
      const nodes: TestNode[] = [
        { id: 'a' },
        { id: 'b', dependsOn: ['a'] },
        { id: 'c' },
      ];

      const graph = buildDependencyGraph(nodes);
      const ready = getReadyNodes(graph);

      expect(ready.sort()).toEqual(['a', 'c']);
    });

    it('should return empty for all dependent nodes', () => {
      const nodes: TestNode[] = [
        { id: 'a', dependsOn: ['b'] },
        { id: 'b', dependsOn: ['a'] },
      ];

      const graph = buildDependencyGraph(nodes);
      const ready = getReadyNodes(graph);

      expect(ready.length).toBe(0);
    });
  });

  describe('updateDependency', () => {
    it('should update in-degrees after node completion', () => {
      const nodes: TestNode[] = [
        { id: 'a' },
        { id: 'b', dependsOn: ['a'] },
        { id: 'c', dependsOn: ['a'] },
      ];

      const graph = buildDependencyGraph(nodes);
      const newlyReady = updateDependency(graph, 'a');

      expect(newlyReady.sort()).toEqual(['b', 'c']);
      expect(graph.inDegree.get('b')).toBe(0);
      expect(graph.inDegree.get('c')).toBe(0);
    });

    it('should only return nodes that become ready', () => {
      const nodes: TestNode[] = [
        { id: 'a' },
        { id: 'b', dependsOn: ['a'] },
        { id: 'c', dependsOn: ['a', 'b'] },
      ];

      const graph = buildDependencyGraph(nodes);
      const newlyReady = updateDependency(graph, 'a');

      expect(newlyReady).toEqual(['b']);
      expect(graph.inDegree.get('c')).toBe(1);
    });
  });

  describe('validateDependencies', () => {
    it('should pass for valid DAG', () => {
      const nodes: TestNode[] = [
        { id: 'a' },
        { id: 'b', dependsOn: ['a'] },
      ];

      expect(() => validateDependencies(nodes)).not.toThrow();
    });

    it('should throw when dependency target is missing', () => {
      const nodes: TestNode[] = [
        { id: 'a', dependsOn: ['missing'] },
      ];

      expect(() => validateDependencies(nodes)).toThrow('Missing dependency target');
    });

    it('should throw when cycle exists', () => {
      const nodes: TestNode[] = [
        { id: 'a', dependsOn: ['b'] },
        { id: 'b', dependsOn: ['a'] },
      ];

      expect(() => validateDependencies(nodes)).toThrow('Cyclic dependency');
    });
  });
});
