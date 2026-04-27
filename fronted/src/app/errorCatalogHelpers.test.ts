import { describe, it, expect } from "vitest";
import {
  normalizeCatalogItemName,
  normalizeCatalogDedupKey,
  extractErrorMessage,
  toUserError,
} from "./errorCatalogHelpers";

describe("normalizeCatalogItemName", () => {
  it("removes 'стол письменный' prefix", () => {
    expect(normalizeCatalogItemName("стол письменный Компас")).toBe("Компас");
  });

  it("removes 'стол кухонный' prefix", () => {
    expect(normalizeCatalogItemName("стол кухонный Престиж")).toBe("Престиж");
  });

  it("preserves name without prefix", () => {
    expect(normalizeCatalogItemName("Компас")).toBe("Компас");
  });

  it("handles empty string", () => {
    expect(normalizeCatalogItemName("")).toBe("");
  });

  it("handles null/undefined", () => {
    expect(normalizeCatalogItemName(null)).toBe("");
    expect(normalizeCatalogItemName(undefined)).toBe("");
  });
});

describe("normalizeCatalogDedupKey", () => {
  it("lowercases and normalizes spaces", () => {
    expect(normalizeCatalogDedupKey("Компас")).toBe("компас");
  });

  it("replaces 'х' with 'x'", () => {
    expect(normalizeCatalogDedupKey("800х600")).toBe("800x600");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeCatalogDedupKey("стол  письменный  Компас")).toBe("компас");
  });

  it("trims whitespace", () => {
    expect(normalizeCatalogDedupKey("  Компас  ")).toBe("компас");
  });
});

describe("extractErrorMessage", () => {
  it("returns message from Error object", () => {
    expect(extractErrorMessage(new Error("Test error"))).toBe("Test error");
  });

  it("returns string directly", () => {
    expect(extractErrorMessage("Simple error")).toBe("Simple error");
  });

  it("extracts message from parsed JSON error", () => {
    const err = JSON.stringify({ message: "JSON error message" });
    expect(extractErrorMessage(err)).toBe("JSON error message");
  });

  it("extracts error field from parsed JSON", () => {
    const err = JSON.stringify({ error: "Error field" });
    expect(extractErrorMessage(err)).toBe("Error field");
  });

  it("extracts details field from parsed JSON", () => {
    const err = JSON.stringify({ details: "Details field" });
    expect(extractErrorMessage(err)).toBe("Details field");
  });

  it("extracts hint field from parsed JSON", () => {
    const err = JSON.stringify({ hint: "Hint field" });
    expect(extractErrorMessage(err)).toBe("Hint field");
  });

  it("extracts error_description from parsed JSON", () => {
    const err = JSON.stringify({ error_description: "Description" });
    expect(extractErrorMessage(err)).toBe("Description");
  });

  it("returns raw string if JSON parsing fails", () => {
    expect(extractErrorMessage("not json")).toBe("not json");
  });

  it("returns fallback for empty message", () => {
    expect(extractErrorMessage("")).toBe("Неизвестная ошибка");
    expect(extractErrorMessage(null)).toBe("Неизвестная ошибка");
    expect(extractErrorMessage(undefined)).toBe("Неизвестная ошибка");
  });
});

describe("toUserError", () => {
  it("returns friendly message for 'Система занята'", () => {
    expect(toUserError(new Error("Система занята"))).toBe("Система занята, повторите через 1-2 секунды.");
  });

  it("returns friendly message for network errors", () => {
    expect(toUserError(new Error("Failed to fetch"))).toBe("Нет связи с сервером. Проверьте интернет и повторите.");
    expect(toUserError(new Error("NetworkError"))).toBe("Нет связи с сервером. Проверьте интернет и повторите.");
  });

  it("returns original message for other errors", () => {
    expect(toUserError(new Error("Some other error"))).toBe("Some other error");
  });

  it("returns fallback for empty error", () => {
    expect(toUserError("")).toBe("Неизвестная ошибка");
  });
});
