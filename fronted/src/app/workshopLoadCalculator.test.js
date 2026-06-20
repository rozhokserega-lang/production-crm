import { describe, expect, it } from "vitest";
import {
  computeWorkshopLoad,
  loadColorByDays,
  WORKSHOP_STAGES,
  WORKSHOP_STAGE_LABELS,
} from "./workshopLoadCalculator";
import { buildLaborOrdersRows } from "./laborNormCalculator";

// Норма: 90 мин/ед (пила 45, кромка 30, присадка 15, сборка 0).
const NORMS = [{
  groupName: "Stabile",
  pilkaMin: 45,
  kromkaMin: 30,
  prasMin: 15,
  assemblyMin: 0,
  qtyUnit: 1,
}];

function buildLaborRows() {
  return buildLaborOrdersRows([], NORMS);
}

function queueRow(overrides = {}) {
  return {
    order_id: "ORD-1",
    item: "Stabile. Дуб Вотан",
    qty: 1,
    pipeline_stage: "pilka",
    pilka_done: false,
    kromka_done: false,
    pras_done: false,
    assembly_done: false,
    pilka_in_work: false,
    kromka_in_work: false,
    pras_in_work: false,
    assembly_in_work: false,
    ...overrides,
  };
}

describe("loadColorByDays", () => {
  it("returns green for <= 1 day", () => {
    expect(loadColorByDays(0)).toBe("green");
    expect(loadColorByDays(1)).toBe("green");
  });

  it("returns yellow for 1 < d <= 2 days", () => {
    expect(loadColorByDays(1.5)).toBe("yellow");
    expect(loadColorByDays(2)).toBe("yellow");
  });

  it("returns red for > 2 days", () => {
    expect(loadColorByDays(2.1)).toBe("red");
    expect(loadColorByDays(5)).toBe("red");
  });
});

