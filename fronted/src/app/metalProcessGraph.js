export const METAL_STAGE_KEYS = ["laser", "saw", "bending", "welding", "painting"];

export const METAL_STAGE_LABELS = {
  laser: "Лазер",
  saw: "Пила",
  bending: "Гибка",
  welding: "Сварка",
  painting: "Покраска",
};

export const DEFAULT_METAL_ROUTE = ["laser", "bending", "welding", "painting"];

const START_NODE_ID = "start";

export function createLinearProcessGraph(stages = DEFAULT_METAL_ROUTE) {
  const safeStages = (Array.isArray(stages) ? stages : DEFAULT_METAL_ROUTE)
    .map((s) => String(s || "").trim().toLowerCase())
    .filter((s) => METAL_STAGE_KEYS.includes(s));
  const route = safeStages.length > 0 ? safeStages : [...DEFAULT_METAL_ROUTE];

  const nodes = [{ id: START_NODE_ID, kind: "start", x: 40, y: 140 }];
  const edges = [];
  let prev = START_NODE_ID;

  route.forEach((stage, index) => {
    const id = `s${index}`;
    nodes.push({
      id,
      kind: "stage",
      stage,
      x: 200 + index * 180,
      y: 140,
    });
    edges.push({
      id: `e-${prev}-${id}`,
      from: prev,
      to: id,
    });
    prev = id;
  });

  return { nodes, edges };
}

export const DEFAULT_PROCESS_GRAPH = createLinearProcessGraph(DEFAULT_METAL_ROUTE);

function parseGraphNodes(rawNodes) {
  if (!Array.isArray(rawNodes)) return [];
  return rawNodes
    .map((node) => {
      const id = String(node?.id || "").trim();
      if (!id) return null;
      const kind = String(node?.kind || "").trim().toLowerCase();
      if (kind === "start") {
        return {
          id,
          kind: "start",
          x: Number(node?.x ?? 40) || 40,
          y: Number(node?.y ?? 140) || 140,
        };
      }
      if (kind === "stage") {
        const stage = String(node?.stage || "").trim().toLowerCase();
        if (!METAL_STAGE_KEYS.includes(stage)) return null;
        const note = String(node?.note ?? node?.stageNote ?? "").trim();
        return {
          id,
          kind: "stage",
          stage,
          x: Number(node?.x ?? 0) || 0,
          y: Number(node?.y ?? 0) || 0,
          ...(note ? { note } : {}),
        };
      }
      return null;
    })
    .filter(Boolean);
}

function parseGraphEdges(rawEdges) {
  if (!Array.isArray(rawEdges)) return [];
  return rawEdges
    .map((edge, index) => {
      const from = String(edge?.from || "").trim();
      const to = String(edge?.to || "").trim();
      if (!from || !to || from === to) return null;
      const id = String(edge?.id || `e-${from}-${to}-${index}`).trim();
      return { id, from, to };
    })
    .filter(Boolean);
}

export function normalizeProcessGraph(input, fallbackRoute = DEFAULT_METAL_ROUTE) {
  if (!input || typeof input !== "object") {
    return createLinearProcessGraph(fallbackRoute);
  }

  let nodes = parseGraphNodes(input.nodes);
  let edges = parseGraphEdges(input.edges);

  if (!nodes.some((n) => n.kind === "start")) {
    nodes = [{ id: START_NODE_ID, kind: "start", x: 40, y: 140 }, ...nodes];
  }

  const startNode = nodes.find((n) => n.kind === "start") || { id: START_NODE_ID };
  const stageNodes = nodes.filter((n) => n.kind === "stage");

  if (stageNodes.length === 0) {
    return createLinearProcessGraph(fallbackRoute);
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  edges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));

  if (!edges.some((e) => e.from === startNode.id)) {
    const firstStage = stageNodes.sort((a, b) => a.x - b.x)[0];
    if (firstStage) {
      edges.unshift({
        id: `e-${startNode.id}-${firstStage.id}`,
        from: startNode.id,
        to: firstStage.id,
      });
    }
  }

  return { nodes, edges };
}

export function processGraphFromCatalogRow(row) {
  const rawGraph = row?.process_graph ?? row?.processGraph;
  if (rawGraph && typeof rawGraph === "object") {
    return normalizeProcessGraph(rawGraph, DEFAULT_METAL_ROUTE);
  }
  const rawRoute = row?.stage_route ?? row?.stageRoute;
  const route =
    Array.isArray(rawRoute) && rawRoute.length > 0
      ? rawRoute.map((s) => String(s || "").trim().toLowerCase()).filter((s) => METAL_STAGE_KEYS.includes(s))
      : DEFAULT_METAL_ROUTE;
  return createLinearProcessGraph(route.length > 0 ? route : DEFAULT_METAL_ROUTE);
}

function buildAdjacency(edges) {
  const adj = new Map();
  for (const edge of edges) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    adj.get(edge.from).push(edge.to);
  }
  return adj;
}

function buildReverseAdjacency(edges) {
  const rev = new Map();
  for (const edge of edges) {
    if (!rev.has(edge.to)) rev.set(edge.to, []);
    rev.get(edge.to).push(edge.from);
  }
  return rev;
}

function nodeById(nodes, id) {
  return nodes.find((n) => n.id === id) || null;
}

