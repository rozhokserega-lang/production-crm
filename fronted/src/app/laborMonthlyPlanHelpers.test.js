import { describe, expect, it } from "vitest";
import {
  calcMonthlyPlanLoad,
  calcMonthlyStationCapacity,
  defaultMonthWorkingDays,
} from "./laborMonthlyPlanHelpers";

const schedule = {
  hoursPerDay: 8,
  workingDays: ["mon", "tue", "wed", "thu", "fri"],
};

describe("laborMonthlyPlanHelpers", () => {
  it("computes monthly fund with station multipliers", () => {
    const cap = calcMonthlyStationCapacity(schedule, { workingDaysPerMonth: 22 });
    expect(cap.baseFund).toBe(22 * 8 * 60);
    expect(cap.pilka).toBe(cap.baseFund);
    expect(cap.kromka).toBe(cap.baseFund * 2);
    expect(cap.pras).toBe(cap.baseFund * 2);
  });

  it("defaults month days from work schedule", () => {
    expect(defaultMonthWorkingDays(schedule)).toBe(22);
  });

  it("finds bottleneck station by max load pct", () => {
    const load = calcMonthlyPlanLoad(
      { pilkaTotal: 1000, kromkaSeq: 25000, prasSeq: 3000 },
      schedule,
      { workingDaysPerMonth: 22 },
    );
    expect(load.bottleneck.key).toBe("kromka");
    expect(load.maxLoadPct).toBeGreaterThan(100);
    expect(load.status).toBe("over");
    expect(load.stages.find((s) => s.key === "pilka")?.loadPct).toBeLessThan(load.maxLoadPct);
  });
});
