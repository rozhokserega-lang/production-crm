import { describe, expect, it } from "vitest";
import {
  analyzeProcessGraphRuntime,
  collectActiveGraphNodeIds,
  collectGraphNodeStatusMap,
  createLinearProcessGraph,
  deriveStageRouteFromGraph,
  extractForkPlan,
  extractMultiMergePlan,
  filterMetalDoneRows,
  filterMetalPlanRows,
  filterMetalStatsRows,
  getGraphStartStages,
  graphHasParallelBranches,
  GRAPH_NODE_STATUS,
  normalizeProcessGraph,
  processGraphFromCatalogRow,
  resolveWorkItemGraphNodeId,
  resolveWorkItemStageNote,
  validateProcessGraph,
} from "./metalProcessGraph";

/** Modula legs: 4 ветки, 2 сварки → покраска (как GXTV5BMODS3B). */
function buildModulaLegsGraph() {
  return normalizeProcessGraph({
    nodes: [
      { id: "start", kind: "start", x: 0, y: 200 },
      { id: "l1", kind: "stage", stage: "laser", x: 150, y: 50 },
      { id: "s1", kind: "stage", stage: "saw", x: 150, y: 120 },
      { id: "l2", kind: "stage", stage: "laser", x: 150, y: 280 },
      { id: "s2", kind: "stage", stage: "saw", x: 150, y: 350 },
      { id: "b1", kind: "stage", stage: "bending", x: 300, y: 50 },
      { id: "l3", kind: "stage", stage: "laser", x: 300, y: 120 },
      { id: "b2", kind: "stage", stage: "bending", x: 300, y: 280 },
      { id: "l4", kind: "stage", stage: "laser", x: 300, y: 350 },
      { id: "w1", kind: "stage", stage: "welding", x: 450, y: 85 },
      { id: "w2", kind: "stage", stage: "welding", x: 450, y: 315 },
      { id: "p", kind: "stage", stage: "painting", x: 600, y: 200 },
    ],
    edges: [
      { from: "start", to: "l1" }, { from: "start", to: "s1" }, { from: "start", to: "l2" }, { from: "start", to: "s2" },
      { from: "l1", to: "b1" }, { from: "s1", to: "l3" }, { from: "l2", to: "b2" }, { from: "s2", to: "l4" },
      { from: "b1", to: "w1" }, { from: "l3", to: "w1" }, { from: "b2", to: "w2" }, { from: "l4", to: "w2" },
      { from: "w1", to: "p" }, { from: "w2", to: "p" },
    ],
  });
}

/** Граф GXTVSBMODS4B: 4 ветки, 3 слияния, покраска. */
function buildGx4MultiMergeGraph() {
  return normalizeProcessGraph({
    nodes: [
      { id: "start", kind: "start", x: -169, y: 154 },
      { id: "s1", kind: "stage", stage: "saw", note: "Пилим штуки", x: 59, y: 314 },
      { id: "l2", kind: "stage", stage: "laser", note: "Дырки в штуках", x: 289, y: 316 },
      { id: "l3", kind: "stage", stage: "laser", note: "Режим хуйни", x: 77, y: 133 },
      { id: "b4", kind: "stage", stage: "bending", note: "Гнём", x: 281, y: 138 },
      { id: "w5", kind: "stage", stage: "welding", note: "Привариваем", x: 474, y: 224 },
      { id: "s6", kind: "stage", stage: "saw", note: "Пилим хрени", x: 84, y: -17 },
      { id: "l7", kind: "stage", stage: "laser", note: "ВЫрезаем дырки", x: 298, y: -26 },
      { id: "p8", kind: "stage", stage: "painting", x: 913, y: 78 },
      { id: "w9", kind: "stage", stage: "welding", note: "Свариваем", x: 507, y: 25 },
      { id: "l1", kind: "stage", stage: "laser", note: "Режим хрени", x: 98, y: -146 },
      { id: "b2", kind: "stage", stage: "bending", note: "Гнём хрени", x: 358, y: -146 },
      { id: "w3", kind: "stage", stage: "welding", note: "Варим", x: 597, y: -128 },
    ],
    edges: [
      { from: "start", to: "s1" }, { from: "s1", to: "l2" }, { from: "l2", to: "w5" },
      { from: "start", to: "l3" }, { from: "l3", to: "b4" }, { from: "b4", to: "w5" },
      { from: "w5", to: "p8" },
      { from: "start", to: "s6" }, { from: "s6", to: "l7" }, { from: "l7", to: "w9" }, { from: "w9", to: "p8" },
      { from: "start", to: "l1" }, { from: "l1", to: "b2" }, { from: "b2", to: "w3" }, { from: "w3", to: "p8" },
    ],
  });
}

