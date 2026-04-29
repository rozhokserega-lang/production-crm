import { beforeEach, describe, expect, it, vi } from "vitest";
import { callBackend } from "../api";
import { OrderService } from "./orderService";

vi.mock("../api", () => ({
  callBackend: vi.fn(),
}));

describe("OrderService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps stage to correct RPC in getOrdersByStage", async () => {
    callBackend.mockResolvedValueOnce([]);

    await OrderService.getOrdersByStage("kromka");

    expect(callBackend).toHaveBeenCalledWith("webGetOrdersKromka");
  });

  it("falls back to webGetOrdersAll for unknown stage", async () => {
    callBackend.mockResolvedValueOnce([]);

    await OrderService.getOrdersByStage("unknown-stage");

    expect(callBackend).toHaveBeenCalledWith("webGetOrdersAll");
  });

  it("sends kits_per_sheet in upsertFurnitureCustomTemplate", async () => {
    callBackend.mockResolvedValueOnce({ ok: true });

    await OrderService.upsertFurnitureCustomTemplate("GX", [{ detailName: "A", perUnit: 1 }], 6);

    expect(callBackend).toHaveBeenCalledWith("webUpsertFurnitureCustomTemplate", {
      p_product_name: "GX",
      p_details: [{ detailName: "A", perUnit: 1 }],
      p_kits_per_sheet: 6,
    });
  });

  it("sends normalized payload in upsertItemArticleMapVariants", async () => {
    callBackend.mockResolvedValueOnce({ ok: true });
    const variants = [{ article: "GX-1", color: "White" }];

    await OrderService.upsertItemArticleMapVariants("Main", "GX", variants, 42);

    expect(callBackend).toHaveBeenCalledWith("webUpsertItemArticleMapVariants", {
      p_section_name: "Main",
      p_item_name: "GX",
      p_variants: variants,
      p_sort_order: 42,
    });
  });

  it("falls back to shipment table when board RPC fails", async () => {
    callBackend.mockRejectedValueOnce(new Error("missing board rpc"));
    callBackend.mockResolvedValueOnce([{ row: 1 }]);

    const result = await OrderService.getShipmentBoard();

    expect(callBackend).toHaveBeenNthCalledWith(1, "webGetShipmentBoard");
    expect(callBackend).toHaveBeenNthCalledWith(2, "webGetShipmentTable");
    expect(result).toEqual([{ row: 1 }]);
  });
});
