import { describe, expect, it } from "vitest";
import {
  shipmentOrderKey,
  orderUpdatedTs,
  mergeOrderPreferNewer,
  getMaterialLabel,
  hasArticleLikeCode,
  getPlanPreviewArticleCode,
  embedPlanItemArticle,
  stripStrapTargetMeta,
  embedStrapTargetProduct,
  extractStrapTargetProduct,
  normalizeStrapItemCode,
  isFacadeStrapItemCode,
  formatStrapPlanTargetCaption,
  stripPlanItemMeta,
  extractPlanItemArticle,
  extractPlanItemQrQty,
  formatEmbeddedPlanItem,
} from "./orderHelpers";

describe("shipmentOrderKey", () => {
  it("joins sourceRow and week", () => {
    expect(shipmentOrderKey("row1", "18")).toBe("row1|18");
  });
  it("trims whitespace", () => {
    expect(shipmentOrderKey(" row1 ", " 18 ")).toBe("row1|18");
  });
  it("handles missing values", () => {
    expect(shipmentOrderKey("", "")).toBe("|");
  });
});

describe("orderUpdatedTs", () => {
  it("returns updatedAt timestamp", () => {
    const ts = orderUpdatedTs({ updatedAt: "2026-01-01T00:00:00Z" });
    expect(ts).toBeGreaterThan(0);
  });
  it("falls back to created_at", () => {
    const ts = orderUpdatedTs({ created_at: "2026-01-01T00:00:00Z" });
    expect(ts).toBeGreaterThan(0);
  });
  it("prefers updatedAt over created_at", () => {
    const ts = orderUpdatedTs({ updatedAt: "2026-06-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" });
    expect(ts).toBeGreaterThan(new Date("2026-03-01").getTime());
  });
  it("returns 0 for empty order", () => {
    expect(orderUpdatedTs(null)).toBe(0);
  });
});

describe("mergeOrderPreferNewer", () => {
  it("sets order when map empty", () => {
    const map = new Map();
    mergeOrderPreferNewer(map, "k1", { updatedAt: "2026-01-01" });
    expect(map.size).toBe(1);
  });
  it("replaces older order", () => {
    const map = new Map();
    map.set("k1", { updatedAt: "2026-01-01" });
    mergeOrderPreferNewer(map, "k1", { updatedAt: "2026-06-01" });
    expect(map.get("k1").updatedAt).toBe("2026-06-01");
  });
  it("keeps newer order", () => {
    const map = new Map();
    map.set("k1", { updatedAt: "2026-06-01" });
    mergeOrderPreferNewer(map, "k1", { updatedAt: "2026-01-01" });
    expect(map.get("k1").updatedAt).toBe("2026-06-01");
  });
  it("does nothing for missing key", () => {
    const map = new Map();
    mergeOrderPreferNewer(map, null, {});
    expect(map.size).toBe(0);
  });
});

describe("getMaterialLabel", () => {
  it("returns direct material if provided", () => {
    expect(getMaterialLabel("item", "ДСП")).toBe("ДСП");
  });
  it("extracts tail from item name", () => {
    expect(getMaterialLabel("Полка.1234.Белый", "")).toBe("Белый");
  });
  it("returns fallback for empty", () => {
    expect(getMaterialLabel("", "")).toBe("Материал не указан");
  });
  it("returns fallback when no dot parts", () => {
    expect(getMaterialLabel("НетТочки", "")).toBe("НетТочки");
  });
});

describe("hasArticleLikeCode", () => {
  it("returns true for valid code", () => {
    expect(hasArticleLikeCode({ product_article: "ABC-123" })).toBe(true);
  });
  it("returns false for empty", () => {
    expect(hasArticleLikeCode({})).toBe(false);
  });
  it("returns false for too short code", () => {
    expect(hasArticleLikeCode({ article: "AB" })).toBe(false);
  });
  it("accepts underscore and dot", () => {
    expect(hasArticleLikeCode({ article_code: "A1_B2.C3" })).toBe(true);
  });
});

describe("getPlanPreviewArticleCode", () => {
  it("returns direct product_article", () => {
    expect(getPlanPreviewArticleCode({ product_article: "X123" })).toBe("X123");
  });
  it("falls back to first row article", () => {
    expect(getPlanPreviewArticleCode({ rows: [{ article_code: "R456" }] })).toBe("R456");
  });
  it("returns empty for missing", () => {
    expect(getPlanPreviewArticleCode({})).toBe("");
  });
});

describe("embedPlanItemArticle", () => {
  it("embeds article with prefix and meta", () => {
    const result = embedPlanItemArticle("Полка 1200", "ART01", 0);
    expect(result).toContain("ART01 ::");
    expect(result).toContain("Полка 1200");
    expect(result).toContain("{{ART:ART01}}");
  });
  it("returns plain item when no article", () => {
    const result = embedPlanItemArticle("Полка 1200", "", 0);
    expect(result).toBe("Полка 1200");
  });
  it("adds QTY meta when qrQty > 0", () => {
    const result = embedPlanItemArticle("Полка", "ART01", 5);
    expect(result).toContain("QTY=5");
    expect(result).toContain("{{QRQTY:5}}");
  });
  it("returns empty for empty item", () => {
    expect(embedPlanItemArticle("", "", 0)).toBe("");
  });
  it("formats decimal qrQty", () => {
    const result = embedPlanItemArticle("Полка", "", 2.5);
    expect(result).toContain("QTY=2.5");
  });
});

