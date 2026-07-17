import { describe, expect, it } from "vitest";
import { buildOrderTimeline } from "./orderTimelineHelpers";

function orderRow(overrides = {}) {
  return {
    orderId: "SP-1",
    item: "Премьер белый бетон",
    week: "28",
    createdAt: "2026-07-01T06:00:00.000Z",
    pilkaStartedAt: "2026-07-02T08:00:00.000Z",
    pilkaDoneAt: "2026-07-04T08:00:00.000Z",
    kromkaStartedAt: "2026-07-05T08:00:00.000Z",
    kromkaDoneAt: "2026-07-05T10:00:00.000Z",
    prasStartedAt: "",
    prasDoneAt: "",
    ...overrides,
  };
}

describe("buildOrderTimeline", () => {
  it("starts with 'Заказ создан' event when createdAt is present", () => {
    const tl = buildOrderTimeline({
      orderId: "SP-1",
      auditRows: [],
      orderRows: [orderRow()],
    });
    const created = tl[tl.length - 1]; // сортировка desc — самое старое в конце
    expect(created.title).toBe("Заказ создан");
    expect(created.lines).toContain("План: 28");
  });

  it("emits stage summary events from timestamps", () => {
    const tl = buildOrderTimeline({
      orderId: "SP-1",
      auditRows: [],
      orderRows: [orderRow()],
    });
    const stageTitles = tl.map((e) => e.title);
    // Пила и Кромка имеют started/done → попадают в сводку. Присадка не началась — нет.
    expect(stageTitles).toContain("Пила: готово");
    expect(stageTitles).toContain("Кромка: готово");
    expect(stageTitles.some((t) => t.startsWith("Присадка"))).toBe(false);
  });

  it("shows duration for a completed stage", () => {
    const tl = buildOrderTimeline({
      orderId: "SP-1",
      auditRows: [],
      orderRows: [orderRow()],
    });
    const pilka = tl.find((e) => e.title === "Пила: готово");
    expect(pilka).toBeTruthy();
    // 02.07 08:00 → 04.07 08:00 = ровно 2 дня.
    expect(pilka.lines[0]).toContain("2 дн");
    expect(pilka.lines[0]).toContain("02.07 08:00");
    expect(pilka.lines[0]).toContain("04.07 08:00");
  });

  it("shows 'в работе' for a stage that started but not finished", () => {
    const tl = buildOrderTimeline({
      orderId: "SP-1",
      auditRows: [],
      orderRows: [
        orderRow({
          pilkaStartedAt: "2026-07-15T13:00:00.000Z",
          pilkaDoneAt: "",
          kromkaStartedAt: "",
          kromkaDoneAt: "",
        }),
      ],
    });
    const pilka = tl.find((e) => e.title === "Пила: в работе");
    expect(pilka).toBeTruthy();
    expect(pilka.lines[0]).toContain("старт");
    expect(pilka.lines[0]).toContain("длится");
  });

  it("skips stages with no timestamps at all", () => {
    const tl = buildOrderTimeline({
      orderId: "SP-1",
      auditRows: [],
      orderRows: [
        orderRow({
          pilkaStartedAt: "",
          pilkaDoneAt: "",
          kromkaStartedAt: "",
          kromkaDoneAt: "",
          prasStartedAt: "",
          prasDoneAt: "",
        }),
      ],
    });
    const titles = tl.map((e) => e.title);
    expect(titles.some((t) => t.startsWith("Пила"))).toBe(false);
    expect(titles.some((t) => t.startsWith("Кромка"))).toBe(false);
    expect(titles.some((t) => t.startsWith("Присадка"))).toBe(false);
  });

  it("sorts timeline newest-first", () => {
    const tl = buildOrderTimeline({
      orderId: "SP-1",
      auditRows: [
        {
          id: 1,
          action: "set_stage",
          entity_id: "SP-1",
          created_at: "2026-07-06T08:00:00.000Z",
          details: { before: {}, after: {} },
        },
      ],
      orderRows: [orderRow()],
    });
    const times = tl.map((e) => new Date(e.createdAt || 0).getTime());
    const sorted = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sorted);
  });

  it("handles empty inputs without crashing", () => {
    const tl = buildOrderTimeline({ orderId: "", auditRows: [], orderRows: [] });
    expect(tl).toEqual([]);
  });
});
