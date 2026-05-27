import { describe, expect, it } from "vitest";
import {
  formatWarehouseSheetSizeLabel,
  normalizeWarehouseSheetSizeInput,
} from "./warehouseSheetSizeHelpers";

describe("warehouseSheetSizeHelpers", () => {
  it("normalizes common sheet size formats", () => {
    expect(normalizeWarehouseSheetSizeInput("2800x2070")).toBe("2800x2070");
    expect(normalizeWarehouseSheetSizeInput("2800X2070")).toBe("2800x2070");
    expect(normalizeWarehouseSheetSizeInput("2800 x 2070")).toBe("2800x2070");
    expect(normalizeWarehouseSheetSizeInput("2800×2070")).toBe("2800x2070");
  });

  it("returns empty string for blank values", () => {
    expect(normalizeWarehouseSheetSizeInput("")).toBe("");
    expect(normalizeWarehouseSheetSizeInput("-")).toBe("");
  });

  it("rejects invalid formats", () => {
    expect(normalizeWarehouseSheetSizeInput("abc")).toBeNull();
    expect(normalizeWarehouseSheetSizeInput("2800")).toBeNull();
  });

  it("formats display label", () => {
    expect(formatWarehouseSheetSizeLabel("2800x2070")).toBe("2800x2070");
    expect(formatWarehouseSheetSizeLabel("")).toBe("-");
  });
});