describe("stripStrapTargetMeta", () => {
  it("removes STRAP_FOR meta", () => {
    expect(stripStrapTargetMeta("Обвязка {{STRAP_FOR:Сиена}}")).toBe("Обвязка");
  });
  it("collapses extra spaces", () => {
    expect(stripStrapTargetMeta("Обвязка  {{STRAP_FOR:X}}  extra")).toBe("Обвязка extra");
  });
  it("returns original when no meta", () => {
    expect(stripStrapTargetMeta("Обвязка")).toBe("Обвязка");
  });
});

describe("embedStrapTargetProduct", () => {
  it("adds STRAP_FOR meta", () => {
    expect(embedStrapTargetProduct("Обвязка", "Сиена")).toBe("Обвязка {{STRAP_FOR:Сиена}}");
  });
  it("returns empty item as-is", () => {
    expect(embedStrapTargetProduct("", "Сиена")).toBe("");
  });
  it("returns empty when no product", () => {
    expect(embedStrapTargetProduct("Обвязка", "")).toBe("Обвязка");
  });
});

describe("extractStrapTargetProduct", () => {
  it("extracts product from meta", () => {
    expect(extractStrapTargetProduct("Обвязка {{STRAP_FOR:Сиена}}")).toBe("Сиена");
  });
  it("returns empty for no meta", () => {
    expect(extractStrapTargetProduct("Обвязка")).toBe("");
  });
  it("returns empty for null", () => {
    expect(extractStrapTargetProduct(null)).toBe("");
  });
});

describe("normalizeStrapItemCode", () => {
  it("strips meta and normalizes", () => {
    expect(normalizeStrapItemCode("396x305 {{ART:X}}")).toBe("396_305");
  });
  it("replaces x with underscore", () => {
    expect(normalizeStrapItemCode("100x200")).toBe("100_200");
  });
  it("replaces comma with dot", () => {
    expect(normalizeStrapItemCode("100,5x200")).toBe("100.5_200");
  });
});

describe("isFacadeStrapItemCode", () => {
  it("matches known facade codes", () => {
    expect(isFacadeStrapItemCode("396_305")).toBe(true);
    expect(isFacadeStrapItemCode("153_320")).toBe(true);
  });
  it("matches Фасад prefix", () => {
    expect(isFacadeStrapItemCode("Фасад 100x200")).toBe(true);
  });
  it("rejects unknown code", () => {
    expect(isFacadeStrapItemCode("100_200")).toBe(false);
  });
});

describe("formatStrapPlanTargetCaption", () => {
  it("returns caption with product", () => {
    expect(formatStrapPlanTargetCaption("Сиена", "18")).toBe("Обвязка для изделия: Сиена");
  });
  it("returns empty for no target", () => {
    expect(formatStrapPlanTargetCaption("", "18")).toBe("");
  });
  it("returns special caption for Авелла фасады", () => {
    expect(formatStrapPlanTargetCaption("Авелла", "обвязка", "396_305")).toBe("Фасады для Сиена");
  });
});

describe("stripPlanItemMeta", () => {
  it("strips ART meta", () => {
    expect(stripPlanItemMeta("ART01 :: Полка {{ART:ART01}}")).toBe("Полка");
  });
  it("strips QRQTY meta", () => {
    expect(stripPlanItemMeta("Полка {{QRQTY:5}}")).toBe("Полка");
  });
  it("strips QTY prefix", () => {
    expect(stripPlanItemMeta("QTY=5 :: Полка")).toBe("Полка");
  });
  it("strips STRAP_FOR meta", () => {
    expect(stripPlanItemMeta("Обвязка {{STRAP_FOR:X}}")).toBe("Обвязка");
  });
  it("collapses spaces", () => {
    expect(stripPlanItemMeta("  Полка   1200  ")).toBe("Полка 1200");
  });
});

describe("extractPlanItemArticle", () => {
  it("extracts from meta", () => {
    expect(extractPlanItemArticle("Полка {{ART:ABC123}}")).toBe("ABC123");
  });
  it("extracts from prefix", () => {
    expect(extractPlanItemArticle("ABC123 :: Полка")).toBe("ABC123");
  });
  it("returns empty when none", () => {
    expect(extractPlanItemArticle("Полка")).toBe("");
  });
});

describe("extractPlanItemQrQty", () => {
  it("extracts from meta", () => {
    expect(extractPlanItemQrQty("Полка {{QRQTY:10}}")).toBe(10);
  });
  it("extracts from prefix", () => {
    expect(extractPlanItemQrQty("QTY=5 :: Полка")).toBe(5);
  });
  it("parses decimal with comma", () => {
    expect(extractPlanItemQrQty("Полка {{QRQTY:2,5}}")).toBe(2.5);
  });
  it("returns 0 when none", () => {
    expect(extractPlanItemQrQty("Полка")).toBe(0);
  });
  it("returns 0 for invalid value", () => {
    expect(extractPlanItemQrQty("Полка {{QRQTY:abc}}")).toBe(0);
  });
});

describe("formatEmbeddedPlanItem", () => {
  it("extracts title, article and qrQty", () => {
    const result = formatEmbeddedPlanItem("ART01 :: QTY=5 :: Полка {{ART:ART01}} {{QRQTY:5}}");
    expect(result.title).toBe("Полка");
    expect(result.article).toBe("ART01");
    expect(result.qrQty).toBe(5);
    expect(result.raw).toBe("ART01 :: QTY=5 :: Полка {{ART:ART01}} {{QRQTY:5}}");
  });
  it("handles plain item", () => {
    const result = formatEmbeddedPlanItem("ПростаяПолка");
    expect(result.title).toBe("ПростаяПолка");
    expect(result.article).toBe("");
    expect(result.qrQty).toBe(0);
  });
  it("returns dash for empty", () => {
    const result = formatEmbeddedPlanItem("");
    expect(result.title).toBe("—");
  });
});
