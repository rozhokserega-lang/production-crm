import { useMemo } from "react";

export function useShipmentSelectionStats({
  selectedShipments,
  strapItems,
  normalizeFurnitureKey,
  parseStrapSize,
  strapSheetWidth,
  strapSheetHeight,
}) {
  const selectedShipmentSummary = useMemo(() => {
    const items = selectedShipments.map((s) => {
      const qty = Number(s.qty || 0);
      const sheetsRaw = Number(s.sheetsNeeded || 0);
      const outputPerSheet = Number(s.outputPerSheet || 0);
      const sheetsNeeded = sheetsRaw > 0 ? sheetsRaw : outputPerSheet > 0 && qty > 0 ? Math.ceil(qty / outputPerSheet) : 0;
      const material = String(s.material || "Материал не указан");
      return { ...s, qty, sheetsNeeded, material, outputPerSheet, sheetsExact: sheetsRaw > 0 };
    });
    const byMaterial = {};
    let totalSheets = 0;
    items.forEach((x) => {
      totalSheets += x.sheetsNeeded;
      byMaterial[x.material] = (byMaterial[x.material] || 0) + x.sheetsNeeded;
    });
    const materials = Object.keys(byMaterial)
      .sort((a, b) => a.localeCompare(b, "ru"))
      .map((m) => ({ material: m, sheets: byMaterial[m] }));
    return {
      items,
      materials,
      selectedCount: items.length,
      totalSheets,
    };
  }, [selectedShipments]);

  const sendableSelectedCount = useMemo(
    () => selectedShipments.filter((x) => !!x.canSendToWork).length,
    [selectedShipments],
  );

  const selectedShipmentStockCheck = useMemo(() => {
    const byMaterial = new Map();
    selectedShipments.forEach((s) => {
      const material = String(s.material || "Материал не указан").trim();
      const key = normalizeFurnitureKey(material);
      const qty = Number(s.qty || 0);
      const sheetsRaw = Number(s.sheetsNeeded || 0);
      const outputPerSheet = Number(s.outputPerSheet || 0);
      const sheetsNeeded = sheetsRaw > 0 ? sheetsRaw : outputPerSheet > 0 && qty > 0 ? Math.ceil(qty / outputPerSheet) : 0;
      const availableSheets = Number(s.availableSheets || 0);
      if (!byMaterial.has(key)) {
        byMaterial.set(key, { material, needed: 0, available: 0, sourceKeys: new Set() });
      }
      const bucket = byMaterial.get(key);
      bucket.needed += sheetsNeeded;
      bucket.available = Math.max(bucket.available, availableSheets);
      bucket.sourceKeys.add(`${String(s.row || "").trim()}|${String(s.col || "").trim()}`);
    });
    const deficits = [...byMaterial.values()]
      .map((x) => ({ ...x, deficit: x.needed - x.available }))
      .filter((x) => x.deficit > 0);
    const deficitSourceKeys = new Set();
    deficits.forEach((x) => x.sourceKeys.forEach((k) => deficitSourceKeys.add(k)));
    return { deficits, deficitSourceKeys };
  }, [selectedShipments, normalizeFurnitureKey]);

  const strapCalculation = useMemo(() => {
    const lines = [];
    let totalSheets = 0;
    for (const x of strapItems) {
      const size = parseStrapSize(x.name);
      const qty = Number(x.qty || 0);
      if (!size || !(qty > 0)) continue;
      const stripsPerSheet = Math.floor(strapSheetHeight / size.width);
      const perStrip = Math.floor(strapSheetWidth / size.length);
      const perSheet = stripsPerSheet * perStrip;
      if (perSheet <= 0) {
        lines.push({ name: x.name, qty, perSheet: 0, sheets: 0, invalid: true });
        continue;
      }
      const sheets = Math.ceil(qty / perSheet);
      totalSheets += sheets;
      lines.push({ name: x.name, qty, perSheet, sheets, invalid: false });
    }
    return { lines, totalSheets };
  }, [strapItems, parseStrapSize, strapSheetHeight, strapSheetWidth]);

  return {
    selectedShipmentSummary,
    sendableSelectedCount,
    selectedShipmentStockCheck,
    strapCalculation,
  };
}