export function getGraphStartStages(graph) {
  const { nodes, edges } = normalizeProcessGraph(graph);
  const start = nodes.find((n) => n.kind === "start");
  const startId = start?.id || START_NODE_ID;
  const adj = buildAdjacency(edges);
  const direct = (adj.get(startId) || [])
    .map((id) => nodeById(nodes, id))
    .filter((n) => n?.kind === "stage")
    .map((n) => n.stage);

  if (direct.length > 0) return [...new Set(direct)];

  const rev = buildReverseAdjacency(edges);
  const roots = nodes
    .filter((n) => n.kind === "stage")
    .filter((n) => {
      const incoming = rev.get(n.id) || [];
      return incoming.length === 0 || incoming.every((fromId) => nodeById(nodes, fromId)?.kind === "start");
    })
    .map((n) => n.stage);

  return roots.length > 0 ? [...new Set(roots)] : [DEFAULT_METAL_ROUTE[0]];
}

export function deriveStageRouteFromGraph(graph) {
  const { nodes, edges } = normalizeProcessGraph(graph);
  const stageNodes = nodes.filter((n) => n.kind === "stage");
  if (stageNodes.length === 0) return [...DEFAULT_METAL_ROUTE];

  const rev = buildReverseAdjacency(edges);
  const adj = buildAdjacency(edges);
  const inDegree = new Map(stageNodes.map((n) => [n.id, 0]));

  for (const node of stageNodes) {
    const incoming = (rev.get(node.id) || []).filter((fromId) => {
      const from = nodeById(nodes, fromId);
      return from && from.kind !== "start";
    });
    inDegree.set(node.id, incoming.length);
  }

  const startLinked = new Set(
    (adj.get(START_NODE_ID) || []).filter((id) => nodeById(nodes, id)?.kind === "stage"),
  );
  for (const id of startLinked) {
    inDegree.set(id, 0);
  }

  const queue = stageNodes
    .filter((n) => (inDegree.get(n.id) || 0) === 0)
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((n) => n.id);

  const route = [];
  const visited = new Set();

  while (queue.length > 0) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodeById(nodes, id);
    if (node?.kind === "stage") route.push(node.stage);

    for (const nextId of adj.get(id) || []) {
      const next = nodeById(nodes, nextId);
      if (next?.kind !== "stage") continue;
      inDegree.set(nextId, (inDegree.get(nextId) || 0) - 1);
      if ((inDegree.get(nextId) || 0) <= 0) queue.push(nextId);
    }

    queue.sort((a, b) => {
      const na = nodeById(nodes, a);
      const nb = nodeById(nodes, b);
      return (na?.x || 0) - (nb?.x || 0) || (na?.y || 0) - (nb?.y || 0);
    });
  }

  if (route.length === 0) {
    return stageNodes.sort((a, b) => a.x - b.x).map((n) => n.stage);
  }
  return route;
}

export function describeProcessGraph(graph) {
  const { nodes, edges } = normalizeProcessGraph(graph);
  const stageCount = nodes.filter((n) => n.kind === "stage").length;
  const stageIds = new Set(nodes.filter((n) => n.kind === "stage").map((n) => n.id));

  let splits = 0;
  let merges = 0;
  for (const node of nodes) {
    if (node.kind !== "stage") continue;
    const out = (edges.filter((e) => e.from === node.id) || []).filter((e) => stageIds.has(e.to));
    const inn = (edges.filter((e) => e.to === node.id) || []).filter((e) => stageIds.has(e.from));
    if (out.length > 1) splits += 1;
    if (inn.length > 1) merges += 1;
  }

  const parts = [`${stageCount} этап.`];
  if (splits > 0) parts.push(`${splits} развил.`);
  if (merges > 0) parts.push(`${merges} слиян.`);
  return parts.join(" · ");
}

export function validateProcessGraph(graph) {
  const errors = [];
  const normalized = normalizeProcessGraph(graph);
  const { nodes, edges } = normalized;
  const stageNodes = nodes.filter((n) => n.kind === "stage");

  if (stageNodes.length === 0) {
    errors.push("Добавьте хотя бы один этап.");
    return { ok: false, errors, warnings: [], graph: normalized };
  }

  const start = nodes.find((n) => n.kind === "start");
  if (!start) {
    errors.push("На схеме должен быть узел «Старт».");
  }

  const adj = buildAdjacency(edges);
  const visited = new Set();
  const stack = new Set();
  const cycleAt = [];

  function dfs(nodeId) {
    visited.add(nodeId);
    stack.add(nodeId);
    for (const nextId of adj.get(nodeId) || []) {
      if (!visited.has(nextId)) {
        dfs(nextId);
      } else if (stack.has(nextId)) {
        cycleAt.push(nextId);
      }
    }
    stack.delete(nodeId);
  }

  dfs(start?.id || START_NODE_ID);
  if (cycleAt.length > 0) {
    errors.push("В схеме есть цикл — уберите лишние стрелки.");
  }

  const reachable = new Set();
  const queue = [start?.id || START_NODE_ID];
  while (queue.length > 0) {
    const id = queue.shift();
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const nextId of adj.get(id) || []) queue.push(nextId);
  }

  const unreachable = stageNodes.filter((n) => !reachable.has(n.id));
  if (unreachable.length > 0) {
    errors.push("Есть этапы без связи со «Старт» — проведите стрелку от старта или другого этапа.");
  }

  const warnings = [];
  const runtime = analyzeProcessGraphRuntime(normalized);
  if (!runtime.supported) {
    warnings.push(...runtime.warnings);
  }

  return { ok: errors.length === 0, errors, warnings, graph: normalized, runtime };
}

export function graphHasParallelBranches(graph) {
  const runtime = analyzeProcessGraphRuntime(graph);
  return runtime.mode === "parallel";
}

function stageIncomingCount(nodes, edges, nodeId) {
  const stageIds = new Set(nodes.filter((n) => n.kind === "stage").map((n) => n.id));
  return edges.filter((e) => e.to === nodeId && stageIds.has(e.from)).length;
}

