import { describe, expect, it } from "vitest";
import {
  calcGroupPlanLabor,
  calcKitLabor,
  calcTotalProductionPlan,
  formatMinutesForForm,
  kitItemsToSectionDrafts,
  scheduleStageMakespan,
  resolveKitGroupName,
  sectionDraftsToKitItems,
} from "./laborKitPlanner";

describe("laborKitPlanner", () => {
  it("resolves strap size token to labor group", () => {
    expect(resolveKitGroupName("1000_80")).toBe("Обвязка 1000_80");
  });

  it("schedules two single-machine jobs in parallel on two machines", () => {
    const makespan = scheduleStageMakespan([
      { duration: 120, machines: 1 },
      { duration: 40, machines: 1 },
    ], 2);
    expect(makespan).toBe(120);
  });

  it("schedules two single-machine orders on two machines in parallel", () => {
    const plan = calcTotalProductionPlan({
      groupPlans: [
        { group: "Donini", qty: 1, kromkaPerQtyMin: 120, prasPerQtyMin: 60, pilkaPerQtyMin: 0, assemblyPerQtyMin: 0 },
        { group: "Cremona", qty: 1, kromkaPerQtyMin: 80, prasPerQtyMin: 40, pilkaPerQtyMin: 0, assemblyPerQtyMin: 0 },
      ],
    });
    expect(plan.kromkaParallel).toBe(120);
    expect(plan.prasParallel).toBe(60);
    expect(plan.parallelTotal).toBeLessThan(plan.seqTotal);
  });

  it("calculates group batch with parallel kromka on two machines", () => {
    const batch = calcGroupPlanLabor({
      pilkaPerQtyMin: 0,
      kromkaPerQtyMin: 100,
      prasPerQtyMin: 50,
      assemblyPerQtyMin: 0,
    }, 4);
    expect(batch.kromkaParallel).toBe(200);
    expect(batch.parallelTotal).toBeLessThan(batch.seqTotal);
  });

  it("calculates kit with per-item machine counts", () => {
    const rates = new Map([
      ["Donini", { pilka: 100, kromka: 120, pras: 60, assembly: 0 }],
      ["Обвязка 1000_80", { pilka: 0, kromka: 40, pras: 20, assembly: 0 }],
    ]);
    const result = calcKitLabor([
      { group: "Donini", qty: 1, kromkaMachines: 1, prasMachines: 1 },
      { group: "1000_80", qty: 2, kind: "strap", kromkaMachines: 1, prasMachines: 1 },
    ], { kitCount: 10, ratesByGroup: rates });

    expect(result.seqPerKit).toBe(100 + 120 + 60 + 80 + 40);
    expect(result.kromkaParallelPerKit).toBe(120);
    expect(result.batchParallel).toBeGreaterThan(0);
    expect(result.batchParallel).toBeLessThan(result.batchSeq);
  });

  it("sums multiple strap lines for one product", () => {
    const rates = new Map([
      ["Donini", { pilka: 10, kromka: 0, pras: 0, assembly: 0 }],
      ["Обвязка 1000_80", { pilka: 0, kromka: 20, pras: 10, assembly: 0 }],
      ["Обвязка 750_56", { pilka: 0, kromka: 15, pras: 5, assembly: 0 }],
    ]);
    const result = calcKitLabor([
      { group: "Donini", qty: 1 },
      { group: "1000_80", qty: 2, kind: "strap" },
      { group: "750_56", qty: 1, kind: "strap" },
    ], { kitCount: 1, ratesByGroup: rates });

    expect(result.seqPerKit).toBe(10 + (20 + 10) * 2 + (15 + 5));
  });

  it("roundtrips saved kit items through editable section drafts", () => {
    const rates = new Map([
      ["Donini", { pilka: 10, kromka: 20, pras: 5, assembly: 0 }],
      ["Обвязка 1000_80", { pilka: 0, kromka: 4, pras: 2, assembly: 0 }],
    ]);
    const source = [
      { group: "Donini", qty: 1, kromkaMachines: 2, prasMachines: 1 },
      { group: "1000_80", qty: 2, kind: "strap", useCustomTimes: true, kromkaMin: 11, prasMin: 3 },
    ];
    const drafts = kitItemsToSectionDrafts(source, rates);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].group).toBe("Donini");
    expect(drafts[0].kromkaMachines).toBe("2");
    expect(drafts[0].pilkaMin).toBe("10");
    expect(drafts[0].useCustomTimes).toBe(false);
    expect(drafts[0].straps).toHaveLength(1);
    expect(drafts[0].straps[0].useCustomTimes).toBe(true);
    expect(drafts[0].straps[0].kromkaMin).toBe("11");
    const rebuilt = sectionDraftsToKitItems(drafts, rates);
    expect(rebuilt[1].useCustomTimes).toBe(true);
    expect(rebuilt[1].kromkaMin).toBe(11);
    expect(rebuilt[1].prasMin).toBe(3);
  });

  it("preserves fractional norm minutes in edit form", () => {
    const rates = new Map([
      ["Avella lite", { pilka: 1, kromka: 2, pras: 1, assembly: 0 }],
      ["Обвязка 1158_56", { pilka: 0.4, kromka: 0.6, pras: 1, assembly: 0 }],
    ]);
    const drafts = kitItemsToSectionDrafts([
      { group: "Avella lite", qty: 1 },
      { group: "1158_56", qty: 2, kind: "strap" },
    ], rates);
    expect(drafts[0].straps[0].pilkaMin).toBe("0.4");
    expect(drafts[0].straps[0].kromkaMin).toBe("0.6");
    expect(drafts[0].straps[0].useCustomTimes).toBe(false);
  });
});
