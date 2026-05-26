import { describe, expect, it } from "vitest";
import {
  catalogSectionMatchesPlanSection,
  getPlanSectionVariant,
  itemMatchesPlanSectionVariant,
} from "./shipmentUtils";

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
