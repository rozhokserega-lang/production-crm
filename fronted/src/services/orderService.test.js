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

  it("calls list metal process catalog RPC", async () => {
    callBackend.mockResolvedValueOnce([]);

    await OrderService.listMetalProcessCatalog(true);

    expect(callBackend).toHaveBeenCalledWith("webListMetalProcessCatalog", { activeOnly: true });
  });

  it("sends payload for create metal process item", async () => {
    callBackend.mockResolvedValueOnce({ id: 1 });

    await OrderService.createMetalProcessItem({
      article: "M-001",
      name: "Опора",
      week: "18",
      qty: 4,
    });

    expect(callBackend).toHaveBeenCalledWith("webCreateMetalProcessItem", {
      article: "M-001",
      name: "Опора",
      week: "18",
      qty: 4,
    });
  });

  it("sends payload for stage transition action", async () => {
    callBackend.mockResolvedValueOnce({ ok: true });

    await OrderService.transitionMetalProcessStage(33, "pause");

    expect(callBackend).toHaveBeenCalledWith("webTransitionMetalProcessStage", {
      id: 33,
      action: "pause",
      startStage: null,
      doneQty: null,
      note: null,
    });
  });

  it("passes start stage when launching planned item", async () => {
    callBackend.mockResolvedValueOnce({ ok: true });

    await OrderService.transitionMetalProcessStage(41, "start", "saw");

    expect(callBackend).toHaveBeenCalledWith("webTransitionMetalProcessStage", {
      id: 41,
      action: "start",
      startStage: "saw",
      doneQty: null,
      note: null,
    });
  });

  it("sends payload for metal process operator comment", async () => {
    callBackend.mockResolvedValueOnce({ ok: true });

    await OrderService.setMetalProcessComment(17, "Проверить кромку перед сваркой");

    expect(callBackend).toHaveBeenCalledWith("webSetMetalProcessComment", {
      id: 17,
      comment: "Проверить кромку перед сваркой",
    });
  });

  it("sends payload for deleting metal process item", async () => {
    callBackend.mockResolvedValueOnce({ ok: true });

    await OrderService.deleteMetalProcessItem(41);

    expect(callBackend).toHaveBeenCalledWith("webDeleteMetalProcessItem", {
      id: 41,
    });
  });
});
