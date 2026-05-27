import { describe, expect, it } from "vitest";
import {
  catalogSectionMatchesPlanSection,
  getPlanSectionVariant,
  getShipmentStageKey,
  itemMatchesPlanSectionVariant,
  shipmentOrderItemWeekKey,
} from "./shipmentUtils";
import { mergeOrderPreferNewer, shipmentOrderKey } from "../app/orderHelpers";
import { passesShipmentStageFilter } from "../app/appUtils";

describe("getPlanSectionVariant", () => {
  it("detects white and black section suffixes", () => {
    expect(getPlanSectionVariant("Solito 1150 белый")).toEqual({
      base: "solito 1150",
      variant: "white",
    });
    expect(getPlanSectionVariant("Solito 1150 черный")).toEqual({
      base: "solito 1150",
      variant: "black",
    });
    expect(getPlanSectionVariant("Solito 1150")).toEqual({
      base: "solito 1150",
      variant: null,
    });
  });
});

describe("catalogSectionMatchesPlanSection", () => {
  it("matches white plan section to base catalog section", () => {
    expect(catalogSectionMatchesPlanSection("Solito 1150", "Solito 1150 белый")).toBe(true);
  });

  it("does not match base plan section to white catalog section", () => {
    expect(catalogSectionMatchesPlanSection("Solito 1150 белый", "Solito 1150")).toBe(false);
  });
});

describe("itemMatchesPlanSectionVariant", () => {
  const options = ["Solito 1150", "Solito 1150 белый"];

  it("shows only white items in white section", () => {
    const whiteItem = "Стол письменный Solito, белый. Серия 1150. Дуб Сонома";
    const blackItem = "Solito. Серия 1150. Трансильвания";
    expect(itemMatchesPlanSectionVariant(whiteItem, "Solito 1150 белый", options)).toBe(true);
    expect(itemMatchesPlanSectionVariant(blackItem, "Solito 1150 белый", options)).toBe(false);
  });

  it("hides white items from base section when white alias exists", () => {
    const whiteItem = "Solito, белый. Серия 1150. Кейптаун";
    const blackItem = "Solito. Серия 1150. Кейптаун";
    expect(itemMatchesPlanSectionVariant(whiteItem, "Solito 1150", options)).toBe(false);
    expect(itemMatchesPlanSectionVariant(blackItem, "Solito 1150", options)).toBe(true);
  });
});

function buildOrderMaps(orders) {
  const byRowWeek = new Map();
  const byItemWeek = new Map();
  orders.forEach((o) => {
    const week = String(o.week || "").trim();
    const sourceRow = String(o.source_row_id || "").trim();
    if (sourceRow) mergeOrderPreferNewer(byRowWeek, shipmentOrderKey(sourceRow, week), o);
    const item = String(o.item || "").trim();
    if (item) {
      mergeOrderPreferNewer(byItemWeek, shipmentOrderItemWeekKey(item, week), o);
    }
  });
  return { byRowWeek, byItemWeek };
}

