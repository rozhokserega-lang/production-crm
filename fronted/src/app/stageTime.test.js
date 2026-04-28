import { describe, expect, it } from "vitest";
import { calcWorkingMsBetween, formatDuration } from "./stageTime";

describe("stage time helpers", () => {
  it("formats durations as HH:MM:SS", () => {
    expect(formatDuration(0)).toBe("00:00:00");
    expect(formatDuration(3661)).toBe("01:01:01");
  });

  it("counts only configured working time and excludes lunch", () => {
    const start = new Date("2026-04-27T08:00:00+03:00").getTime();
    const end = new Date("2026-04-27T18:00:00+03:00").getTime();

    expect(
      calcWorkingMsBetween(start, end, {
        workingDays: ["mon"],
        workStart: "08:00",
        workEnd: "18:00",
        lunchStart: "12:00",
        lunchEnd: "13:00",
      }),
    ).toBe(9 * 60 * 60 * 1000);
  });
});