describe("computeWorkshopLoad", () => {
  it("exposes 4 stages with russian labels", () => {
    expect(WORKSHOP_STAGES).toEqual(["pilka", "kromka", "pras", "assembly"]);
    expect(WORKSHOP_STAGE_LABELS).toEqual({
      pilka: "Пила",
      kromka: "Кромка",
      pras: "Присадка",
      assembly: "Сборка",
    });
  });

  it("returns empty stages when queue is empty", () => {
    const result = computeWorkshopLoad({
      queueRows: [],
      laborOrdersRows: buildLaborRows(),
      hoursPerDay: 8,
      workingDayCount: 5,
    });
    expect(result.stages).toHaveLength(4);
    result.stages.forEach((s) => {
      expect(s.queueMinutes).toBe(0);
      expect(s.color).toBe("green");
      expect(s.ordersCount).toBe(0);
    });
    expect(result.totals.queueMinutes).toBe(0);
    expect(result.missingNormCount).toBe(0);
  });

  it("counts all stages for an order at pilka (downstream queue)", () => {
    // Заказ на пиле: pilka/kromka/pras ещё не пройдены → все три в очередь.
    // assembly норма = 0, поэтому 0, но заказ всё равно считается в assembly.ordersCount.
    const result = computeWorkshopLoad({
      queueRows: [queueRow({ qty: 1 })],
      laborOrdersRows: buildLaborRows(),
      hoursPerDay: 8,
      workingDayCount: 5,
    });
    const byId = Object.fromEntries(result.stages.map((s) => [s.stage, s]));
    expect(byId.pilka.queueMinutes).toBe(45);
    expect(byId.kromka.queueMinutes).toBe(30);
    expect(byId.pras.queueMinutes).toBe(15);
    expect(byId.assembly.queueMinutes).toBe(0);
    expect(byId.pilka.ordersCount).toBe(1);
    expect(byId.assembly.ordersCount).toBe(1);
  });

  it("excludes pilka from queue when pilka_done=true", () => {
    const result = computeWorkshopLoad({
      queueRows: [queueRow({ pilka_done: true })],
      laborOrdersRows: buildLaborRows(),
    });
    const byId = Object.fromEntries(result.stages.map((s) => [s.stage, s]));
    expect(byId.pilka.queueMinutes).toBe(0);
    expect(byId.pilka.ordersCount).toBe(0);
    // Но кромка/присадка всё ещё ждут (заказ прошёл только пилу).
    expect(byId.kromka.queueMinutes).toBe(30);
    expect(byId.pras.queueMinutes).toBe(15);
  });

  it("includes kromka queue for orders still at pilka (downstream)", () => {
    // Два заказа: один на пиле, другой прошёл пилу. Оба ждут кромку.
    const result = computeWorkshopLoad({
      queueRows: [
        queueRow({ order_id: "A", pipeline_stage: "pilka", pilka_done: false }),
        queueRow({ order_id: "B", pipeline_stage: "kromka", pilka_done: true, kromka_done: false }),
      ],
      laborOrdersRows: buildLaborRows(),
    });
    const kromka = result.stages.find((s) => s.stage === "kromka");
    // 2 заказа × 30 мин = 60 мин.
    expect(kromka.queueMinutes).toBe(60);
    expect(kromka.ordersCount).toBe(2);
  });

  it("scales minutes by qty", () => {
    const result = computeWorkshopLoad({
      queueRows: [queueRow({ qty: 4 })],
      laborOrdersRows: buildLaborRows(),
    });
    const pilka = result.stages.find((s) => s.stage === "pilka");
    // 45 мин/ед × 4 = 180.
    expect(pilka.queueMinutes).toBe(180);
  });

  it("computes days to clear: green at 4h / 8h = 0.5 day", () => {
    // 4 заказа × 45 мин пилы = 180 мин = 3 часа. 3ч / 8ч = 0.375 дня → green.
    const result = computeWorkshopLoad({
      queueRows: [
        queueRow({ order_id: "1", qty: 1 }),
        queueRow({ order_id: "2", qty: 1 }),
        queueRow({ order_id: "3", qty: 1 }),
        queueRow({ order_id: "4", qty: 1 }),
      ],
      laborOrdersRows: buildLaborRows(),
      hoursPerDay: 8,
      workingDayCount: 5,
    });
    const pilka = result.stages.find((s) => s.stage === "pilka");
    expect(pilka.queueMinutes).toBe(180);
    expect(pilka.daysToClear).toBeLessThanOrEqual(1);
    expect(pilka.color).toBe("green");
  });

  it("computes days to clear: yellow at exactly 1 day boundary", () => {
    // 8 часов очереди = 480 мин. Пила 45/ед → 480/45 ≈ 10.67 → 11 заказов дают 495 мин ≈ 8.25ч.
    // Граница в 1 день = 8ч = 480мин. Возьмём ровно: kromka 30/ед, 16 заказов = 480 мин = 8ч = 1 день.
    const rows = Array.from({ length: 16 }, (_, i) =>
      queueRow({ order_id: `K${i}`, qty: 1, pilka_done: true, kromka_done: false, pipeline_stage: "kromka" }),
    );
    const result = computeWorkshopLoad({
      queueRows: rows,
      laborOrdersRows: buildLaborRows(),
      hoursPerDay: 8,
    });
    const kromka = result.stages.find((s) => s.stage === "kromka");
    expect(kromka.queueMinutes).toBe(480);
    expect(kromka.daysToClear).toBe(1);
    expect(kromka.color).toBe("green"); // ровно 1 день → green (<=1)
  });

  it("computes days to clear: red at > 2 days", () => {
    // 17 заказов на кромке = 510 мин = 8.5ч / 8ч = 1.06 дня → yellow.
    // Чтобы получить > 2 дней на 8-часовом дне: нужно > 960 мин. kromka 30/ед → 33 заказа = 990 мин.
    const rows = Array.from({ length: 33 }, (_, i) =>
      queueRow({ order_id: `K${i}`, qty: 1, pilka_done: true, kromka_done: false, pipeline_stage: "kromka" }),
    );
    const result = computeWorkshopLoad({
      queueRows: rows,
      laborOrdersRows: buildLaborRows(),
      hoursPerDay: 8,
    });
    const kromka = result.stages.find((s) => s.stage === "kromka");
    expect(kromka.daysToClear).toBeGreaterThan(2);
    expect(kromka.color).toBe("red");
  });

  it("counts orders without norm separately and does not crash", () => {
    // Неизвестная модель — нет в NORMS, missing=true.
    const result = computeWorkshopLoad({
      queueRows: [queueRow({ item: "Незнакомка 5000", qty: 2 })],
      laborOrdersRows: buildLaborRows(),
    });
    expect(result.missingNormCount).toBe(1);
    // Все этапы 0 минут (нет нормы), но ordersCount всё равно считает заказ.
    const pilka = result.stages.find((s) => s.stage === "pilka");
    expect(pilka.queueMinutes).toBe(0);
    expect(pilka.ordersCount).toBe(1);
    expect(result.queueRows[0].missing).toBe(true);
  });

  it("respects executorsPerStage (more executors = fewer days)", () => {
    // Тот же объём, но 2 исполнителя на пиле → дней в 2 раза меньше.
    const baseRows = Array.from({ length: 20 }, (_, i) =>
      queueRow({ order_id: `P${i}`, qty: 1 }),
    );
    const one = computeWorkshopLoad({
      queueRows: baseRows,
      laborOrdersRows: buildLaborRows(),
      hoursPerDay: 8,
      executorsPerStage: { pilka: 1 },
    });
    const two = computeWorkshopLoad({
      queueRows: baseRows,
      laborOrdersRows: buildLaborRows(),
      hoursPerDay: 8,
      executorsPerStage: { pilka: 2 },
    });
    const p1 = one.stages.find((s) => s.stage === "pilka");
    const p2 = two.stages.find((s) => s.stage === "pilka");
    expect(p2.daysToClear).toBeCloseTo(p1.daysToClear / 2, 1);
    expect(p2.executors).toBe(2);
  });

  it("totals aggregate all stages", () => {
    const result = computeWorkshopLoad({
      queueRows: [queueRow({ qty: 1 })],
      laborOrdersRows: buildLaborRows(),
    });
    // pilka 45 + kromka 30 + pras 15 + assembly 0 = 90.
    expect(result.totals.queueMinutes).toBe(90);
  });
});
