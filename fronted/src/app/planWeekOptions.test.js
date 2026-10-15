import { describe, expect, it } from "vitest";
import { buildSplitTargetWeeks } from "./planWeekOptions";

// Данные взяты с живой БД: ячейки есть для 66..92, 96, X, обвязка;
// видимые плановые месяцы — {88..91}, {92,93,94,95}, {67,96}.
const boardWeeks = [
  ...Array.from({ length: 27 }, (_, i) => String(66 + i)), // 66..92
  "96",
  "X",
  "обвязка",
];
const visibleMonths = [
  { weeks: ["88", "89", "90", "91"] },
  { weeks: ["92", "93", "94", "95"] },
  { weeks: ["67", "96"] },
];

describe("buildSplitTargetWeeks", () => {
  it("добавляет недели месяца, по которым ещё нет ни одной позиции", () => {
    const result = buildSplitTargetWeeks({ weeks: boardWeeks, months: visibleMonths });

    // Именно из-за этого нельзя было перенести остаток в 93/94.
    expect(result).toContain("93");
    expect(result).toContain("94");
    expect(result).toContain("95");
  });

  it("не дублирует недели, которые есть и на доске, и в месяце", () => {
    const result = buildSplitTargetWeeks({ weeks: boardWeeks, months: visibleMonths });

    expect(result.filter((w) => w === "92")).toHaveLength(1);
    expect(result.filter((w) => w === "96")).toHaveLength(1);
    expect(result.filter((w) => w === "67")).toHaveLength(1);
  });

  it("сортирует числовые недели по возрастанию, нечисловые — после них", () => {
    const result = buildSplitTargetWeeks({ weeks: boardWeeks, months: visibleMonths });

    expect(result[0]).toBe("66");
    expect(result.indexOf("93")).toBeGreaterThan(result.indexOf("92"));
    expect(result.indexOf("96")).toBeGreaterThan(result.indexOf("95"));
    // X и обвязка остаются в списке (их тоже можно выбрать целью).
    expect(result).toContain("X");
    expect(result).toContain("обвязка");
    expect(result.indexOf("X")).toBeGreaterThan(result.indexOf("96"));
  });

  it("работает без каталога месяцев и на пустых входах", () => {
    expect(buildSplitTargetWeeks({ weeks: ["66", "67"] })).toEqual(["66", "67"]);
    expect(buildSplitTargetWeeks({ weeks: null, months: null })).toEqual([]);
    expect(buildSplitTargetWeeks()).toEqual([]);
  });

  it("пропускает пустые значения в каталоге месяцев", () => {
    const result = buildSplitTargetWeeks({
      weeks: ["66"],
      months: [{ weeks: ["", null, "  ", "93"] }],
    });

    expect(result).toEqual(["66", "93"]);
  });
});
