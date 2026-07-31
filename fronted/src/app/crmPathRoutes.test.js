import { describe, expect, it } from "vitest";
import {
  CRM_PATH_SKLAD,
  normalizeCrmPathname,
  readViewFromPathname,
  getDedicatedPathForView,
} from "./crmPathRoutes";

describe("crmPathRoutes", () => {
  it("распознаёт /sklad", () => {
    expect(readViewFromPathname("/sklad")).toBe("warehouseMissing");
    expect(readViewFromPathname("/sklad/")).toBe("warehouseMissing");
    expect(readViewFromPathname("/SKLAD")).toBe("warehouseMissing");
  });

  it("не мапит прочие пути", () => {
    expect(readViewFromPathname("/")).toBe(null);
    expect(readViewFromPathname("/cutting")).toBe(null);
  });

  it("отдаёт путь для режима склада", () => {
    expect(getDedicatedPathForView("warehouseMissing")).toBe(CRM_PATH_SKLAD);
    expect(getDedicatedPathForView("shipment")).toBe(null);
  });

  it("нормализует pathname", () => {
    expect(normalizeCrmPathname("/sklad/")).toBe("/sklad");
    expect(normalizeCrmPathname("")).toBe("/");
  });
});
