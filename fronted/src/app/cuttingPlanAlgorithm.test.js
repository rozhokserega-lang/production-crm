import { describe, expect, it } from "vitest";
import { buildCuttingPlan } from "./cuttingPlanAlgorithm";

const BASE_SETTINGS = {
  sheetW: 2800,
  sheetH: 2070,
  kerf: 4.8,
  marginX: 20,
  marginY: 20,
  allowRotate: false,
  accountEdgeBand: false,
  algorithm: "saw",
};

describe("buildCuttingPlan pairByTexture", () => {
  it("places paired texture pieces adjacent horizontally", () => {
    const result = buildCuttingPlan([
      {
        itemName: "Крышки (736_350)",
        w: 736,
        h: 350,
        qty: 4,
        material: "ЛДСП",
        pairByTexture: true,
      },
    ], BASE_SETTINGS);

    const pieces = result[0].sheets.flatMap((s) => s.pieces).filter((p) => p.label.includes("Крышки"));
    expect(pieces.length).toBe(4);

    let adjacentPairs = 0;
    const byRow = new Map();
    for (const p of pieces) {
      const key = String(p.y);
      if (!byRow.has(key)) byRow.set(key, []);
      byRow.get(key).push(p);
    }
    for (const row of byRow.values()) {
      row.sort((a, b) => a.x - b.x);
      for (let i = 0; i < row.length - 1; i++) {
        const a = row[i];
        const b = row[i + 1];
        if (Math.abs((a.x + a.w + BASE_SETTINGS.kerf) - b.x) < 0.01) adjacentPairs++;
      }
    }

    expect(adjacentPairs).toBe(2);
  });
});
