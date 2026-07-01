import { describe, expect, it } from "vitest";
import { isShipmentCellMissingError, normalizeOrder, formatDateTimeRu } from "./rowHelpers";

describe("isShipmentCellMissingError", () => {
  it("returns true for not found error", () => {
    expect(isShipmentCellMissingError({ message: "Shipment cell not found" })).toBe(true);
  });
  it("returns true for Russian not found", () => {
    expect(isShipmentCellMissingError({ details: "не найден" })).toBe(true);
  });
  it("returns true for not exists", () => {
    expect(isShipmentCellMissingError({ hint: "not exists" })).toBe(true);
  });
  it("returns false for other errors", () => {
    expect(isShipmentCellMissingError({ message: "Server error" })).toBe(false);
  });
  it("returns false for null", () => {
    expect(isShipmentCellMissingError(null)).toBe(false);
  });
  it("handles stringified errors", () => {
    expect(isShipmentCellMissingError({ error_description: '{"error":"not found"}' })).toBe(true);
  });
});

describe("normalizeOrder", () => {
  it("normalizes snake_case to camelCase", () => {
    const row = {
      order_id: "123",
      pilka_status: "Готово",
      kromka_status: "В работе",
      pras_status: "",
      assembly_status: "Собрано",
      overall_status: "Отправлен",
      color_name: "Белый",
      created_at: "2026-01-01",
      sheets_needed: 5,
      admin_comment: "Test",
      source_row_id: "row1",
    };
    const result = normalizeOrder(row);
    expect(result.orderId).toBe("123");
    expect(result.pilkaStatus).toBe("Готово");
    expect(result.kromkaStatus).toBe("В работе");
    expect(result.assemblyStatus).toBe("Собрано");
    expect(result.overallStatus).toBe("Отправлен");
    expect(result.colorName).toBe("Белый");
    expect(result.sheetsNeeded).toBe(5);
    expect(result.sourceRowId).toBe("row1");
    expect(result.pilkaStartedAt).toBe("");
  });
  it("maps stage timestamps", () => {
    const result = normalizeOrder({
      order_id: "1",
      pilka_started_at: "2026-06-12T09:00:00Z",
      kromka_done_at: "2026-06-15T10:00:00Z",
    });
    expect(result.pilkaStartedAt).toBe("2026-06-12T09:00:00Z");
    expect(result.kromkaDoneAt).toBe("2026-06-15T10:00:00Z");
  });
  it("preserves camelCase when present", () => {
    const row = { orderId: "456", pilkaStatus: "Пауза" };
    const result = normalizeOrder(row);
    expect(result.orderId).toBe("456");
    expect(result.pilkaStatus).toBe("Пауза");
  });
  it("returns non-object input as-is", () => {
    expect(normalizeOrder(null)).toBeNull();
    expect(normalizeOrder("string")).toBe("string");
  });
  it("adds pipelineStage from field", () => {
    const row = { pipeline_stage: "kromka" };
    const result = normalizeOrder(row);
    expect(result.pipelineStage).toBeDefined();
  });
});

describe("formatDateTimeRu", () => {
  it("formats valid date", () => {
    const result = formatDateTimeRu("2026-01-15T12:30:00Z");
    expect(result).toContain("15");
    expect(result).toContain("2026");
  });
  it("returns - for empty", () => {
    expect(formatDateTimeRu("")).toBe("-");
  });
  it("returns original for invalid", () => {
    expect(formatDateTimeRu("not-a-date")).toBe("not-a-date");
  });
});