/** Реальный граф GXTVSBMODS3B: вторая сварка с одним входом, покраска — финал. */
function buildModulaCatalogGraph() {
  return normalizeProcessGraph({
    nodes: [
      { id: "start", kind: "start", x: -169, y: 154 },
      { id: "s1", kind: "stage", stage: "saw", x: 51, y: 328 },
      { id: "l2", kind: "stage", stage: "laser", x: 289, y: 340 },
      { id: "l3", kind: "stage", stage: "laser", x: 79, y: 182 },
      { id: "b4", kind: "stage", stage: "bending", x: 300, y: 187 },
      { id: "w1", kind: "stage", stage: "welding", x: 509, y: 270 },
      { id: "s6", kind: "stage", stage: "saw", x: 59, y: 21 },
      { id: "l7", kind: "stage", stage: "laser", x: 286, y: 45 },
      { id: "p", kind: "stage", stage: "painting", x: 866, y: 146 },
      { id: "w2", kind: "stage", stage: "welding", x: 513, y: 114 },
    ],
    edges: [
      { from: "start", to: "s1" }, { from: "s1", to: "l2" }, { from: "l2", to: "w1" },
      { from: "start", to: "l3" }, { from: "l3", to: "b4" }, { from: "b4", to: "w1" },
      { from: "w1", to: "p" },
      { from: "start", to: "s6" }, { from: "s6", to: "l7" }, { from: "l7", to: "w2" }, { from: "w2", to: "p" },
    ],
  });
}