function getMergeStageNodeIds(nodes, edges) {
  return nodes
    .filter((n) => n.kind === "stage" && stageIncomingCount(nodes, edges, n.id) >= 2)
    .map((n) => n.id);
}

function findRouteToMergeNode(nodes, edges, fromNodeId, mergeNodeId) {
  const adj = buildAdjacency(edges);
  const mergeIds = new Set(getMergeStageNodeIds(nodes, edges));
  const stageIds = new Set(nodes.filter((n) => n.kind === "stage").map((n) => n.id));
  const queue = [[fromNodeId, []]];
  const visited = new Set();

  while (queue.length > 0) {
    const [cur, route] = queue.shift();
    if (visited.has(cur)) continue;
    visited.add(cur);

    const node = nodeById(nodes, cur);
    if (!node || node.kind !== "stage") continue;

    if (cur === mergeNodeId) {
      return route;
    }

    const nextRoute = [...route, node.stage];
    for (const nextId of adj.get(cur) || []) {
      if (!stageIds.has(nextId)) continue;
      if (mergeIds.has(nextId) && nextId !== mergeNodeId) continue;
      if (!visited.has(nextId)) queue.push([nextId, nextRoute]);
    }
  }
  return null;
}

function walkGraphPathToTarget(nodes, edges, startNodeId, targetNodeId) {
  const adj = buildAdjacency(edges);
  const mergeIds = new Set(getMergeStageNodeIds(nodes, edges));
  const stageIds = new Set(nodes.filter((n) => n.kind === "stage").map((n) => n.id));
  const queue = [[startNodeId, []]];
  const visited = new Set();

  while (queue.length > 0) {
    const [cur, path] = queue.shift();
    if (visited.has(cur)) continue;
    visited.add(cur);

    const node = nodeById(nodes, cur);
    if (!node || node.kind !== "stage") continue;

    const nextPath = [...path, node];
    if (cur === targetNodeId) return nextPath;

    for (const nextId of adj.get(cur) || []) {
      if (!stageIds.has(nextId)) continue;
      if (mergeIds.has(nextId) && nextId !== targetNodeId) continue;
      if (!visited.has(nextId)) queue.push([nextId, nextPath]);
    }
  }
  return null;
}

function pathStagesMatch(pathNodes, route) {
  if (!Array.isArray(pathNodes) || !Array.isArray(route)) return false;
  if (pathNodes.length !== route.length) return false;
  return pathNodes.every((node, index) => node.stage === String(route[index] || "").toLowerCase());
}

function branchPathNodesBeforeMerge(pathNodes, mergeTargetId) {
  if (!Array.isArray(pathNodes) || pathNodes.length === 0) return [];
  const targetId = String(mergeTargetId || "");
  if (targetId && pathNodes[pathNodes.length - 1]?.id === targetId) {
    return pathNodes.slice(0, -1);
  }
  return pathNodes;
}

function resolveBranchStepNode(nodes, edges, { startNodeId, mergeTargetId, route, routeIdx, currentStage }) {
  if (!mergeTargetId || !Array.isArray(route) || route.length === 0) return null;

  const startIds = startNodeId
    ? [String(startNodeId)]
    : graphStartStageNodeIds(nodes, edges);

  for (const startId of startIds) {
    const path = walkGraphPathToTarget(nodes, edges, startId, String(mergeTargetId));
    if (!path || path.length < 1) continue;

    const branchNodes = branchPathNodesBeforeMerge(path, mergeTargetId);
    if (!pathStagesMatch(branchNodes, route)) continue;

    return branchNodes[routeIdx] ?? branchNodes.find((node) => node.stage === currentStage) ?? null;
  }

  return null;
}

function resolveBranchStageNote(nodes, edges, ctx) {
  const stepNode = resolveBranchStepNode(nodes, edges, ctx);
  return stepNode ? stepNode.note || "" : null;
}

function graphStartStageNodeIds(nodes, edges) {
  const start = nodes.find((n) => n.kind === "start");
  const startId = start?.id || START_NODE_ID;
  const adj = buildAdjacency(edges);
  const direct = (adj.get(startId) || [])
    .map((id) => nodeById(nodes, id))
    .filter((n) => n?.kind === "stage");
  if (direct.length > 0) return direct.map((n) => n.id);

  const rev = buildReverseAdjacency(edges);
  return nodes
    .filter((n) => n.kind === "stage")
    .filter((n) => {
      const incoming = rev.get(n.id) || [];
      return incoming.length === 0 || incoming.every((fromId) => nodeById(nodes, fromId)?.kind === "start");
    })
    .map((n) => n.id);
}