describe("getShipmentStageKey", () => {
  const inactiveCell = {
    week: "71",
    qty: 12,
    canSendToWork: false,
    inWork: false,
    bg: "#ffffff",
  };

  it("maps shipped order by source_row_id to shipped stage", () => {
    const maps = buildOrderMaps([
      {
        item: "Премьер. Белый. Бетон Чикаго светло-серый",
        week: "71",
        source_row_id: "manual:18e3cb4a8786895f",
        pipeline_stage: "shipped",
      },
    ]);
    expect(
      getShipmentStageKey(
        inactiveCell,
        "manual:18e3cb4a8786895f",
        maps,
        "Премьер. Белый. Бетон Чикаго светло-серый",
        "бетон чикаго 25",
      ),
    ).toBe("shipped");
  });

  it("maps shipped order by item+week when source_row_id differs", () => {
    const maps = buildOrderMaps([
      {
        item: "Классико. Дуб Бардолино натуральный.",
        week: "71",
        source_row_id: "manual-plan-71",
        pipeline_stage: "shipped",
      },
    ]);
    expect(
      getShipmentStageKey(
        inactiveCell,
        "manual:410c1ae888bef79c",
        maps,
        "Классико. Дуб Бардолино натуральный.",
        "сонома / бардолино",
      ),
    ).toBe("shipped");
  });

  it("does not treat inactive plan cells as awaiting", () => {
    expect(
      getShipmentStageKey(inactiveCell, "manual:missing", { byRowWeek: new Map(), byItemWeek: new Map() }, "Test item"),
    ).toBe("plan_idle");
  });

  it("keeps awaiting only for cells ready to launch", () => {
    expect(
      getShipmentStageKey(
        { ...inactiveCell, canSendToWork: true },
        "manual:row",
        { byRowWeek: new Map(), byItemWeek: new Map() },
        "Test item",
      ),
    ).toBe("awaiting");
  });

  it("prefers shipped order over canSendToWork flag on plan cell", () => {
    const maps = buildOrderMaps([
      {
        item: "Donini 750 мм. Бетон Чикаго светло-серый.",
        week: "71",
        source_row_id: "manual:05918475f348741a",
        pipeline_stage: "shipped",
      },
    ]);
    expect(
      getShipmentStageKey(
        { ...inactiveCell, canSendToWork: true },
        "manual:05918475f348741a",
        maps,
        "Donini 750 мм. Бетон Чикаго светло-серый.",
        "бетон чикаго",
      ),
    ).toBe("shipped");
  });

  it("does not treat stale yellow cell as on pilka when not in work", () => {
    expect(
      getShipmentStageKey(
        { ...inactiveCell, bg: "#ffff00", inWork: false },
        "manual:missing",
        { byRowWeek: new Map(), byItemWeek: new Map() },
        "Donini Grande 806 мм. Дуб Вотан",
      ),
    ).toBe("plan_idle");
  });

  it("maps linked kromka order instead of stale in_work flag", () => {
    const maps = buildOrderMaps([
      {
        item: "Donini 806 мм. Бетон Чикаго светло-серый",
        week: "72",
        source_row_id: "manual:2f3d2c281e383f38",
        pipeline_stage: "kromka",
        kromka_status: "⏳ Ожидает",
      },
    ]);
    expect(
      getShipmentStageKey(
        { ...inactiveCell, week: "72", bg: "#ffff00", inWork: true },
        "manual:2f3d2c281e383f38",
        maps,
        "Donini 806 мм. Бетон Чикаго светло-серый",
      ),
    ).toBe("on_kromka_wait");
  });

  it("keeps on pilka for active in_work cell without linked order", () => {
    expect(
      getShipmentStageKey(
        { ...inactiveCell, bg: "#ffff00", inWork: true },
        "manual:row",
        { byRowWeek: new Map(), byItemWeek: new Map() },
        "Test item",
      ),
    ).toBe("on_pilka_work");
  });
});

describe("passesShipmentStageFilter", () => {
  const filters = {
    showAwaiting: true,
    showOnPilka: false,
    showOnKromka: false,
    showOnPras: false,
    showReadyAssembly: false,
    showAwaitShipment: false,
    showShipped: false,
  };

  it("hides plan_idle from awaiting filter", () => {
    expect(passesShipmentStageFilter("plan_idle", filters)).toBe(false);
    expect(passesShipmentStageFilter("awaiting", filters)).toBe(true);
  });

  it("hides plan_idle when all stage filters are off", () => {
    const off = {
      showAwaiting: false,
      showOnPilka: false,
      showOnKromka: false,
      showOnPras: false,
      showReadyAssembly: false,
      showAwaitShipment: false,
      showShipped: false,
    };
    expect(passesShipmentStageFilter("plan_idle", off)).toBe(false);
  });
});
