import type { Step, WorkflowMode } from '../types/index.js';

export interface DependencyGraph<T> {
  nodeMap: Map<string, T>;
  inDegree: Map<string, number>;
  dependents: Map<string, string[]>;
}

export interface TopologicalSortResult<T> {
  sorted: T[];
  cyclic: string[];
}

export function buildDependencyGraph<T extends { id: string; dependsOn?: string[] }>(
  nodes: T[]
): DependencyGraph<T> {
  const nodeMap = new Map<string, T>();
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
    inDegree.set(node.id, 0);
    dependents.set(node.id, []);
  }

  for (const node of nodes) {
    if (node.dependsOn) {
      for (const depId of node.dependsOn) {
        if (nodeMap.has(depId)) {
          inDegree.set(node.id, (inDegree.get(node.id) || 0) + 1);
          dependents.get(depId)?.push(node.id);
        }
      }
    }
  }

  return { nodeMap, inDegree, dependents };
}

export function topologicalSort<T extends { id: string; dependsOn?: string[] }>(
  nodes: T[],
  mode: WorkflowMode = 'relaxed'
): T[] {
  const { nodeMap, inDegree, dependents } = buildDependencyGraph(nodes);

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const sorted: T[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id)!;
    sorted.push(node);

    for (const dependentId of dependents.get(id) || []) {
      const newDegree = (inDegree.get(dependentId) || 1) - 1;
      inDegree.set(dependentId, newDegree);
      if (newDegree === 0) {
        queue.push(dependentId);
      }
    }
  }

  if (sorted.length !== nodes.length) {
    const remaining = nodes.filter(n => !sorted.includes(n));
    const remainingIds = remaining.map(n => n.id);

    if (mode === 'strict') {
      throw new Error(
        `Cyclic dependency detected in nodes: ${remainingIds.join(', ')}. Execution aborted.`
      );
    }

    if (mode === 'relaxed' || mode === 'consensus') {
      console.warn(
        `Warning: Cyclic dependency detected in nodes: ${remainingIds.join(', ')}. Skipping cyclic nodes.`
      );
    }
  }

  return sorted;
}

export function detectCycles<T extends { id: string; dependsOn?: string[] }>(
  nodes: T[]
): string[][] {
  const { nodeMap, inDegree, dependents } = buildDependencyGraph(nodes);
  const visited = new Set<string>();
  const cycles: string[][] = [];

  function dfs(nodeId: string, path: string[], pathSet: Set<string>): void {
    if (pathSet.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      cycles.push(path.slice(cycleStart).concat(nodeId));
      return;
    }

    if (visited.has(nodeId)) {
      return;
    }

    visited.add(nodeId);
    path.push(nodeId);
    pathSet.add(nodeId);

    for (const dependentId of dependents.get(nodeId) || []) {
      dfs(dependentId, path, pathSet);
    }

    path.pop();
    pathSet.delete(nodeId);
  }

  for (const [id] of nodeMap) {
    if (!visited.has(id)) {
      dfs(id, [], new Set());
    }
  }

  return cycles;
}

export function getReadyNodes<T extends { id: string; dependsOn?: string[] }>(
  graph: DependencyGraph<T>
): string[] {
  const ready: string[] = [];
  for (const [id, degree] of graph.inDegree) {
    if (degree === 0) {
      ready.push(id);
    }
  }
  return ready;
}

export function updateDependency<T extends { id: string; dependsOn?: string[] }>(
  graph: DependencyGraph<T>,
  completedId: string
): string[] {
  const ready: string[] = [];
  for (const dependentId of graph.dependents.get(completedId) || []) {
    const newDegree = (graph.inDegree.get(dependentId) || 1) - 1;
    graph.inDegree.set(dependentId, newDegree);
    if (newDegree === 0) {
      ready.push(dependentId);
    }
  }
  return ready;
}