/** Пояснительная записка этапа из process_graph для текущей позиции заказа. */
export function resolveWorkItemStageNote(row, graph) {
  const normalized = normalizeProcessGraph(graph);
  const { nodes, edges } = normalized;
  const meta = row?.forkMeta ?? row?.fork_meta ?? {};
  const route = (Array.isArray(row?.stageRoute) ? row.stageRoute : row?.stage_route ?? [])
    .map((stage) => String(stage || "").trim().toLowerCase())
    .filter(Boolean);
  const routeIdx = Math.max(0, Number(row?.routeIdx ?? row?.route_idx ?? 0) || 0);
  const currentStage = String(row?.currentStage || "").trim().toLowerCase();

  const graphNodeId = meta.sub_group_id || meta.subGroupId || meta.merge_node_id || meta.mergeNodeId;
  if (meta.is_final_gate === true || meta.isFinalGate === true) {
    const multi = extractMultiMergePlan(normalized);
    const finalId = multi?.finalGate?.nodeId;
    if (finalId) return nodeById(nodes, String(finalId))?.note || "";
  } else if (row?.forkRole === "merge" && graphNodeId) {
    const mergeNode = nodeById(nodes, String(graphNodeId));
    if (mergeNode?.note) return mergeNode.note;
  }

  const mergeTargetId = meta.merge_node_id || meta.mergeNodeId;
  const startNodeId = meta.start_node_id || meta.startNodeId;
  if (mergeTargetId && route.length > 0) {
    const branchNote = resolveBranchStageNote(nodes, edges, {
      startNodeId,
      mergeTargetId,
      route,
      routeIdx,
      currentStage,
    });
    if (branchNote !== null) return branchNote;
  }

  const stageNodes = nodes.filter((n) => n.kind === "stage" && n.stage === currentStage);
  if (stageNodes.length === 1) return stageNodes[0].note || "";

  if (route.length > 0) {
    const stepStage = route[routeIdx] || currentStage;
    let occurrence = 0;
    const needOccurrence = route.slice(0, routeIdx + 1).filter((s) => s === stepStage).length - 1;
    for (const node of nodes.filter((n) => n.kind === "stage")) {
      if (node.stage !== stepStage) continue;
      if (occurrence === needOccurrence) return node.note || "";
      occurrence += 1;
    }
  }

  return "";
}

/** Узел process_graph, соответствующий текущей позиции заказа на маршруте. */
export function resolveWorkItemGraphNodeId(row, graph) {
  const normalized = normalizeProcessGraph(graph);
  const { nodes, edges } = normalized;
  const meta = row?.forkMeta ?? row?.fork_meta ?? {};
  const route = (Array.isArray(row?.stageRoute) ? row.stageRoute : row?.stage_route ?? [])
    .map((stage) => String(stage || "").trim().toLowerCase())
    .filter(Boolean);
  const routeIdx = Math.max(0, Number(row?.routeIdx ?? row?.route_idx ?? 0) || 0);
  const currentStage = String(row?.currentStage || row?.current_stage || "").trim().toLowerCase();

  if (meta.is_final_gate === true || meta.isFinalGate === true) {
    const multi = extractMultiMergePlan(normalized);
    const finalId = multi?.finalGate?.nodeId;
    if (finalId) return String(finalId);
  } else if (row?.forkRole === "merge" || row?.fork_role === "merge") {
    const mergeNodeId =
      meta.merge_node_id ||
      meta.mergeNodeId ||
      meta.sub_group_id ||
      meta.subGroupId;
    if (mergeNodeId) return String(mergeNodeId);
  }

  const mergeTargetId = meta.merge_node_id || meta.mergeNodeId;
  const startNodeId = meta.start_node_id || meta.startNodeId;
  if (mergeTargetId && route.length > 0) {
    const stepNode = resolveBranchStepNode(nodes, edges, {
      startNodeId,
      mergeTargetId,
      route,
      routeIdx,
      currentStage,
    });
    if (stepNode?.id) return String(stepNode.id);
  }

  const stageNodes = nodes.filter((n) => n.kind === "stage" && n.stage === currentStage);
  if (stageNodes.length === 1) return String(stageNodes[0].id);

  if (route.length > 0) {
    const stepStage = route[routeIdx] || currentStage;
    let occurrence = 0;
    const needOccurrence = route.slice(0, routeIdx + 1).filter((s) => s === stepStage).length - 1;
    for (const node of nodes.filter((n) => n.kind === "stage")) {
      if (node.stage !== stepStage) continue;
      if (occurrence === needOccurrence) return String(node.id);
      occurrence += 1;
    }
  }

  return null;
}

export function isWorkItemStageActive(row) {
  const stageStatus = String(row?.stageStatus ?? row?.stage_status ?? "").toLowerCase();
  return stageStatus === "in_progress" || stageStatus === "paused";
}

export const GRAPH_NODE_STATUS = {
  DONE: "done",
  ACTIVE: "active",
  QUEUED: "queued",
  FUTURE: "future",
};

function mergeGraphNodeStatus(left, right) {
  const rank = {
    [GRAPH_NODE_STATUS.ACTIVE]: 4,
    [GRAPH_NODE_STATUS.QUEUED]: 3,
    [GRAPH_NODE_STATUS.DONE]: 2,
    [GRAPH_NODE_STATUS.FUTURE]: 1,
  };
  if (!left) return right || null;
  if (!right) return left || null;
  return rank[left] >= rank[right] ? left : right;
}

function applyPathNodeStatuses(statuses, pathIds, row) {
  const memberStatus = String(row?.status ?? "").toLowerCase();
  const stageStatus = String(row?.stageStatus ?? row?.stage_status ?? "").toLowerCase();
  const routeIdx = Math.max(0, Number(row?.routeIdx ?? row?.route_idx ?? 0) || 0);

  if (memberStatus === "done") {
    for (const id of pathIds) {
      statuses.set(id, mergeGraphNodeStatus(statuses.get(id), GRAPH_NODE_STATUS.DONE));
    }
    return;
  }
  if (memberStatus === "cancelled") return;

  pathIds.forEach((id, idx) => {
    let next = GRAPH_NODE_STATUS.FUTURE;
    if (idx < routeIdx) next = GRAPH_NODE_STATUS.DONE;
    else if (idx === routeIdx) {
      if (stageStatus === "in_progress" || stageStatus === "paused") {
        next = GRAPH_NODE_STATUS.ACTIVE;
      } else if (stageStatus === "queued") {
        next = GRAPH_NODE_STATUS.QUEUED;
      } else {
        next = GRAPH_NODE_STATUS.FUTURE;
      }
    }
    statuses.set(id, mergeGraphNodeStatus(statuses.get(id), next));
  });
}

