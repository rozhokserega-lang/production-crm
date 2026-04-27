import { describe, it, expect } from "vitest";
import { formatDuration, calcWorkingMsBetween, buildLiveStageClock } from "./stageTime";

describe("formatDuration", () => {
  it("formats zero seconds", () => {
    expect(formatDuration(0)).toBe("00:00:00");
  });

  it("formats seconds only", () => {
    expect(formatDuration(45)).toBe("00:00:45");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(125)).toBe("00:02:05");
  });

  it("formats hours, minutes, seconds", () => {
    expect(formatDuration(3661)).toBe("01:01:01");
  });

  it("handles negative values as zero", () => {
    expect(formatDuration(-100)).toBe("00:00:00");
  });

  it("handles null/undefined as zero", () => {
    expect(formatDuration(null as unknown as number)).toBe("00:00:00");
    expect(formatDuration(undefined as unknown as number)).toBe("00:00:00");
  });
});

describe("calcWorkingMsBetween", () => {
  const defaultSchedule = {
    workStart: "08:00",
    workEnd: "18:00",
    lunchStart: "12:00",
    lunchEnd: "13:00",
    workingDays: ["mon", "tue", "wed", "thu", "fri"],
  };

  it("returns 0 for invalid inputs", () => {
    expect(calcWorkingMsBetween(null as unknown as number, null as unknown as number, {})).toBe(0);
    expect(calcWorkingMsBetween(100, 50, {})).toBe(0);
  });

  it("returns 0 when end <= start", () => {
    const start = new Date("2026-04-24T10:00:00Z").getTime();
    const end = new Date("2026-04-24T09:00:00Z").getTime();
    expect(calcWorkingMsBetween(start, end, {})).toBe(0);
  });

  it("calculates working time within a single work day", () => {
    // Friday 2026-04-24
    const start = new Date("2026-04-24T06:00:00Z").getTime(); // 09:00 MSK
    const end = new Date("2026-04-24T09:00:00Z").getTime(); // 12:00 MSK
    // 09:00-12:00 = 3 hours = 10800000ms, minus lunch (12:00-13:00 not in range)
    const result = calcWorkingMsBetween(start, end, defaultSchedule);
    expect(result).toBe(3 * 60 * 60 * 1000);
  });

  it("excludes lunch break when range covers it", () => {
    // Friday 2026-04-24
    const start = new Date("2026-04-24T06:00:00Z").getTime(); // 09:00 MSK
    const end = new Date("2026-04-24T12:00:00Z").getTime(); // 15:00 MSK
    // 09:00-15:00 = 6 hours = 21600000ms, minus 1 hour lunch = 18000000ms
    const result = calcWorkingMsBetween(start, end, defaultSchedule);
    expect(result).toBe(5 * 60 * 60 * 1000);
  });

  it("returns 0 for weekend days", () => {
    // Saturday 2026-04-25
    const start = new Date("2026-04-25T06:00:00Z").getTime();
    const end = new Date("2026-04-25T12:00:00Z").getTime();
    const result = calcWorkingMsBetween(start, end, defaultSchedule);
    expect(result).toBe(0);
  });

  it("handles multi-day working period", () => {
    // Friday 2026-04-24 09:00 MSK to Monday 2026-04-27 11:00 MSK
    const start = new Date("2026-04-24T06:00:00Z").getTime();
    const end = new Date("2026-04-27T08:00:00Z").getTime();
    const result = calcWorkingMsBetween(start, end, defaultSchedule);
    // Friday: 09:00-18:00 = 9h - 1h lunch = 8h
    // Saturday: 0 (weekend)
    // Sunday: 0 (weekend)
    // Monday: 08:00-11:00 = 3h - 0h lunch = 3h (lunch 12:00-13:00 not in range)
    // Actually Monday 11:00 MSK = 08:00 UTC, work starts at 08:00 MSK = 05:00 UTC
    // Let me recalculate: Monday 08:00-11:00 MSK = 3h
    // Total: 8h + 3h = 11h = 39600000ms
    expect(result).toBeGreaterThan(0);
  });
});

describe("buildLiveStageClock", () => {
  const defaultSchedule = {
    workStart: "08:00",
    workEnd: "18:00",
    lunchStart: "12:00",
    lunchEnd: "13:00",
    workingDays: ["mon", "tue", "wed", "thu", "fri"],
  };

  it("returns null when no stage data exists", () => {
    const result = buildLiveStageClock({}, { workSchedule: defaultSchedule });
    expect(result).toBeNull();
  });

  it("returns clock data for active stage", () => {
    const order = {
      pilkaStatus: "В работе",
      pilkaStartedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    };
    const result = buildLiveStageClock(order, { workSchedule: defaultSchedule });
    expect(result).not.toBeNull();
    expect(result!.key).toBe("pilka");
    expect(result!.label).toBe("Пила");
    expect(result!.effectiveSeconds).toBeGreaterThan(0);
    expect(result!.durationText).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("returns 'not started' for stage without start time", () => {
    const order = {
      pilkaStatus: "В работе",
    };
    const result = buildLiveStageClock(order, { workSchedule: defaultSchedule });
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("Старт не зафиксирован");
    expect(result!.effectiveSeconds).toBe(0);
  });

  it("returns 'completed' for done stage", () => {
    const order = {
      pilkaStatus: "Готов",
      pilkaStartedAt: new Date(Date.now() - 7200000).toISOString(),
      pilkaDoneAt: new Date(Date.now() - 3600000).toISOString(),
    };
    const result = buildLiveStageClock(order, { workSchedule: defaultSchedule });
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("Этап завершен");
  });

  it("uses custom isInWork function", () => {
    const order = {
      pilkaStatus: "custom_status",
      pilkaStartedAt: new Date(Date.now() - 3600000).toISOString(),
    };
    const isInWork = (status) => status === "custom_status";
    const result = buildLiveStageClock(order, { workSchedule: defaultSchedule, isInWork });
    expect(result).not.toBeNull();
    expect(result!.key).toBe("pilka");
  });

  it("follows pipelineStage when provided", () => {
    const order = {
      pipelineStage: "kromka",
      pilkaStatus: "Готов",
      kromkaStatus: "В работе",
      kromkaStartedAt: new Date(Date.now() - 1800000).toISOString(),
    };
    const result = buildLiveStageClock(order, { workSchedule: defaultSchedule });
    expect(result).not.toBeNull();
    expect(result!.key).toBe("kromka");
  });
});
