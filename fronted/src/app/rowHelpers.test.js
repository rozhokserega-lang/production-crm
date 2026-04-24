import { describe, it, expect } from "vitest";
import {
  isShipmentCellMissingError,
  normalizeOrder,
  formatDateTimeRu,
} from "./rowHelpers";

describe("isShipmentCellMissingError", () => {
  it("detects 'shipment cell not found' error", () => {
    const err = new Error("shipment cell not found");
    expect(isShipmentCellMissingError(err)).toBe(true);
  });

  it("detects 'not found' error", () => {
    const err = new Error("Not found");
    expect(isShipmentCellMissingError(err)).toBe(true);
  });

  it("detects 'не найден' error", () => {
    const err = new Error("Заказ не найден");
    expect(isShipmentCellMissingError(err)).toBe(true);
  });

  it("detects 'not exists' error", () => {
    const err = new Error("Record not exists");
    expect(isShipmentCellMissingError(err)).toBe(true);
  });

  it("returns false for other errors", () => {
    const err = new Error("Some other error");
    expect(isShipmentCellMissingError(err)).toBe(false);
  });

  it("handles error with details field", () => {
    const err = { message: "Error", details: "shipment cell not found" };
    expect(isShipmentCellMissingError(err)).toBe(true);
  });

  it("handles null/undefined", () => {
    expect(isShipmentCellMissingError(null)).toBe(false);
    expect(isShipmentCellMissingError(undefined)).toBe(false);
  });
});

describe("normalizeOrder", () => {
  it("normalizes camelCase fields", () => {
    const input = { orderId: "A-1", pilkaStatus: "В работе" };
    const result = normalizeOrder(input);
    expect(result.orderId).toBe("A-1");
    expect(result.pilkaStatus).toBe("В работе");
  });

  it("normalizes snake_case fields", () => {
    const input = { order_id: "A-1", pilka_status: "В работе" };
    const result = normalizeOrder(input);
    expect(result.orderId).toBe("A-1");
    expect(result.pilkaStatus).toBe("В работе");
  });

  it("normalizes short field names (pilka/kromka/pras)", () => {
    const input = { orderId: "A-1", pilka: "В работе" };
    const result = normalizeOrder(input);
    expect(result.pilkaStatus).toBe("В работе");
  });

  it("resolves pipelineStage from status fields", () => {
    const input = { orderId: "A-1", pilkaStatus: "готов", kromkaStatus: "готов", prasStatus: "готов" };
    const result = normalizeOrder(input);
    expect(result.pipelineStage).toBe("workshop_complete");
  });

  it("uses pipeline_stage from DB when available", () => {
    const input = { orderId: "A-1", pipeline_stage: "shipped", pilkaStatus: "в работе" };
    const result = normalizeOrder(input);
    expect(result.pipelineStage).toBe("shipped");
  });

  it("returns the input as-is for null/undefined", () => {
    expect(normalizeOrder(null)).toBeNull();
    expect(normalizeOrder(undefined)).toBeUndefined();
  });

  it("normalizes sheetsNeeded", () => {
    const input = { orderId: "A-1", sheets_needed: 5 };
    const result = normalizeOrder(input);
    expect(result.sheetsNeeded).toBe(5);
  });

  it("normalizes adminComment", () => {
    const input = { orderId: "A-1", admin_comment: "Test comment" };
    const result = normalizeOrder(input);
    expect(result.adminComment).toBe("Test comment");
  });
});

describe("formatDateTimeRu", () => {
  it("returns '-' for empty input", () => {
    expect(formatDateTimeRu("")).toBe("-");
    expect(formatDateTimeRu(null)).toBe("-");
    expect(formatDateTimeRu(undefined)).toBe("-");
  });

  it("returns original string for invalid date", () => {
    expect(formatDateTimeRu("not-a-date")).toBe("not-a-date");
  });

  it("formats valid date string", () => {
    const result = formatDateTimeRu("2026-04-24T10:00:00Z");
    expect(result).toContain("2026");
    expect(result).toContain("04");
    expect(result).toContain("24");
  });

  it("formats Date object", () => {
    const result = formatDateTimeRu(new Date("2026-04-24T10:00:00Z"));
    expect(result).toContain("2026");
  });
});