function applySingleNodeStatus(statuses, nodeId, row) {
  if (!nodeId) return;
  const memberStatus = String(row?.status ?? "").toLowerCase();
  const stageStatus = String(row?.stageStatus ?? row?.stage_status ?? "").toLowerCase();
  let next = GRAPH_NODE_STATUS.FUTURE;
  if (memberStatus === "done") next = GRAPH_NODE_STATUS.DONE;
  else if (stageStatus === "in_progress" || stageStatus === "paused") next = GRAPH_NODE_STATUS.ACTIVE;
  else if (stageStatus === "queued") next = GRAPH_NODE_STATUS.QUEUED;
  statuses.set(nodeId, mergeGraphNodeStatus(statuses.get(nodeId), next));
}

/** Упорядоченные id узлов ветки (без узла слияния). */
export function getBranchPathNodeIds(row, graph) {
  const normalized = normalizeProcessGraph(graph);
  const { nodes, edges } = normalized;
  const meta = row?.forkMeta ?? row?.fork_meta ?? {};
  const route = (Array.isArray(row?.stageRoute) ? row.stageRoute : row?.stage_route ?? [])
    .map((stage) => String(stage || "").trim().toLowerCase())
    .filter(Boolean);
  const mergeTargetId = meta.merge_node_id || meta.mergeNodeId;
  const startNodeId = meta.start_node_id || meta.startNodeId;
  if (!mergeTargetId || route.length === 0) return [];

  const startIds = startNodeId
    ? [String(startNodeId)]
    : graphStartStageNodeIds(nodes, edges);

  for (const startId of startIds) {
    const path = walkGraphPathToTarget(nodes, edges, startId, String(mergeTargetId));
    if (!path || path.length < 1) continue;

    const branchNodes = branchPathNodesBeforeMerge(path, mergeTargetId);
    if (!pathStagesMatch(branchNodes, route)) continue;
    return branchNodes.map((node) => String(node.id));
  }
  return [];
}

function getLinearPathNodeIds(row, graph) {
  const normalized = normalizeProcessGraph(graph);
  const { nodes } = normalized;
  const route = (Array.isArray(row?.stageRoute) ? row.stageRoute : row?.stage_route ?? [])
    .map((stage) => String(stage || "").trim().toLowerCase())
    .filter(Boolean);
  if (route.length === 0) return [];

  const pathIds = [];
  for (let i = 0; i < route.length; i += 1) {
    const stage = route[i];
    const needOccurrence = route.slice(0, i + 1).filter((s) => s === stage).length - 1;
    let occurrence = 0;
    let matched = null;
    for (const node of nodes.filter((n) => n.kind === "stage")) {
      if (node.stage !== stage) continue;
      if (occurrence === needOccurrence) {
        matched = String(node.id);
        break;
      }
      occurrence += 1;
    }
    if (matched) pathIds.push(matched);
  }
  return pathIds;
}

function collectWorkItemNodeStatuses(row, graph, statuses) {
  const forkRole = String(row?.forkRole ?? row?.fork_role ?? "").trim();
  const meta = row?.forkMeta ?? row?.fork_meta ?? {};

  if (forkRole === "branch") {
    applyPathNodeStatuses(statuses, getBranchPathNodeIds(row, graph), row);
    return;
  }

  if (forkRole === "merge" || meta.is_final_gate === true || meta.isFinalGate === true) {
    applySingleNodeStatus(statuses, resolveWorkItemGraphNodeId(row, graph), row);
    return;
  }

  const branchPath = getBranchPathNodeIds(row, graph);
  if (branchPath.length > 0) {
    applyPathNodeStatuses(statuses, branchPath, row);
    return;
  }

  const linearPath = getLinearPathNodeIds(row, graph);
  if (linearPath.length > 0) {
    applyPathNodeStatuses(statuses, linearPath, row);
    return;
  }

  applySingleNodeStatus(statuses, resolveWorkItemGraphNodeId(row, graph), row);
}

/** Статусы узлов графа для заказа: done / active / future. */
export function collectGraphNodeStatusMap(planRow, allRows, graph) {
  const normalized = normalizeProcessGraph(graph);
  const statuses = new Map();
  for (const node of normalized.nodes) {
    if (node.kind === "stage") statuses.set(String(node.id), GRAPH_NODE_STATUS.FUTURE);
  }

  const family = getPlanOrderFamilyRows(planRow, allRows);
  for (const member of family) {
    if (String(member?.forkRole ?? member?.fork_role ?? "") === "") {
      const memberStatus = String(member?.status ?? "").toLowerCase();
      if (memberStatus === "split" || memberStatus === "planned") continue;
    }
    collectWorkItemNodeStatuses(member, graph, statuses);
  }
  return statuses;
}

/** id узлов графа, на которых сейчас идёт работа по заказу. */
export function collectActiveGraphNodeIds(planRow, allRows, graph) {
  const statusMap = collectGraphNodeStatusMap(planRow, allRows, graph);
  const ids = new Set();
  for (const [nodeId, status] of statusMap.entries()) {
    if (status === GRAPH_NODE_STATUS.ACTIVE) ids.add(nodeId);
  }
  return ids;
}

