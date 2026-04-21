import { useMemo } from "react";

export function useWarehouseOrderPlanRows({
  shipmentBoard,
  materialsStockRows,
  getMaterialLabel,
  normalizeFurnitureKey,
}) {
  return useMemo(() => {
    const byMaterial = new Map();
    const sections = Array.isArray(shipmentBoard?.sections) ? shipmentBoard.sections : [];
    sections.forEach((section) => {
      (section?.items || []).forEach((it) => {
        const materialLabel = getMaterialLabel(it?.item, it?.material);
        const materialKey = normalizeFurnitureKey(materialLabel);
        (it?.cells || []).forEach((c) => {
          const qty = Number(c?.qty || 0);
          if (!(qty > 0)) return;
          if (c?.inWork) return;
          const sheetsRaw = Number(c?.sheetsNeeded || 0);
          const outputPerSheet = Number(c?.outputPerSheet || 0);
          const sheetsNeeded = sheetsRaw > 0 ? sheetsRaw : outputPerSheet > 0 ? Math.ceil(qty / outputPerSheet) : 0;
          if (!(sheetsNeeded > 0)) return;
          if (!byMaterial.has(materialKey)) {
            byMaterial.set(materialKey, {
              material: materialLabel || "Материал не указан",
              needed: 0,
            });
          }
          byMaterial.get(materialKey).needed += sheetsNeeded;
        });
      });
    });

    const availableByMaterial = new Map();
    (materialsStockRows || []).forEach((row) => {
      const material = String(row?.material || "").trim();
      const key = normalizeFurnitureKey(material);
      if (!key) return;
      const qtySheets = Number(row?.qty_sheets ?? row?.qtySheets ?? 0);
      const qty = Number.isFinite(qtySheets) ? qtySheets : 0;
      availableByMaterial.set(key, Math.max(availableByMaterial.get(key) || 0, qty));
    });

    return [...byMaterial.entries()]
      .map(([materialKey, row]) => {
        const available = Number(availableByMaterial.get(materialKey) || 0);
        const needed = Number(row.needed || 0);
        return {
          material: row.material,
          needed,
          available,
          toOrder: Math.max(0, needed - available),
        };
      })
      .filter((row) => row.toOrder > 0)
      .sort((a, b) => b.toOrder - a.toOrder || a.material.localeCompare(b.material, "ru"));
  }, [shipmentBoard, materialsStockRows, getMaterialLabel, normalizeFurnitureKey]);
}
