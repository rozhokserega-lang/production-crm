import { useMemo } from "react";

interface UseWarehouseOrderPlanRowsParams {
  view: string;
  shipmentBoard: Record<string, unknown>;
}

interface UseWarehouseOrderPlanRowsReturn {
  warehouseOrderPlanRows: unknown[];
}

export function useWarehouseOrderPlanRows({
  view,
  shipmentBoard,
}: UseWarehouseOrderPlanRowsParams): UseWarehouseOrderPlanRowsReturn {
  const warehouseOrderPlanRows = useMemo(() => {
    if (view !== "warehouse") return [];
    const byMaterial = new Map<string, { material: string; itemName: string; totalQty: number }>();
    const sections = (shipmentBoard.sections || []) as Record<string, unknown>[];
    sections.forEach((section) => {
      const items = (section.items || []) as Record<string, unknown>[];
      items.forEach((item) => {
        const materialKey = String(item.material || item.item || "").trim().toLowerCase();
        if (!materialKey) return;
        const cells = (item.cells || []) as Record<string, unknown>[];
        cells.forEach((cell) => {
          const qty = Number(cell.qty || 0);
          if (!byMaterial.has(materialKey)) {
            byMaterial.set(materialKey, {
              material: String(item.material || ""),
              itemName: String(item.item || ""),
              totalQty: 0,
            });
          }
          byMaterial.get(materialKey)!.totalQty += qty;
        });
      });
    });
    return [...byMaterial.values()].sort((a, b) => a.material.localeCompare(b.material, "ru"));
  }, [view, shipmentBoard]);

  return { warehouseOrderPlanRows };
}
