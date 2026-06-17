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
        return {
          id,
          kind: "stage",
          stage,
          x: Number(node?.x ?? 0) || 0,
          y: Number(node?.y ?? 0) || 0,
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
    return { ok: false, errors, graph: normalized };
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

  return { ok: errors.length === 0, errors, graph: normalized };
}

export function graphHasParallelBranches(graph) {
  const plan = extractForkPlan(graph);
  return plan.mode === "parallel";
}

function stageIncomingCount(nodes, edges, nodeId) {
  const stageIds = new Set(nodes.filter((n) => n.kind === "stage").map((n) => n.id));
  return edges.filter((e) => e.to === nodeId && stageIds.has(e.from)).length;
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

/** Index fork groups for UI deduplication (plan / done / stats). */
export function buildForkGroupIndex(rows) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const groupId = row?.forkGroupId;
    if (!groupId) continue;
    const entry = groups.get(groupId) || { mergeDone: false, hasMerge: false };
    if (row.forkRole === "merge") {
      entry.hasMerge = true;
      if (rowStatus(row) === "done") entry.mergeDone = true;
    }
    groups.set(groupId, entry);
  }
  return groups;
}

/** Done tab: one card per order — only merge row for parallel fork groups. */
export function filterMetalDoneRows(rows) {
  const groupIndex = buildForkGroupIndex(rows);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (rowStatus(row) !== "done") return false;
    if (row?.forkRole === "branch") return false;
    const groupId = row?.forkGroupId;
    if (groupId && groupIndex.get(groupId)?.mergeDone) {
      return row?.forkRole === "merge";
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
  const groupId = row?.forkGroupId;
  if (!groupId) return row;
  const members = (Array.isArray(allRows) ? allRows : []).filter((r) => r.forkGroupId === groupId);
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
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      const status = rowStatus(row);
      if (status === "cancelled") return false;
      if (row?.forkRole === "branch") return false;
      const groupId = row?.forkGroupId;
      if (groupId && groupIndex.get(groupId)?.mergeDone) {
        return row?.forkRole === "merge";
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
