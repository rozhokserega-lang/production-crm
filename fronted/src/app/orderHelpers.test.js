import { describe, it, expect } from "vitest";
import {
  shipmentOrderKey,
  orderUpdatedTs,
  mergeOrderPreferNewer,
  getMaterialLabel,
  hasArticleLikeCode,
  getPlanPreviewArticleCode,
  embedPlanItemArticle,
  stripPlanItemMeta,
  extractPlanItemArticle,
  extractPlanItemQrQty,
} from "./orderHelpers";

describe("shipmentOrderKey", () => {
  it("creates key from sourceRow and week", () => {
    expect(shipmentOrderKey("row1", "2026-W17")).toBe("row1|2026-W17");
  });

  it("trims whitespace", () => {
    expect(shipmentOrderKey("  row1  ", "  week  ")).toBe("row1|week");
  });
});

describe("orderUpdatedTs", () => {
  it("returns timestamp from updatedAt", () => {
    const ts = orderUpdatedTs({ updatedAt: "2026-04-24T10:00:00Z" });
    expect(ts).toBeGreaterThan(0);
  });

  it("falls back to updated_at", () => {
    const ts = orderUpdatedTs({ updated_at: "2026-04-24T10:00:00Z" });
    expect(ts).toBeGreaterThan(0);
  });

  it("falls back to createdAt", () => {
    const ts = orderUpdatedTs({ createdAt: "2026-04-24T10:00:00Z" });
    expect(ts).toBeGreaterThan(0);
  });

  it("returns 0 for empty input", () => {
    expect(orderUpdatedTs({})).toBe(0);
  });
});

describe("mergeOrderPreferNewer", () => {
  it("sets first entry", () => {
    const map = new Map();
    mergeOrderPreferNewer(map, "key1", { id: 1, updatedAt: "2026-04-24T10:00:00Z" });
    expect(map.get("key1")).toEqual({ id: 1, updatedAt: "2026-04-24T10:00:00Z" });
  });

  it("replaces with newer entry", () => {
    const map = new Map();
    mergeOrderPreferNewer(map, "key1", { id: 1, updatedAt: "2026-04-24T10:00:00Z" });
    mergeOrderPreferNewer(map, "key1", { id: 2, updatedAt: "2026-04-24T11:00:00Z" });
    expect(map.get("key1").id).toBe(2);
  });

  it("keeps existing entry when new one is older", () => {
    const map = new Map();
    mergeOrderPreferNewer(map, "key1", { id: 1, updatedAt: "2026-04-24T11:00:00Z" });
    mergeOrderPreferNewer(map, "key1", { id: 2, updatedAt: "2026-04-24T10:00:00Z" });
    expect(map.get("key1").id).toBe(1);
  });

  it("does nothing for empty key", () => {
    const map = new Map();
    mergeOrderPreferNewer(map, "", { id: 1 });
    expect(map.size).toBe(0);
  });
});

describe("getMaterialLabel", () => {
  it("returns material when provided", () => {
    expect(getMaterialLabel("item.name.Egger", "Egger White")).toBe("Egger White");
  });

  it("extracts material from item name tail", () => {
    expect(getMaterialLabel("item.name.Egger", "")).toBe("Egger");
  });

  it("returns fallback when both are empty", () => {
    expect(getMaterialLabel("", "")).toBe("Материал не указан");
    expect(getMaterialLabel(null, null)).toBe("Материал не указан");
  });
});

describe("hasArticleLikeCode", () => {
  it("returns true for valid article codes", () => {
    expect(hasArticleLikeCode({ productArticle: "ART123" })).toBe(true);
    expect(hasArticleLikeCode({ articleCode: "AB.123" })).toBe(true);
    expect(hasArticleLikeCode({ mappedArticleCode: "CODE_001" })).toBe(true);
  });

  it("returns false for empty or short codes", () => {
    expect(hasArticleLikeCode({})).toBe(false);
    expect(hasArticleLikeCode({ productArticle: "" })).toBe(false);
    expect(hasArticleLikeCode({ productArticle: "AB" })).toBe(false);
  });
});

describe("embedPlanItemArticle / stripPlanItemMeta / extractPlanItemArticle", () => {
  it("embeds and extracts article code", () => {
    const embedded = embedPlanItemArticle("Стол Компас", "ART001");
    expect(embedded).toContain("ART001");
    expect(embedded).toContain("{{ART:ART001}}");
    expect(extractPlanItemArticle(embedded)).toBe("ART001");
  });

  it("strips meta from item name", () => {
    const embedded = embedPlanItemArticle("Стол Компас", "ART001");
    const stripped = stripPlanItemMeta(embedded);
    expect(stripped).toBe("Стол Компас");
    expect(stripped).not.toContain("{{ART:");
  });

  it("extracts article from prefix format", () => {
    const result = extractPlanItemArticle("ART001 :: Стол Компас {{ART:ART001}}");
    expect(result).toBe("ART001");
  });

  it("returns empty string when no article found", () => {
    expect(extractPlanItemArticle("Стол Компас")).toBe("");
  });

  it("embeds QR qty when provided", () => {
    const embedded = embedPlanItemArticle("Стол Компас", "ART001", 5);
    expect(embedded).toContain("QTY=5");
    expect(embedded).toContain("{{QRQTY:5}}");
  });

  it("does not embed QR qty for zero", () => {
    const embedded = embedPlanItemArticle("Стол Компас", "ART001", 0);
    expect(embedded).not.toContain("QTY=");
  });
});

describe("extractPlanItemQrQty", () => {
  it("extracts QR qty from meta", () => {
    expect(extractPlanItemQrQty("Стол {{QRQTY:5}}")).toBe(5);
  });

  it("extracts QR qty from prefix", () => {
    expect(extractPlanItemQrQty("QTY=5 :: Стол")).toBe(5);
  });

  it("returns 0 when no QR qty found", () => {
    expect(extractPlanItemQrQty("Стол Компас")).toBe(0);
  });

  it("handles decimal QR qty", () => {
    expect(extractPlanItemQrQty("{{QRQTY:2.5}}")).toBe(2.5);
  });
});

describe("getPlanPreviewArticleCode", () => {
  it("extracts from direct fields", () => {
    expect(getPlanPreviewArticleCode({ productArticle: "ART001" })).toBe("ART001");
  });

  it("extracts from rows array", () => {
    const preview = { rows: [{ productArticle: "ART002" }] };
    expect(getPlanPreviewArticleCode(preview)).toBe("ART002");
  });

  it("returns empty string when nothing found", () => {
    expect(getPlanPreviewArticleCode({})).toBe("");
  });
});
