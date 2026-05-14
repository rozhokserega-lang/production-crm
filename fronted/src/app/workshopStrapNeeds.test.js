import { describe, expect, it } from "vitest";
import {
  calcStrapNeedsFromDetailArticles,
  computeWorkshopStrapDemandByInventoryKey,
  getResolvedWorkshopStrapNeeds,
  inventoryCodeFromStrapStockType,
  orderKeysForStrapCatalogMatch,
  strapWarehouseShortage,
} from "./workshopStrapNeeds";
import { normalizeFurnitureKey } from "../utils/furnitureUtils";

const emptyDeps = {
  furnitureTemplates: [],
  furnitureCustomTemplates: [],
  furnitureDetailArticleRows: [],
  normalizeFurnitureKey,
};

describe("calcStrapNeedsFromDetailArticles", () => {
  it("matches Donini order to catalog rows and expands generic Обвязка to 1000_80 and 558_80 at 1 per unit (before line multipliers)", () => {
    const rows = [
      {
        product_name: "Донини",
        detail_name_pattern: "Обвязка",
        article: "X1",
        is_active: true,
      },
    ];
    const needs = calcStrapNeedsFromDetailArticles("Donini 750 мм. Дуб Вотан", 24, rows);
    const codes = new Set(needs.map((x) => x.code));
    expect(codes.has("1000_80")).toBe(true);
    expect(codes.has("558_80")).toBe(true);
    expect(needs.every((x) => x.needed === 24)).toBe(true);
  });

  it("returns [] when no catalog rows match", () => {
    expect(
      calcStrapNeedsFromDetailArticles("Unknown Product XYZ", 1, [
        { product_name: "Донини", detail_name_pattern: "Обвязка", article: "A", is_active: true },
      ]),
    ).toEqual([]);
  });
});

describe("getResolvedWorkshopStrapNeeds", () => {
  it("applies Donini multipliers: 1000_80 x2 and 558_80 x4 per ordered unit", () => {
    const rows = [
      {
        product_name: "Донини",
        detail_name_pattern: "Обвязка",
        article: "X1",
        is_active: true,
      },
    ];
    const needs = getResolvedWorkshopStrapNeeds(
      { item: "Donini 750 мм. Дуб Вотан", qty: 24 },
      { ...emptyDeps, furnitureDetailArticleRows: rows },
    );
    const by = Object.fromEntries(needs.map((x) => [x.code, x.needed]));
    expect(by["1000_80"]).toBe(48);
    expect(by["558_80"]).toBe(96);
  });

  it("applies Avella lite multipliers: 1158_50 and 600_50 x2 per unit (from furniture template)", () => {
    const furnitureTemplates = [
      {
        productName: "Avella lite",
        details: [
          { detailName: "Обвязка (1158_50)", perUnit: 1 },
          { detailName: "Обвязка (600_50)", perUnit: 1 },
        ],
      },
    ];
    const needs = getResolvedWorkshopStrapNeeds(
      { item: "Avella lite. Бетон Чикаго светло-серый", qty: 39 },
      { ...emptyDeps, furnitureTemplates },
    );
    const by = Object.fromEntries(needs.map((x) => [x.code, x.needed]));
    expect(by["1158_50"]).toBe(78);
    expect(by["600_50"]).toBe(78);
  });

  it("applies Donini Grande multipliers from catalog straps", () => {
    const rows = [
      { product_name: "Донини гранде", detail_name_pattern: "Обвязка (750_80)", article: "A1", is_active: true },
      { product_name: "Донини гранде", detail_name_pattern: "Обвязка (586_80)", article: "A2", is_active: true },
      { product_name: "Донини гранде", detail_name_pattern: "Обвязка (600_80)", article: "A3", is_active: true },
      { product_name: "Донини гранде", detail_name_pattern: "Обвязка (618_80)", article: "A4", is_active: true },
    ];
    const needs = getResolvedWorkshopStrapNeeds(
      { item: "Donini Grande 750 мм. Дуб Коми", qty: 48 },
      { ...emptyDeps, furnitureDetailArticleRows: rows },
    );
    const by = Object.fromEntries(needs.map((x) => [x.code, x.needed]));
    expect(by["750_80"]).toBe(96);
    expect(by["600_80"]).toBe(192);
    expect(by["618_80"]).toBe(96);
    expect(by["586_80"]).toBe(96);
  });
});

describe("orderKeysForStrapCatalogMatch", () => {
  it("includes alias key for Donini spelling", () => {
    const keys = orderKeysForStrapCatalogMatch("Donini 750 мм. Дуб Вотан");
    expect(keys).toContain("донини");
  });
});

describe("inventoryCodeFromStrapStockType / strapWarehouseShortage", () => {
  it("parses label or short code", () => {
    expect(inventoryCodeFromStrapStockType("Обвязка (1000_80)")).toBe("1000_80");
    expect(inventoryCodeFromStrapStockType("1000_80")).toBe("1000_80");
  });

  it("computes shortage from demand map and stock qty", () => {
    const m = new Map([["1000_80|Черный", 50]]);
    expect(strapWarehouseShortage(m, "1000_80", "Черный", 861)).toBe(0);
    expect(strapWarehouseShortage(m, "1000_80", "Черный", 40)).toBe(10);
  });

  it("aggregates demand across workshop rows", () => {
    const rows = [
      {
        product_name: "Донини",
        detail_name_pattern: "Обвязка",
        article: "X1",
        is_active: true,
      },
    ];
    const deps = { ...emptyDeps, furnitureDetailArticleRows: rows };
    const workshopRows = [
      { item: "Donini 750 мм. Дуб Вотан", qty: 12 },
      { item: "Donini 750 мм. Дуб Вотан", qty: 12 },
    ];
    const map = computeWorkshopStrapDemandByInventoryKey(workshopRows, deps);
    expect(map.get("1000_80|Черный")).toBe(48);
    expect(map.get("558_80|Черный")).toBe(96);
  });
});
