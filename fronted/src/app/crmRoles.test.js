import { describe, expect, it } from "vitest";
import {
  canOperateProductionForRole,
  canOperateLaborPlannerForRole,
  canOperateWorkshopStageForRole,
  canUseOperatorPilkaModeForRole,
  canConsumePilkaSheetsForRole,
  canAccessViewForRole,
  canAccessLaborSubViewForRole,
  canAccessWorkshopTabForRole,
  getAllowedViewIdsForRole,
  getAllowedLaborSubViewsForRole,
  getAllowedWorkshopTabsForRole,
  getDefaultViewForRole,
  getDefaultLaborSubViewForRole,
  normalizeCrmRole,
  resolveWorkshopStageForAction,
} from "./crmRoles";

describe("crmRoles", () => {
  it("normalizes unknown roles to viewer", () => {
    expect(normalizeCrmRole("operator_pilka")).toBe("operator_pilka");
    expect(normalizeCrmRole("UNKNOWN")).toBe("viewer");
  });

  it("maps stage actions", () => {
    expect(resolveWorkshopStageForAction("webSetKromkaInWork")).toBe("kromka");
    expect(resolveWorkshopStageForAction("webSetAssemblyDone")).toBe("assembly");
  });

  it("limits stage operators to their line", () => {
    expect(canOperateWorkshopStageForRole("operator_pilka", "pilka")).toBe(true);
    expect(canOperateWorkshopStageForRole("operator_pilka", "kromka")).toBe(false);
    expect(canOperateWorkshopStageForRole("operator", "pras")).toBe(true);
    expect(canOperateWorkshopStageForRole("manager", "pilka")).toBe(true);
  });

  it("keeps full production rights for legacy operator only", () => {
    expect(canOperateProductionForRole("operator_pilka")).toBe(false);
    expect(canOperateProductionForRole("operator")).toBe(true);
    expect(canOperateProductionForRole("admin")).toBe(true);
  });

  it("allows operator pilka mode only for pilka-capable roles", () => {
    expect(canUseOperatorPilkaModeForRole("operator_pilka")).toBe(true);
    expect(canUseOperatorPilkaModeForRole("operator_kromka")).toBe(false);
  });

  it("allows pilka sheet consume for pilka operators", () => {
    expect(canConsumePilkaSheetsForRole("operator_pilka")).toBe(true);
    expect(canConsumePilkaSheetsForRole("operator_kromka")).toBe(false);
    expect(canConsumePilkaSheetsForRole("operator")).toBe(true);
  });

  it("restricts navigation by operator role", () => {
    expect(getAllowedViewIdsForRole("operator_pilka")).toEqual(["workshop", "cutting"]);
    expect(getAllowedViewIdsForRole("operator_kromka")).toEqual(["workshop"]);
    expect(getAllowedViewIdsForRole("planner")).toEqual(["labor"]);
    expect(getAllowedLaborSubViewsForRole("planner")).toEqual(["planner"]);
    expect(canAccessViewForRole("planner", "labor")).toBe(true);
    expect(canAccessViewForRole("planner", "shipment")).toBe(false);
    expect(canAccessLaborSubViewForRole("planner", "planner")).toBe(true);
    expect(canAccessLaborSubViewForRole("planner", "total")).toBe(false);
    expect(getDefaultViewForRole("planner")).toBe("labor");
    expect(getDefaultLaborSubViewForRole("planner")).toBe("planner");
    expect(canOperateLaborPlannerForRole("planner")).toBe(true);
    expect(canOperateProductionForRole("planner")).toBe(false);
    expect(canAccessViewForRole("operator_pilka", "cutting")).toBe(true);
    expect(canAccessViewForRole("operator_pilka", "shipment")).toBe(false);
    expect(canAccessViewForRole("operator", "shipment")).toBe(true);
    expect(getAllowedWorkshopTabsForRole("operator_kromka")).toEqual(["kromka"]);
    expect(canAccessWorkshopTabForRole("operator_pras", "pilka")).toBe(false);
  });
});