/** Все work items одного заказа в плане (родитель, ветки, сварки, финал). */
export function getPlanOrderFamilyRows(planRow, allRows) {
  const safeRows = Array.isArray(allRows) ? allRows : [];
  const planId = planRow?.id;
  const multiRootId = getMultiMergeRootId(planRow);
  if (multiRootId != null) {
    return safeRows.filter(
      (member) => member.id === multiRootId || getMultiMergeRootId(member) === multiRootId,
    );
  }
  if (planRow?.forkGroupId) {
    return safeRows.filter(
      (member) =>
        member.forkGroupId === planRow.forkGroupId ||
        member.id === planId ||
        Number(member.parentId ?? member.parent_id ?? 0) === planId,
    );
  }
  const children = safeRows.filter(
    (member) => Number(member.parentId ?? member.parent_id ?? 0) === planId,
  );
  if (children.length > 0) return [planRow, ...children];
  return safeRows.filter((member) => member.id === planId);
}

/**
 * Сложный маршрут: несколько точек слияния (напр. две сварки → покраска).
 * Возвращает null, если топология — обычная single-fork или линейная.
 */
export function extractMultiMergePlan(graph) {
  const { nodes, edges } = normalizeProcessGraph(graph);
  const mergeNodeIds = getMergeStageNodeIds(nodes, edges);
  if (mergeNodeIds.length <= 1) return null;

  const mergeIdSet = new Set(mergeNodeIds);
  const stageIds = new Set(nodes.filter((n) => n.kind === "stage").map((n) => n.id));
  const stagePredecessors = (nodeId) =>
    edges.filter((e) => e.to === nodeId && stageIds.has(e.from)).map((e) => e.from);

  // Финал: ≥2 входа, хотя бы один от другой точки слияния (вторая сварка может быть с 1 входом).
  const finalGateNodes = mergeNodeIds
    .map((id) => nodeById(nodes, id))
    .filter((node) => {
      const preds = stagePredecessors(node.id);
      if (preds.length < 2) return false;
      return preds.some((predId) => mergeIdSet.has(predId));
    });

  if (finalGateNodes.length === 0) return null;

  const finalGate = finalGateNodes.sort((a, b) => a.x - b.x || a.y - b.y).slice(-1)[0];
  const finalPredIds = stagePredecessors(finalGate.id);

  const subMergeIdSet = new Set();
  for (const mergeId of mergeNodeIds) {
    if (mergeId === finalGate.id) continue;
    const preds = stagePredecessors(mergeId);
    if (preds.some((predId) => !mergeIdSet.has(predId))) {
      subMergeIdSet.add(mergeId);
    }
  }
  for (const predId of finalPredIds) {
    if (predId !== finalGate.id && !mergeIdSet.has(predId)) {
      subMergeIdSet.add(predId);
    }
  }

  const subMergeNodes = [...subMergeIdSet]
    .map((id) => nodeById(nodes, id))
    .filter(Boolean);

  if (subMergeNodes.length < 2) return null;

  const start = nodes.find((n) => n.kind === "start");
  const startId = start?.id || START_NODE_ID;
  const adj = buildAdjacency(edges);
  const startStageNodes = (adj.get(startId) || [])
    .map((id) => nodeById(nodes, id))
    .filter((n) => n?.kind === "stage")
    .sort((a, b) => a.x - b.x || a.y - b.y);

  const subForks = subMergeNodes
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((mergeNode) => {
      const branches = [];
      for (const startNode of startStageNodes) {
        const route = findRouteToMergeNode(nodes, edges, startNode.id, mergeNode.id);
        if (!route || route.length === 0) continue;
        branches.push({
          branchKey: route[0] || startNode.stage,
          startNodeId: startNode.id,
          route,
          mergeNodeId: mergeNode.id,
        });
      }
      return {
        mergeNodeId: mergeNode.id,
        mergeStage: mergeNode.stage,
        branches,
      };
    })
    .filter((sub) => sub.branches.length > 0);

  if (subForks.length < 2) return null;

  return {
    mode: "multi_merge",
    subForks,
    finalGate: {
      nodeId: finalGate.id,
      stage: finalGate.stage,
      requiresMergeNodeIds: finalPredIds,
    },
    mergeNodeCount: mergeNodeIds.length,
  };
}

/**
 * Анализ графа для рантайма: linear / parallel (одно слияние) / multi_merge.
 */
export function analyzeProcessGraphRuntime(graph) {
  const multi = extractMultiMergePlan(graph);
  if (multi) {
    return { supported: true, mode: "multi_merge", plan: multi, warnings: [] };
  }

  const forkPlan = extractForkPlan(graph);
  if (forkPlan.mode === "parallel") {
    return { supported: true, mode: "parallel", plan: forkPlan, warnings: [] };
  }
  return { supported: true, mode: "linear", plan: forkPlan, warnings: [] };
}

export function formatMultiMergeStartLabel(plan) {
  if (!plan?.subForks?.length) return "В работу";
  const branchCount = plan.subForks.reduce((n, sf) => n + (sf.branches?.length || 0), 0);
  const mergeCount = plan.subForks.length;
  const finalStage = plan.finalGate?.stage;
  const finalLabel = finalStage ? (METAL_STAGE_LABELS[finalStage] || finalStage) : "финал";
  return `${branchCount} ветки → ${mergeCount} слияния → ${finalLabel}`;
}

function isMergeStageNode(nodes, edges, nodeId) {
  return stageIncomingCount(nodes, edges, nodeId) >= 2;
}

