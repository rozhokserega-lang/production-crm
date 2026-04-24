import { describe, it, expect } from "vitest";
import {
  getReadableTextColor,
  parseColor,
  isRedCell,
  isBlueCell,
  isYellowCell,
  passesBlueYellowFilter,
} from "./colorUtils";

describe("getReadableTextColor", () => {
  it("returns dark text for light backgrounds", () => {
    expect(getReadableTextColor("#ffffff")).toBe("#111827");
    expect(getReadableTextColor("#f0f0f0")).toBe("#111827");
  });

  it("returns light text for dark backgrounds", () => {
    expect(getReadableTextColor("#000000")).toBe("#f9fafb");
    expect(getReadableTextColor("#8b5a2b")).toBe("#f9fafb");
    expect(getReadableTextColor("#d31d1d")).toBe("#f9fafb");
  });

  it("returns dark text for medium brightness", () => {
    expect(getReadableTextColor("#3b82f6")).toBe("#f9fafb");
    expect(getReadableTextColor("#22c55e")).toBe("#111827");
  });

  it("returns fallback for invalid hex", () => {
    expect(getReadableTextColor("")).toBe("#111827");
    expect(getReadableTextColor("not-a-color")).toBe("#111827");
    expect(getReadableTextColor("#fff")).toBe("#111827");
  });
});

describe("parseColor", () => {
  it("parses 6-digit hex", () => {
    expect(parseColor("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("parses 3-digit hex", () => {
    expect(parseColor("#f00")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("parses rgb() format", () => {
    expect(parseColor("rgb(255, 0, 0)")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("returns null components for invalid input", () => {
    const result = parseColor("invalid");
    expect(result.r).toBeNull();
    expect(result.g).toBeNull();
    expect(result.b).toBeNull();
  });

  it("returns null components for empty input", () => {
    const result = parseColor("");
    expect(result.r).toBeNull();
  });
});

describe("isRedCell", () => {
  it("returns true for red-ish colors", () => {
    expect(isRedCell("#d31d1d")).toBe(true);
    expect(isRedCell("#ff4444")).toBe(true);
  });

  it("returns false for non-red colors", () => {
    expect(isRedCell("#ffffff")).toBe(false);
    expect(isRedCell("#3b82f6")).toBe(false);
    expect(isRedCell("#22c55e")).toBe(false);
  });

  it("returns false for invalid input", () => {
    expect(isRedCell("")).toBe(false);
    expect(isRedCell("invalid")).toBe(false);
  });
});

describe("isBlueCell", () => {
  it("returns true for blue-ish colors", () => {
    expect(isBlueCell("#3b82f6")).toBe(true);
    expect(isBlueCell("#dbeafe")).toBe(true);
  });

  it("returns false for non-blue colors", () => {
    expect(isBlueCell("#ffffff")).toBe(false);
    expect(isBlueCell("#ff4444")).toBe(false);
  });

  it("returns false for invalid input", () => {
    expect(isBlueCell("")).toBe(false);
  });
});

describe("isYellowCell", () => {
  it("returns true for yellow-ish colors", () => {
    expect(isYellowCell("#ffe066")).toBe(true);
    expect(isYellowCell("#ffcc00")).toBe(true);
  });

  it("returns false for non-yellow colors", () => {
    expect(isYellowCell("#ffffff")).toBe(false);
    expect(isYellowCell("#3b82f6")).toBe(false);
  });

  it("returns false for invalid input", () => {
    expect(isYellowCell("")).toBe(false);
  });
});

describe("passesBlueYellowFilter", () => {
  it("returns true when no filter is active", () => {
    expect(passesBlueYellowFilter("#ffffff", false, false)).toBe(true);
  });

  it("returns true for blue cell when showBlueCells is true", () => {
    expect(passesBlueYellowFilter("#3b82f6", true, false)).toBe(true);
  });

  it("returns true for yellow cell when showYellowCells is true", () => {
    expect(passesBlueYellowFilter("#ffe066", false, true)).toBe(true);
  });

  it("returns false for non-matching cell when filter is active", () => {
    expect(passesBlueYellowFilter("#ffffff", true, false)).toBe(false);
    expect(passesBlueYellowFilter("#ffffff", false, true)).toBe(false);
  });

  it("returns true for blue cell when both filters are active", () => {
    expect(passesBlueYellowFilter("#3b82f6", true, true)).toBe(true);
  });
});
