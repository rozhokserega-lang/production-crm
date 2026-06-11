import { describe, expect, it } from "vitest";
import {
  createLinearProcessGraph,
  deriveStageRouteFromGraph,
  extractForkPlan,
  filterMetalDoneRows,
  filterMetalPlanRows,
  filterMetalStatsRows,
  getGraphStartStages,
  graphHasParallelBranches,
  normalizeProcessGraph,
  processGraphFromCatalogRow,
  validateProcessGraph,
} from "./metalProcessGraph";

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
