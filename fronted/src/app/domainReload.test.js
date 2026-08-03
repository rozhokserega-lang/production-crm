import { describe, expect, it } from "vitest";
import {
  getViewDomains,
  partitionDomains,
  resolveDomainsForRealtimeEvent,
} from "./domainReload";

describe("domainReload", () => {
  it("returns view-specific domains", () => {
    expect(getViewDomains("warehouse")).toEqual(["warehouse"]);
    expect(getViewDomains("workshop")).toContain("orders");
    expect(getViewDomains("workshop")).toContain("shipment");
  });

  it("skips unrelated domains for the active view", () => {
    expect(resolveDomainsForRealtimeEvent("crm_audit_log", "workshop")).toEqual([]);
    expect(resolveDomainsForRealtimeEvent("labor_facts", "warehouse")).toEqual([]);
  });

  it("reloads warehouse only on warehouse view for materials_moves", () => {
    expect(resolveDomainsForRealtimeEvent("materials_moves", "warehouse")).toEqual(["warehouse"]);
    expect(resolveDomainsForRealtimeEvent("materials_moves", "shipment")).toEqual([]);
  });

  it("reloads shipment subset on workshop for materials_stock", () => {
    expect(resolveDomainsForRealtimeEvent("materials_stock", "workshop")).toEqual(["shipment"]);
  });

  it("warehouse /sklad does not pull full orders domain on realtime", () => {
    expect(getViewDomains("warehouseMissing")).not.toContain("orders");
    expect(resolveDomainsForRealtimeEvent("orders", "warehouseMissing")).toEqual([]);
  });

  it("partitions internal and external domains", () => {
    expect(partitionDomains(["orders", "metal", "admin"])).toEqual({
      internal: ["orders"],
      external: ["metal", "admin"],
    });
  });
});
