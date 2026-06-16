import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBaseOrderFilter } from "./useOrders";

describe("useBaseOrderFilter strap stock planning", () => {
  const kromkaGrande = {
    item: "Donini Grande 750 мм. Дуб Сонома",
    orderId: "DG-1",
    pipeline_stage: "kromka",
    pilkaStatus: "✅ Готово",
    kromkaStatus: "⏳ Ожидает",
  };
  const pilkaLoft = {
    item: "Тумба под ТВ Лофт 180. Бетон",
    orderId: "TV-1",
    pipeline_stage: "pilka",
    pilkaStatus: "⏳ Ожидает",
  };

  it("includes kromka orders on strapStock view even when workshop tab is pilka", () => {
    const { result } = renderHook(() =>
      useBaseOrderFilter({
        rows: [kromkaGrande, pilkaLoft],
        view: "strapStock",
        tab: "pilka",
        query: "",
        weekFilter: "all",
        getOverviewLaneId: (o) => String(o.pipeline_stage || "pilka"),
      }),
    );
    expect(result.current.map((o) => o.orderId)).toEqual(["DG-1", "TV-1"]);
  });

  it("still filters by workshop tab on production view", () => {
    const { result } = renderHook(() =>
      useBaseOrderFilter({
        rows: [kromkaGrande, pilkaLoft],
        view: "workshop",
        tab: "pilka",
        query: "",
        weekFilter: "all",
        getOverviewLaneId: (o) => String(o.pipeline_stage || "pilka"),
      }),
    );
    expect(result.current.map((o) => o.orderId)).toEqual(["TV-1"]);
  });
});
