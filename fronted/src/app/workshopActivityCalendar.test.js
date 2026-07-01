import { describe, expect, it } from "vitest";
import {
  buildWorkshopActivityByDay,
  formatDayActivityTooltip,
  toMoscowDateKey,
} from "./workshopActivityCalendar";

describe("workshopActivityCalendar", () => {
  it("maps order timestamps to Moscow date keys", () => {
    const key = toMoscowDateKey("2026-06-13T10:00:00.000Z");
    expect(key).toBe("2026-06-13");
  });

  it("aggregates stage starts and dones per day", () => {
    const map = buildWorkshopActivityByDay([
      {
        pilka_started_at: "2026-06-13T06:00:00.000Z",
        pilka_done_at: "2026-06-15T06:00:00.000Z",
        kromka_started_at: "2026-06-13T07:00:00.000Z",
      },
      {
        pilka_started_at: "2026-06-12T06:00:00.000Z",
        pilka_done_at: "2026-06-13T08:00:00.000Z",
      },
    ]);

    const day = map.get("2026-06-13");
    expect(day.stages.pilka.starts).toBe(1);
    expect(day.stages.pilka.dones).toBe(1);
    expect(day.stages.kromka.starts).toBe(1);
    expect(day.stages.pras.starts).toBe(0);
  });

  it("formats tooltip with worked and idle stages", () => {
    const map = buildWorkshopActivityByDay([
      { pilka_started_at: "2026-06-13T06:00:00.000Z" },
    ]);
    const text = formatDayActivityTooltip("2026-06-13", map.get("2026-06-13"));
    expect(text).toMatch(/Пила: работала/);
    expect(text).toMatch(/Кромка: не работала/);
  });
});
