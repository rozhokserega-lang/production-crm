import { describe, expect, it } from "vitest";
import {
  catalogItemsToEditorRows,
  catalogKitSizesChanged,
  expandCatalogKitToCuttingItems,
  normalizeCatalogItem,
  parseCuttingCatalogDims,
} from "./cuttingCatalogHelpers";

describe("cuttingCatalogHelpers", () => {
  it("prefers explicit cutting sizes over size token in name", () => {
    expect(parseCuttingCatalogDims({ itemName: "Крышки (736_350)", w: 735.5, h: 350 })).toEqual({
      w: 735.5,
      h: 350,
    });
  });

  it("rounds cutting sizes to 0.5 mm step", () => {
    expect(normalizeCatalogItem({
      itemName: "Планка",
      w: "736.3",
      h: "40.1",
      perUnit: 2,
    })).toMatchObject({ w: 736.5, h: 40 });
  });

  it("expands kit using saved cutting sizes", () => {
    const kit = {
      name: "Siena 2 150",
      items: [{ itemName: "Крышки (736_350)", w: 735, h: 350, perUnit: 2, material: "ЛДСП 16" }],
    };
    const items = expandCatalogKitToCuttingItems(kit, 1);
    expect(items[0].w).toBe(735);
    expect(items[0].h).toBe(350);
    expect(items[0].qty).toBe(2);
  });

  it("uses editor rows for one-off cutting without touching catalog item names", () => {
    const kit = {
      items: [{ itemName: "Дно (720_321)", w: 720, h: 321, perUnit: 2 }],
    };
    const rows = catalogItemsToEditorRows(kit.items);
    rows[0].w = 719;
    const items = expandCatalogKitToCuttingItems(kit, 2, "сонома", rows);
    expect(items[0].w).toBe(719);
    expect(items[0].qty).toBe(4);
    expect(catalogKitSizesChanged(kit.items, rows)).toBe(true);
  });

  it("normalizes editor rows for save", () => {
    expect(normalizeCatalogItem({
      itemName: "Стойка (305_266)",
      w: "304",
      h: "265",
      perUnit: "2",
      material: "ЛДСП 16",
    })).toEqual({
      itemName: "Стойка (305_266)",
      w: 304,
      h: 265,
      perUnit: 2,
      material: "ЛДСП 16",
    });
  });
});