function walkBranchRoute(nodes, edges, startNodeId) {
  const adj = buildAdjacency(edges);
  const stageIds = new Set(nodes.filter((n) => n.kind === "stage").map((n) => n.id));
  const route = [];
  let cur = startNodeId;
  let mergeStage = null;
  const visited = new Set();

  while (cur && !visited.has(cur)) {
    visited.add(cur);
    const node = nodeById(nodes, cur);
    if (!node || node.kind !== "stage") break;

    if (isMergeStageNode(nodes, edges, cur) && route.length > 0) {
      mergeStage = node.stage;
      break;
    }

    route.push(node.stage);

    if (isMergeStageNode(nodes, edges, cur)) {
      mergeStage = node.stage;
      route.pop();
      break;
    }

    const outs = (adj.get(cur) || []).filter((id) => stageIds.has(id));
    if (outs.length === 0) break;
    if (outs.length > 1) {
      outs.sort((a, b) => {
        const na = nodeById(nodes, a);
        const nb = nodeById(nodes, b);
        return (na?.x || 0) - (nb?.x || 0) || (na?.y || 0) - (nb?.y || 0);
      });
    }
    const nextId = outs[0];
    if (isMergeStageNode(nodes, edges, nextId)) {
      mergeStage = nodeById(nodes, nextId)?.stage || null;
      break;
    }
    cur = nextId;
  }

  return { route, mergeStage };
}

function walkAfterMergeRoute(nodes, edges, mergeStage) {
  const stageIds = new Set(nodes.filter((n) => n.kind === "stage").map((n) => n.id));
  const mergeNode = nodes.find((n) => n.kind === "stage" && n.stage === mergeStage);
  if (!mergeNode) return [];
  const adj = buildAdjacency(edges);
  const route = [mergeStage];
  let cur = mergeNode.id;
  const visited = new Set([cur]);

  while (true) {
    const outs = (adj.get(cur) || []).filter((id) => stageIds.has(id));
    if (outs.length !== 1) break;
    const nextId = outs[0];
    if (visited.has(nextId)) break;
    visited.add(nextId);
    const next = nodeById(nodes, nextId);
    if (!next || next.kind !== "stage") break;
    route.push(next.stage);
    cur = nextId;
  }
  return route;
}

/**
 * Analyze process graph for runtime fork/merge.
 * linear: { mode:'linear', route: string[] }
 * parallel: { mode:'parallel', branches: [{ branchKey, route, mergeStage }], mergeRoute: string[] }
 */
export function extractForkPlan(graph) {
  const { nodes, edges } = normalizeProcessGraph(graph);
  const start = nodes.find((n) => n.kind === "start");
  const startId = start?.id || START_NODE_ID;
  const adj = buildAdjacency(edges);

  const startStageNodes = (adj.get(startId) || [])
    .map((id) => nodeById(nodes, id))
    .filter((n) => n?.kind === "stage")
    .sort((a, b) => a.x - b.x || a.y - b.y);

  if (startStageNodes.length <= 1) {
    return { mode: "linear", route: deriveStageRouteFromGraph({ nodes, edges }) };
  }

  const branches = startStageNodes.map((startNode) => {
    const { route, mergeStage } = walkBranchRoute(nodes, edges, startNode.id);
    return {
      branchKey: route[0] || startNode.stage,
      route,
      mergeStage,
    };
  });

  const mergeStages = [...new Set(branches.map((b) => b.mergeStage).filter(Boolean))];
  if (mergeStages.length !== 1 || !mergeStages[0]) {
    return { mode: "linear", route: deriveStageRouteFromGraph({ nodes, edges }) };
  }

  const mergeStage = mergeStages[0];
  const mergeRoute = walkAfterMergeRoute(nodes, edges, mergeStage);
  if (mergeRoute.length === 0) {
    return { mode: "linear", route: deriveStageRouteFromGraph({ nodes, edges }) };
  }

  const badBranch = branches.find((b) => b.route.length === 0 || b.mergeStage !== mergeStage);
  if (badBranch) {
    return { mode: "linear", route: deriveStageRouteFromGraph({ nodes, edges }) };
  }

  return { mode: "parallel", branches, mergeStage, mergeRoute };
}

const STAGE_TIME_KEYS = ["laserSeconds", "sawSeconds", "bendingSeconds", "weldingSeconds", "paintingSeconds"];

function rowStatus(row) {
  return String(row?.status || "").toLowerCase();
}

function forkMeta(row) {
  return row?.forkMeta ?? row?.fork_meta ?? {};
}

export function isSubMergeRow(row) {
  const meta = forkMeta(row);
  return meta.is_sub_merge === true || meta.isSubMerge === true;
}

export function isFinalGateRow(row) {
  const meta = forkMeta(row);
  return meta.is_final_gate === true || meta.isFinalGate === true;
}

export function getMultiMergeRootId(row) {
  const meta = forkMeta(row);
  const fromMeta = meta.root_parent_id ?? meta.rootParentId;
  if (fromMeta != null && fromMeta !== "") return Number(fromMeta);

  const parentId = Number(row?.parentId ?? row?.parent_id ?? 0);
  if (
    parentId > 0 &&
    (row?.forkRole === "merge" || row?.fork_role === "merge") &&
    (isFinalGateRow(row) || meta.mode === "multi_merge")
  ) {
    return parentId;
  }

  if (meta.mode === "multi_merge" && !row?.forkRole && !row?.fork_role) return row?.id ?? null;
  return null;
}

function isMultiMergeFamilyRow(row) {
  const meta = forkMeta(row);
  return Boolean(
    meta.mode === "multi_merge" ||
    meta.root_parent_id != null ||
    meta.rootParentId != null,
  );
}

