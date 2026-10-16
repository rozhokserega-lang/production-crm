import { describe, expect, it } from "vitest";
import {
  buildConsumeSheetNameCandidates,
  consumeSheetMonthKey,
  consumeSheetNameForDate,
  isSheetNameMissingError,
  isStaleConsumeSheetName,
} from "./consumeSheetName";

describe("имя вкладки расхода", () => {
  it("считается из месяца по Москве", () => {
    expect(consumeSheetNameForDate(new Date("2026-10-16T12:00:00+03:00"))).toBe("Расход октябрь 2026");
    expect(consumeSheetNameForDate(new Date("2026-11-01T09:00:00+03:00"))).toBe("Расход ноябрь 2026");
    expect(consumeSheetNameForDate(new Date("2027-01-05T09:00:00+03:00"))).toBe("Расход январь 2027");
  });

  it("переводит дату в московский месяц, даже если браузер в другом поясе", () => {
    // 31.10.2026 22:30 UTC — это уже 01.11 в Москве
    expect(consumeSheetNameForDate(new Date("2026-10-31T22:30:00Z"))).toBe("Расход ноябрь 2026");
    // 31.10.2026 20:30 UTC — ещё октябрь
    expect(consumeSheetNameForDate(new Date("2026-10-31T20:30:00Z"))).toBe("Расход октябрь 2026");
  });

  it("ключ месяца вытаскивается из имени вкладки", () => {
    expect(consumeSheetMonthKey("Расход октябрь 2026")).toBe("10-2026");
    expect(consumeSheetMonthKey("расход ноябрь 2026")).toBe("11-2026");
    expect(consumeSheetMonthKey("Расход Сентябрь")).toBe("9-");
    expect(consumeSheetMonthKey("приход")).toBe("");
  });

  it("кандидаты: сначала текущий месяц, потом имя из настроек", () => {
    const date = new Date("2026-11-02T10:00:00+03:00");
    expect(buildConsumeSheetNameCandidates("Расход октябрь 2026", date)).toEqual([
      "Расход ноябрь 2026",
      "Расход октябрь 2026",
    ]);
    // если настройка совпала с месяцем — дубля нет
    expect(buildConsumeSheetNameCandidates("Расход ноябрь 2026", date)).toEqual(["Расход ноябрь 2026"]);
    expect(buildConsumeSheetNameCandidates("", date)).toEqual(["Расход ноябрь 2026"]);
  });

  it("видит, что вкладка из прошлого месяца", () => {
    const date = new Date("2026-11-02T10:00:00+03:00");
    expect(isStaleConsumeSheetName("Расход октябрь 2026", date)).toBe(true);
    expect(isStaleConsumeSheetName("Расход ноябрь 2026", date)).toBe(false);
    expect(isStaleConsumeSheetName("расход ноябрь", date)).toBe(true); // без года месяц другой
  });

  it("перебор имён только по «вкладки/дня нет», а не по доступу и материалу", () => {
    expect(isSheetNameMissingError("Sheet not found by title/gid: title='Расход ноябрь 2026'")).toBe(true);
    expect(isSheetNameMissingError("Day column 16 not found in row 1")).toBe(true);
    expect(isSheetNameMissingError("Sheet is empty")).toBe(true);
    expect(isSheetNameMissingError("Material row not found: Дуб хантон 19")).toBe(false);
    expect(isSheetNameMissingError("Failed to obtain Google token: {}")).toBe(false);
  });
});