describe("metalProcessGraph", () => {
  it("builds linear graph from route array", () => {
    const graph = createLinearProcessGraph(["saw", "welding", "painting"]);
    expect(graph.nodes.filter((n) => n.kind === "stage").map((n) => n.stage)).toEqual([
      "saw",
      "welding",
      "painting",
    ]);
    expect(graph.edges).toHaveLength(3);
  });

  it("derives stage route from fork-merge graph", () => {
    const graph = normalizeProcessGraph({
      nodes: [
        { id: "start", kind: "start", x: 0, y: 100 },
        { id: "l", kind: "stage", stage: "laser", x: 200, y: 40 },
        { id: "s", kind: "stage", stage: "saw", x: 200, y: 160 },
        { id: "w", kind: "stage", stage: "welding", x: 420, y: 100 },
      ],
      edges: [
        { id: "e1", from: "start", to: "l" },
        { id: "e2", from: "start", to: "s" },
        { id: "e3", from: "l", to: "w" },
        { id: "e4", from: "s", to: "w" },
      ],
    });

    expect(getGraphStartStages(graph).sort()).toEqual(["laser", "saw"]);
    expect(deriveStageRouteFromGraph(graph)).toEqual(["laser", "saw", "welding"]);
    expect(graphHasParallelBranches(graph)).toBe(true);
  });

  it("falls back to stage_route when process_graph missing", () => {
    const graph = processGraphFromCatalogRow({
      stageRoute: ["painting", "welding", "laser"],
    });
    expect(deriveStageRouteFromGraph(graph)).toEqual(["painting", "welding", "laser"]);
  });

  it("extracts parallel fork plan (saw + laser/bending → welding)", () => {
    const graph = normalizeProcessGraph({
      nodes: [
        { id: "start", kind: "start", x: 0, y: 100 },
        { id: "saw", kind: "stage", stage: "saw", x: 200, y: 40 },
        { id: "laser", kind: "stage", stage: "laser", x: 200, y: 160 },
        { id: "bend", kind: "stage", stage: "bending", x: 380, y: 160 },
        { id: "weld", kind: "stage", stage: "welding", x: 560, y: 100 },
        { id: "paint", kind: "stage", stage: "painting", x: 740, y: 100 },
      ],
      edges: [
        { id: "e1", from: "start", to: "saw" },
        { id: "e2", from: "start", to: "laser" },
        { id: "e3", from: "saw", to: "weld" },
        { id: "e4", from: "laser", to: "bend" },
        { id: "e5", from: "bend", to: "weld" },
        { id: "e6", from: "weld", to: "paint" },
      ],
    });

    expect(graphHasParallelBranches(graph)).toBe(true);
    const plan = extractForkPlan(graph);
    expect(plan.mode).toBe("parallel");
    expect(plan.branches).toHaveLength(2);
    expect(plan.branches.find((b) => b.branchKey === "saw")?.route).toEqual(["saw"]);
    expect(plan.branches.find((b) => b.branchKey === "laser")?.route).toEqual(["laser", "bending"]);
    expect(plan.mergeStage).toBe("welding");
    expect(plan.mergeRoute).toEqual(["welding", "painting"]);
  });

  it("dedupes parallel fork rows in done and plan lists", () => {
    const groupId = "11111111-1111-1111-1111-111111111111";
    const rows = [
      { id: 1, status: "split", forkGroupId: groupId, article: "A" },
      { id: 2, status: "done", forkRole: "branch", forkGroupId: groupId, article: "A", currentStage: "saw" },
      { id: 3, status: "done", forkRole: "branch", forkGroupId: groupId, article: "A", currentStage: "bending" },
      { id: 4, status: "done", forkRole: "merge", forkGroupId: groupId, article: "A", currentStage: "painting" },
      { id: 5, status: "done", article: "B" },
      { id: 6, status: "done", forkGroupId: groupId, article: "A", parentId: 1 },
    ];
    expect(filterMetalDoneRows(rows).map((r) => r.id)).toEqual([4, 5]);
    expect(filterMetalPlanRows(rows).map((r) => r.id)).toEqual([]);
    expect(filterMetalPlanRows([{ id: 1, status: "split", forkGroupId: groupId }]).map((r) => r.id)).toEqual([1]);
    expect(filterMetalStatsRows(rows).map((r) => r.id)).toEqual([4, 5]);
  });

  it("aggregates branch stage times onto merge stats row", () => {
    const groupId = "11111111-1111-1111-1111-111111111111";
    const rows = [
      { id: 2, status: "done", forkRole: "branch", forkGroupId: groupId, laserSeconds: 20, sawSeconds: 0 },
      { id: 3, status: "done", forkRole: "branch", forkGroupId: groupId, laserSeconds: 0, sawSeconds: 6 },
      { id: 4, status: "done", forkRole: "merge", forkGroupId: groupId, bendingSeconds: 3, weldingSeconds: 35, paintingSeconds: 5 },
    ];
    const stats = filterMetalStatsRows(rows);
    expect(stats).toHaveLength(1);
    expect(stats[0].laserSeconds).toBe(20);
    expect(stats[0].sawSeconds).toBe(6);
    expect(stats[0].bendingSeconds).toBe(3);
  });

  it("aggregates fork group stage times on parent when merge row is missing", () => {
    const groupId = "22222222-2222-2222-2222-222222222222";
    const rows = [
      { id: 1, status: "done", forkGroupId: groupId, laserSeconds: 0, sawSeconds: 0 },
      { id: 2, status: "done", forkRole: "branch", forkGroupId: groupId, laserSeconds: 30, sawSeconds: 0 },
      { id: 3, status: "done", forkRole: "branch", forkGroupId: groupId, laserSeconds: 0, sawSeconds: 12 },
    ];
    const stats = filterMetalStatsRows(rows);
    expect(stats).toHaveLength(1);
    expect(stats[0].id).toBe(1);
    expect(stats[0].laserSeconds).toBe(30);
    expect(stats[0].sawSeconds).toBe(12);
  });

  it("detects Modula multi-merge route and supports runtime", () => {
    const graph = buildModulaLegsGraph();
    const multi = extractMultiMergePlan(graph);
    expect(multi?.mode).toBe("multi_merge");
    expect(multi?.subForks).toHaveLength(2);
    expect(multi?.subForks[0].branches).toHaveLength(2);
    expect(multi?.subForks[1].branches).toHaveLength(2);
    expect(multi?.finalGate?.stage).toBe("painting");
    expect(multi?.finalGate?.requiresMergeNodeIds).toEqual(expect.arrayContaining(["w1", "w2"]));

    expect(graphHasParallelBranches(graph)).toBe(false);
    const runtime = analyzeProcessGraphRuntime(graph);
    expect(runtime.supported).toBe(true);
    expect(runtime.mode).toBe("multi_merge");
    expect(runtime.warnings).toEqual([]);

    const validation = validateProcessGraph(graph);
    expect(validation.ok).toBe(true);
    expect(validation.warnings).toEqual([]);
  });

  it("detects catalog Modula graph with single-input second weld", () => {
    const graph = buildModulaCatalogGraph();
    const multi = extractMultiMergePlan(graph);
    expect(multi?.finalGate?.stage).toBe("painting");
    expect(multi?.subForks).toHaveLength(2);
    expect(multi?.subForks.map((sf) => sf.mergeStage).sort()).toEqual(["welding", "welding"]);
    expect(multi?.finalGate?.requiresMergeNodeIds).toEqual(expect.arrayContaining(["w1", "w2"]));
  });

  it("dedupes broken multi_merge done/stats rows to one order", () => {
    const rows = [
      { id: 70, status: "split", forkMeta: { mode: "multi_merge" } },
      { id: 74, status: "done", forkRole: "merge", parentId: 70, currentStage: "welding", forkMeta: { mode: "multi_merge", is_sub_merge: true, root_parent_id: 70 }, weldingSeconds: 10 },
      { id: 75, status: "done", forkRole: "merge", parentId: 70, currentStage: "painting", forkMeta: { mode: "multi_merge", is_sub_merge: true, root_parent_id: 70 }, paintingSeconds: 5 },
    ];
    expect(filterMetalDoneRows(rows).map((r) => r.id)).toEqual([75]);
    const stats = filterMetalStatsRows(rows);
    expect(stats).toHaveLength(1);
    expect(stats[0].id).toBe(75);
    expect(stats[0].weldingSeconds).toBe(10);
    expect(stats[0].paintingSeconds).toBe(5);
  });

  it("shows closed multi_merge parent in done and stats", () => {
    const rows = [
      { id: 70, status: "done", forkMeta: { mode: "multi_merge" }, laserSeconds: 1 },
      { id: 74, status: "done", forkRole: "merge", parentId: 70, currentStage: "welding", forkMeta: { mode: "multi_merge", is_sub_merge: true, root_parent_id: 70 }, weldingSeconds: 10 },
      { id: 75, status: "done", forkRole: "merge", parentId: 70, currentStage: "painting", forkMeta: { mode: "multi_merge", is_sub_merge: true, root_parent_id: 70 }, paintingSeconds: 5 },
    ];
    expect(filterMetalDoneRows(rows).map((r) => r.id)).toEqual([70]);
    const stats = filterMetalStatsRows(rows);
    expect(stats).toHaveLength(1);
    expect(stats[0].id).toBe(70);
    expect(stats[0].weldingSeconds).toBe(10);
    expect(stats[0].paintingSeconds).toBe(5);
  });

  it("dedupes closed multi_merge parent when final gate row exists", () => {
    const rows = [
      { id: 90, status: "done", forkMeta: { mode: "multi_merge" }, currentStage: "laser" },
      {
        id: 98,
        status: "done",
        forkRole: "merge",
        parentId: 90,
        currentStage: "painting",
        forkMeta: { mode: "multi_merge", is_final_gate: true },
        paintingSeconds: 5,
      },
    ];
    expect(filterMetalDoneRows(rows).map((r) => r.id)).toEqual([98]);
    expect(filterMetalStatsRows(rows).map((r) => r.id)).toEqual([98]);
  });

  it("preserves stage notes in process graph", () => {
    const graph = normalizeProcessGraph({
      nodes: [
        { id: "start", kind: "start", x: 0, y: 0 },
        { id: "l1", kind: "stage", stage: "laser", x: 100, y: 0, note: "Резать по шаблону А" },
        { id: "w1", kind: "stage", stage: "welding", x: 300, y: 0 },
      ],
      edges: [
        { from: "start", to: "l1" },
        { from: "l1", to: "w1" },
      ],
    });
    expect(graph.nodes.find((n) => n.id === "l1")?.note).toBe("Резать по шаблону А");
  });

  it("resolves stage note for branch work item", () => {
    const graph = buildModulaCatalogGraph();
    const graphWithNotes = normalizeProcessGraph({
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === "l2" ? { ...node, note: "Лазер: внимание к кромке" } : node,
      ),
    });
    const row = {
      forkRole: "branch",
      stageRoute: ["saw", "laser"],
      routeIdx: 1,
      currentStage: "laser",
      forkMeta: { merge_node_id: "w1" },
    };
    expect(resolveWorkItemStageNote(row, graphWithNotes)).toBe("Лазер: внимание к кромке");
  });

  it("resolves distinct branch notes for multi_merge with duplicate stage names", () => {
    const graph = buildGx4MultiMergeGraph();
    expect(resolveWorkItemStageNote({
      id: 82,
      forkRole: "branch",
      stageRoute: ["saw", "laser"],
      routeIdx: 0,
      currentStage: "saw",
      forkMeta: { merge_node_id: "w5", mode: "multi_merge" },
    }, graph)).toBe("Пилим штуки");
    expect(resolveWorkItemStageNote({
      id: 84,
      forkRole: "branch",
      stageRoute: ["saw", "laser"],
      routeIdx: 0,
      currentStage: "saw",
      forkMeta: { merge_node_id: "w9", mode: "multi_merge" },
    }, graph)).toBe("Пилим хрени");
    expect(resolveWorkItemStageNote({
      id: 83,
      forkRole: "branch",
      stageRoute: ["laser", "bending"],
      routeIdx: 0,
      currentStage: "laser",
      forkMeta: { merge_node_id: "w5", mode: "multi_merge" },
    }, graph)).toBe("Режим хуйни");
    expect(resolveWorkItemStageNote({
      id: 85,
      forkRole: "branch",
      stageRoute: ["laser", "bending"],
      routeIdx: 0,
      currentStage: "laser",
      forkMeta: { merge_node_id: "w3", mode: "multi_merge" },
    }, graph)).toBe("Режим хрени");
  });

  it("resolves graph node id for branch work item", () => {
    const graph = buildGx4MultiMergeGraph();
    expect(resolveWorkItemGraphNodeId({
      forkRole: "branch",
      stageRoute: ["saw", "laser"],
      routeIdx: 0,
      currentStage: "saw",
      forkMeta: { merge_node_id: "w9", mode: "multi_merge" },
    }, graph)).toBe("s6");
    expect(resolveWorkItemGraphNodeId({
      forkRole: "branch",
      stageRoute: ["laser", "bending"],
      routeIdx: 0,
      currentStage: "laser",
      forkMeta: { merge_node_id: "w5", mode: "multi_merge" },
    }, graph)).toBe("l3");
  });

  it("resolves sub_merge graph node id from sub_group_id", () => {
    const graph = buildGx4MultiMergeGraph();
    expect(resolveWorkItemGraphNodeId({
      forkRole: "merge",
      currentStage: "welding",
      forkMeta: { is_sub_merge: true, sub_group_id: "w9", mode: "multi_merge" },
    }, graph)).toBe("w9");
    expect(resolveWorkItemGraphNodeId({
      forkRole: "merge",
      currentStage: "welding",
      forkMeta: { is_sub_merge: true, sub_group_id: "w3", mode: "multi_merge" },
    }, graph)).toBe("w3");
  });

  it("collects active graph node ids for multi_merge plan", () => {
    const graph = buildGx4MultiMergeGraph();
    const parent = { id: 117, status: "split", forkMeta: { mode: "multi_merge" } };
    const rows = [
      parent,
      {
        id: 118,
        forkRole: "branch",
        status: "done",
        stageRoute: ["saw", "laser"],
        routeIdx: 1,
        parentId: 117,
        forkMeta: { root_parent_id: 117, merge_node_id: "w9", mode: "multi_merge" },
      },
      {
        id: 119,
        forkRole: "branch",
        status: "active",
        stageStatus: "in_progress",
        currentStage: "laser",
        stageRoute: ["laser", "bending"],
        routeIdx: 0,
        parentId: 117,
        forkMeta: { root_parent_id: 117, merge_node_id: "w5", mode: "multi_merge" },
      },
    ];
    const statusMap = collectGraphNodeStatusMap(parent, rows, graph);
    expect(statusMap.get("s6")).toBe(GRAPH_NODE_STATUS.DONE);
    expect(statusMap.get("l7")).toBe(GRAPH_NODE_STATUS.DONE);
    expect(statusMap.get("l3")).toBe(GRAPH_NODE_STATUS.ACTIVE);
    expect(statusMap.get("b4")).toBe(GRAPH_NODE_STATUS.FUTURE);
    expect(statusMap.get("w9")).toBe(GRAPH_NODE_STATUS.FUTURE);
  });

  it("marks all queued sub_merge welds as blue", () => {
    const graph = buildGx4MultiMergeGraph();
    const parent = { id: 127, status: "split", forkMeta: { mode: "multi_merge" } };
    const rows = [
      parent,
      {
        id: 132,
        forkRole: "merge",
        status: "active",
        stageStatus: "queued",
        currentStage: "welding",
        forkMeta: { is_sub_merge: true, sub_group_id: "w9", root_parent_id: 127, mode: "multi_merge" },
      },
      {
        id: 133,
        forkRole: "merge",
        status: "active",
        stageStatus: "queued",
        currentStage: "welding",
        forkMeta: { is_sub_merge: true, sub_group_id: "w3", root_parent_id: 127, mode: "multi_merge" },
      },
      {
        id: 134,
        forkRole: "merge",
        status: "active",
        stageStatus: "queued",
        currentStage: "welding",
        forkMeta: { is_sub_merge: true, sub_group_id: "w5", root_parent_id: 127, mode: "multi_merge" },
      },
    ];
    const statusMap = collectGraphNodeStatusMap(parent, rows, graph);
    expect(statusMap.get("w9")).toBe(GRAPH_NODE_STATUS.QUEUED);
    expect(statusMap.get("w3")).toBe(GRAPH_NODE_STATUS.QUEUED);
    expect(statusMap.get("w5")).toBe(GRAPH_NODE_STATUS.QUEUED);
    expect(statusMap.get("p8")).toBe(GRAPH_NODE_STATUS.FUTURE);
  });

  it("marks queued branch stage as blue", () => {
    const graph = buildGx4MultiMergeGraph();
    const parent = { id: 117, status: "split", forkMeta: { mode: "multi_merge" } };
    const rows = [
      parent,
      {
        id: 128,
        forkRole: "branch",
        status: "active",
        stageStatus: "queued",
        currentStage: "laser",
        stageRoute: ["saw", "laser"],
        routeIdx: 1,
        parentId: 117,
        forkMeta: { root_parent_id: 117, merge_node_id: "w9", mode: "multi_merge" },
      },
    ];
    const statusMap = collectGraphNodeStatusMap(parent, rows, graph);
    expect(statusMap.get("s6")).toBe(GRAPH_NODE_STATUS.DONE);
    expect(statusMap.get("l7")).toBe(GRAPH_NODE_STATUS.QUEUED);
    expect(statusMap.get("w9")).toBe(GRAPH_NODE_STATUS.FUTURE);
  });

  it("rejects cycles", () => {
    const graph = {
      nodes: [
        { id: "start", kind: "start", x: 0, y: 0 },
        { id: "a", kind: "stage", stage: "laser", x: 100, y: 0 },
        { id: "b", kind: "stage", stage: "saw", x: 200, y: 0 },
      ],
      edges: [
        { id: "e1", from: "start", to: "a" },
        { id: "e2", from: "a", to: "b" },
        { id: "e3", from: "b", to: "a" },
      ],
    };
    const result = validateProcessGraph(graph);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("цикл"))).toBe(true);
  });
});
