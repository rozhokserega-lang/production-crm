import { describe, expect, it } from "vitest";
import { formatLaborDuration } from "./laborDurationFormat";

describe("formatLaborDuration", () => {
  it("formats sub-hour durations in minutes", () => {
    expect(formatLaborDuration(10)).toBe("10 минут");
    expect(formatLaborDuration(9.5)).toBe("9.5 мин");
    expect(formatLaborDuration(1)).toBe("1 минута");
    expect(formatLaborDuration(21)).toBe("21 минута");
  });

  it("formats hour durations with explicit units", () => {
    expect(formatLaborDuration(60)).toBe("1 час");
    expect(formatLaborDuration(90)).toBe("1 час 30 минут");
    expect(formatLaborDuration(228)).toBe("3 часа 48 минут");
    expect(formatLaborDuration(140)).toBe("2 часа 20 минут");
  });
});
