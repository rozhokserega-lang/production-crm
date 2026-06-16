import { useMemo } from "react";
import { ceilWholeSheets } from "../app/appUtils";
import { resolveSheetNeedsByMaterials } from "../app/furnitureMaterialYield";

export function useShipmentSelectionStats({
  selectedShipments,
  strapItems,
  normalizeFurnitureKey,
  parseStrapSize,
  strapSheetWidth,
  strapSheetHeight,
  furnitureCustomTemplates,
}) {
  const selectedShipmentSummary = useMemo(() => {
    const templates = Array.isArray(furnitureCustomTemplates) ? furnitureCustomTemplates : [];
    const n = normalizeFurnitureKey;
    const items = selectedShipments.map((s) => {
      const qty = Number(s.qty || 0);
      const material = String(s.material || "Материал не указан").trim();
      const materialLines = resolveSheetNeedsByMaterials(templates, s.item, qty, material, n);
      const sheetsFromLines = materialLines.reduce((sum, line) => sum + line.sheets, 0);
      const sheetsRaw = ceilWholeSheets(s.sheetsNeeded || 0);
      const outputPerSheet = Number(s.outputPerSheet || 0);
      const sheetsFallback =
        sheetsRaw > 0 ? sheetsRaw : outputPerSheet > 0 && qty > 0 ? ceilWholeSheets(qty / outputPerSheet) : 0;
      const sheetsNeeded = sheetsFromLines > 0 ? sheetsFromLines : sheetsFallback;
      const multiDecor = materialLines.length > 1;
      return {
        ...s,
        qty,
        sheetsNeeded,
        material,
        materialLines,
        multiDecor,
        outputPerSheet,
        sheetsExact: sheetsRaw > 0 && !multiDecor,
      };
    });
    const byMaterial = {};
    let totalSheets = 0;
    items.forEach((x) => {
      if (x.materialLines?.length) {
        x.materialLines.forEach((line) => {
          totalSheets += line.sheets;
          byMaterial[line.material] = (byMaterial[line.material] || 0) + line.sheets;
        });
      } else {
        totalSheets += x.sheetsNeeded;
        byMaterial[x.material] = (byMaterial[x.material] || 0) + x.sheetsNeeded;
      }
    });
    const materials = Object.keys(byMaterial)
      .sort((a, b) => a.localeCompare(b, "ru"))
      .map((m) => ({ material: m, sheets: byMaterial[m] }));
    const totalQty = items.reduce((sum, x) => sum + (Number(x.qty) || 0), 0);
    return {
      items,
      materials,
      selectedCount: items.length,
      totalSheets,
      totalQty,
    };
  }, [selectedShipments, furnitureCustomTemplates, normalizeFurnitureKey]);

  const sendableSelectedCount = useMemo(
    () => selectedShipments.filter((x) => !!x.canSendToWork).length,
    [selectedShipments],
  );

  const selectedShipmentStockCheck = useMemo(() => {
    const templates = Array.isArray(furnitureCustomTemplates) ? furnitureCustomTemplates : [];
    const byMaterial = new Map();
    selectedShipments.forEach((s) => {
      const qty = Number(s.qty || 0);
      const cellMaterial = String(s.material || "Материал не указан").trim();
      const lines = resolveSheetNeedsByMaterials(templates, s.item, qty, cellMaterial, normalizeFurnitureKey);
      const sheetsRaw = ceilWholeSheets(s.sheetsNeeded || 0);
      const outputPerSheet = Number(s.outputPerSheet || 0);
      const sheetsFallback =
        sheetsRaw > 0 ? sheetsRaw : outputPerSheet > 0 && qty > 0 ? ceilWholeSheets(qty / outputPerSheet) : 0;
      const needLines =
        lines.length > 0
          ? lines
          : sheetsFallback > 0
            ? [{ material: cellMaterial, sheets: sheetsFallback }]
            : [];
      const availableSheets = Number(s.availableSheets || 0);
      const sourceKey = `${String(s.row || "").trim()}|${String(s.col || "").trim()}`;
      needLines.forEach((line) => {
        const material = String(line.material || cellMaterial).trim();
        const key = normalizeFurnitureKey(material);
        if (!byMaterial.has(key)) {
          byMaterial.set(key, { material, needed: 0, available: 0, sourceKeys: new Set() });
        }
        const bucket = byMaterial.get(key);
        bucket.needed += line.sheets;
        bucket.available = Math.max(bucket.available, availableSheets);
        bucket.sourceKeys.add(sourceKey);
      });
    });
    const deficits = [...byMaterial.values()]
      .map((x) => ({ ...x, deficit: x.needed - x.available }))
      .filter((x) => x.deficit > 0);
    const deficitSourceKeys = new Set();
    deficits.forEach((x) => x.sourceKeys.forEach((k) => deficitSourceKeys.add(k)));
    return { deficits, deficitSourceKeys };
  }, [selectedShipments, normalizeFurnitureKey, furnitureCustomTemplates]);

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