/** Одна строка на multi_merge заказ: финал → родитель done → последний sub_merge. */
export function pickMultiMergeCanonicalRow(family) {
  const safe = Array.isArray(family) ? family : [];
  const done = safe.filter((row) => rowStatus(row) === "done");
  const finalGate = done.find((row) => isFinalGateRow(row));
  if (finalGate) return finalGate;

  const root = safe.find((row) => forkMeta(row).mode === "multi_merge" && !row?.forkRole && !row?.fork_role);
  if (root && rowStatus(root) === "done" && !done.some((row) => isFinalGateRow(row))) return root;

  const subMerges = done.filter((row) => row?.forkRole === "merge");
  if (subMerges.length === 0) return null;

  const painting = subMerges.find((row) => String(row?.currentStage || "").toLowerCase() === "painting");
  if (painting) return painting;

  return subMerges.sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))[0];
}

function multiMergeCanonicalId(rows, row) {
  const rootId = getMultiMergeRootId(row);
  if (!rootId) return row?.id ?? null;
  const family = rows.filter(
    (member) => member.id === rootId || getMultiMergeRootId(member) === rootId,
  );
  const canonical = pickMultiMergeCanonicalRow(family);
  return canonical?.id ?? row?.id ?? null;
}

/** Index fork groups for UI deduplication (plan / done / stats). */
export function buildForkGroupIndex(rows) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const groupId = row?.forkGroupId;
    if (!groupId) continue;
    const entry = groups.get(groupId) || { mergeDone: false, hasMerge: false };
    if (row.forkRole === "merge") {
      entry.hasMerge = true;
      if (rowStatus(row) === "done") {
        if (isFinalGateRow(row) || !isSubMergeRow(row)) {
          entry.mergeDone = true;
        }
      }
    }
    groups.set(groupId, entry);
  }
  return groups;
}

/** Done tab: one card per order — only merge row for parallel fork groups. */
export function filterMetalDoneRows(rows) {
  const groupIndex = buildForkGroupIndex(rows);
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows.filter((row) => {
    if (rowStatus(row) !== "done") return false;
    if (row?.forkRole === "branch") return false;

    if (isMultiMergeFamilyRow(row)) {
      return row.id === multiMergeCanonicalId(safeRows, row);
    }

    if (isSubMergeRow(row)) return false;
    if (isFinalGateRow(row)) return true;

    const groupId = row?.forkGroupId;
    if (groupId && groupIndex.get(groupId)?.mergeDone) {
      return row?.forkRole === "merge" && !isSubMergeRow(row);
    }

    return true;
  });
}

/** Plan tab: planned / active / split-in-progress only. */
export function filterMetalPlanRows(rows) {
  const groupIndex = buildForkGroupIndex(rows);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const status = rowStatus(row);
    if (status === "cancelled" || status === "done") return false;
    if (row?.forkRole === "branch" || row?.forkRole === "merge") return false;
    if (status === "split" && row?.forkGroupId) {
      const group = groupIndex.get(row.forkGroupId);
      if (group?.mergeDone) return false;
    }
    return true;
  });
}

function sumStageSeconds(row) {
  return STAGE_TIME_KEYS.reduce((sum, key) => sum + Number(row?.[key] || 0), 0);
}

function aggregateForkGroupStageTimes(row, allRows) {
  const safeRows = Array.isArray(allRows) ? allRows : [];

  const multiRootId = getMultiMergeRootId(row);
  if (
    multiRootId != null &&
    (row.id === multiRootId || row?.forkRole === "merge" || isFinalGateRow(row) || isSubMergeRow(row))
  ) {
    const members = safeRows.filter(
      (r) => r.id === multiRootId || getMultiMergeRootId(r) === multiRootId,
    );
    const aggregated = { ...row };
    for (const key of STAGE_TIME_KEYS) {
      aggregated[key] = members.reduce((sum, member) => sum + Number(member?.[key] || 0), 0);
    }
    aggregated.totalSeconds = sumStageSeconds(aggregated);
    return aggregated;
  }

  const groupId = row?.forkGroupId;
  if (!groupId) return row;
  const members = safeRows.filter((r) => r.forkGroupId === groupId);
  const hasMerge = members.some((member) => member?.forkRole === "merge");
  const shouldAggregate =
    row?.forkRole === "merge" ||
    (!hasMerge && !row?.forkRole && members.some((member) => member?.forkRole === "branch"));
  if (!shouldAggregate) return row;
  const aggregated = { ...row };
  for (const key of STAGE_TIME_KEYS) {
    aggregated[key] = members.reduce((sum, member) => sum + Number(member?.[key] || 0), 0);
  }
  aggregated.totalSeconds = sumStageSeconds(aggregated);
  return aggregated;
}

/** Stats: one row per order; aggregate fork group times on merge row. */
export function filterMetalStatsRows(rows) {
  const groupIndex = buildForkGroupIndex(rows);
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows
    .filter((row) => {
      const status = rowStatus(row);
      if (status === "cancelled") return false;
      if (row?.forkRole === "branch") return false;

      if (isMultiMergeFamilyRow(row)) {
        if (status !== "done") return false;
        return row.id === multiMergeCanonicalId(safeRows, row);
      }

      const groupId = row?.forkGroupId;
      if (groupId && groupIndex.get(groupId)?.mergeDone) {
        return row?.forkRole === "merge" && !isSubMergeRow(row);
      }
      if (status === "split") return false;
      return true;
    })
    .map((row) => {
      const withTimes = aggregateForkGroupStageTimes(row, rows);
      return {
        ...withTimes,
        totalSeconds: withTimes.totalSeconds ?? sumStageSeconds(withTimes),
      };
    })
    .sort((a, b) => (b.totalSeconds || 0) - (a.totalSeconds || 0));
}
