import { describe, expect, it } from "vitest";
import {
  groupShippedOrdersByMonth,
  monthKeyOfTs,
  monthLabelOfKey,
  shippedOrderView,
} from "./warehouseShippedHelpers";

describe("monthKeyOfTs / monthLabelOfKey", () => {
  it("формирует ключ месяца по Москве (23:59 UTC = уже следующие сутки в MSK летом)", () => {
    // 2026-09-30 21:30Z = 2026-10-01 00:30 MSK
    expect(monthKeyOfTs(Date.UTC(2026, 8, 30, 21, 30))).toBe("2026-10");
    // 2026-09-01 00:30Z = 2026-09-01 03:30 MSK
    expect(monthKeyOfTs(Date.UTC(2026, 8, 1, 0, 30))).toBe("2026-09");
  });

  it("без даты ключ пустой", () => {
    expect(monthKeyOfTs(0)).toBe("");
  });

  it("подпись месяца по ключу", () => {
    expect(monthLabelOfKey("2026-09")).toBe("Сентябрь 2026");
    expect(monthLabelOfKey("2026-01")).toBe("Январь 2026");
    expect(monthLabelOfKey("мусор")).toBe("");
  });
});

describe("shippedOrderView", () => {
  it("читает snake_case из RPC и подставляет фолбэки", () => {
    const view = shippedOrderView({
      order_id: " SP-1 ",
      item: "618_80",
      week: 38,
      qty: "5",
      updated_at: "2026-09-16T10:00:00+00:00",
    });
    expect(view).toMatchObject({
      orderId: "SP-1",
      item: "618_80",
      week: "38",
      qty: 5,
    });
    expect(view.dateTs).toBeGreaterThan(0);
  });

  it("битая дата не роняет разбор", () => {
    const view = shippedOrderView({ order_id: "SP-2", updated_at: "не дата" });
    expect(view.dateTs).toBe(0);
  });
});

describe("groupShippedOrdersByMonth", () => {
  const rows = [
    { order_id: "SP-A", item: "стол", qty: 2, updated_at: "2026-09-10T12:00:00Z" },
    { order_id: "SP-B", item: "тумба", qty: 3, updated_at: "2026-09-12T09:00:00Z" },
    { order_id: "SP-C", item: "полка", qty: 4, updated_at: "2026-08-31T15:00:00Z" },
  ];

  it("группирует по месяцам: свежие сверху, внутри — по дате убыванию", () => {
    const groups = groupShippedOrdersByMonth(rows);
    expect(groups.map((g) => g.label)).toEqual(["Сентябрь 2026", "Август 2026"]);
    const [september] = groups;
    expect(september.count).toBe(2);
    expect(september.totalQty).toBe(5);
    expect(september.rows.map((r) => r.orderId)).toEqual(["SP-B", "SP-A"]);
  });

  it("суммирует количество внутри месяца", () => {
    const groups = groupShippedOrdersByMonth(rows);
    expect(groups[1].totalQty).toBe(4);
    expect(groups[1].count).toBe(1);
  });

  it("пустой/битый вход не роняет", () => {
    expect(groupShippedOrdersByMonth([])).toEqual([]);
    expect(groupShippedOrdersByMonth(undefined)).toEqual([]);
    expect(groupShippedOrdersByMonth([null, {}]).length).toBe(1);
  });
});
