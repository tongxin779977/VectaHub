import type { WorkflowMode } from '../types/index.js';

export interface DependencyGraph<T> {
  nodeMap: Map<string, T>;
  inDegree: Map<string, number>;
  dependents: Map<string, string[]>;
}

export interface TopologicalSortResult<T> {
  sorted: T[];
  cyclic: string[];
}

function collectMissingDependencies<T extends { id: string; dependsOn?: string[] }>(
  nodes: T[],
  satisfiedDependencyIds: ReadonlySet<string> = new Set()
): Array<{ nodeId: string; dependencyId: string }> {
  const nodeIds = new Set(nodes.map(node => node.id));
  const missing: Array<{ nodeId: string; dependencyId: string }> = [];

  for (const node of nodes) {
    for (const depId of node.dependsOn || []) {
      if (!nodeIds.has(depId) && !satisfiedDependencyIds.has(depId)) {
        missing.push({ nodeId: node.id, dependencyId: depId });
      }
    }
  }

  return missing;
}

function assertNoMissingDependencies<T extends { id: string; dependsOn?: string[] }>(
  nodes: T[],
  satisfiedDependencyIds: ReadonlySet<string> = new Set()
): void {
  const missing = collectMissingDependencies(nodes, satisfiedDependencyIds);
  if (missing.length === 0) {
    return;
  }

  const formatted = missing.map(item => `${item.nodeId} -> ${item.dependencyId}`).join(', ');
  throw new Error(`Missing dependency target(s): ${formatted}`);
}

export function validateDependencies<T extends { id: string; dependsOn?: string[] }>(
  nodes: T[],
  satisfiedDependencyIds: Iterable<string> = []
): void {
  const satisfiedIds = new Set(satisfiedDependencyIds);
  assertNoMissingDependencies(nodes, satisfiedIds);
  topologicalSort(nodes, 'relaxed', satisfiedIds);
}

export function buildDependencyGraph<T extends { id: string; dependsOn?: string[] }>(
  nodes: T[],
  satisfiedDependencyIds: Iterable<string> = []
): DependencyGraph<T> {
  const satisfiedIds = new Set(satisfiedDependencyIds);
  assertNoMissingDependencies(nodes, satisfiedIds);

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
          continue;
        }

        if (satisfiedIds.has(depId)) {
          continue;
        }
      }
    }
  }

  return { nodeMap, inDegree, dependents };
}

export function topologicalSort<T extends { id: string; dependsOn?: string[] }>(
  nodes: T[],
  mode: WorkflowMode = 'relaxed',
  satisfiedDependencyIds: Iterable<string> = []
): T[] {
  const { nodeMap, inDegree, dependents } = buildDependencyGraph(nodes, satisfiedDependencyIds);

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
    throw new Error(
      `Cyclic dependency detected in nodes: ${remainingIds.join(', ')}. Execution aborted.`
    );
  }

  void mode;
  return sorted;
}

export function detectCycles<T extends { id: string; dependsOn?: string[] }>(
  nodes: T[]
): string[][] {
  const { nodeMap, dependents } = buildDependencyGraph(nodes);
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
