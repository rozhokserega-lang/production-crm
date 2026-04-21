import { useCallback, useMemo } from "react";
import { getOverviewLaneId } from "../orderPipeline";
import {
  normalizeFurnitureKey,
  resolveStrapMaterialByProduct,
  strapNameToOrderItem,
} from "../utils/furnitureUtils";
import { getShipmentStageKey, normText, sectionSortKey } from "../utils/shipmentUtils";
import { parseStrapSize } from "../app/appUtils";

const SHIPMENT_SECTION_ORDER = [];
const STRAP_SHEET_WIDTH = 2800;
const STRAP_SHEET_HEIGHT = 2070;

export function useShipmentBoardRenderDerived({
  view,
  filtered,
  weekFilter,
  shipmentOrderMaps,
  passesShipmentStageFilter,
  shipmentSort,
  materialsStockRows,
  strapItems,
}) {
  const overviewShippedOnly = useMemo(() => {
    if (view !== "overview") return [];
    return filtered.filter((x) => getOverviewLaneId(x) === "shipped");
  }, [view, filtered]);

  const visibleCellsForItem = useCallback(
    (it) => {
      const sourceRow = it?.sourceRowId != null ? String(it.sourceRowId) : String(it?.row || "");
      return (it?.cells || []).filter((c) => {
        const qtyOk = (Number(c.qty) || 0) > 0;
        if (!qtyOk) return false;
        const byWeek = weekFilter === "all" || String(c.week || "") === weekFilter;
        if (!byWeek) return false;
        const stageKey = getShipmentStageKey(c, sourceRow, shipmentOrderMaps, it.item);
        return passesShipmentStageFilter(stageKey);
      });
    },
    [weekFilter, shipmentOrderMaps, passesShipmentStageFilter],
  );

  const sortItemsForShipment = useCallback(
    (items) => {
      const weekSortValue = (it) => {
        const arr = visibleCellsForItem(it)
          .map((c) => Number(c.week))
          .filter((n) => Number.isFinite(n));
        if (!arr.length) return 9999;
        return Math.min(...arr);
      };
      const colorSortValue = (it) => normText(it?.material || "");
      const arr = [...(items || [])];
      arr.sort((a, b) => {
        if (shipmentSort === "week") {
          const wa = weekSortValue(a);
          const wb = weekSortValue(b);
          if (wa !== wb) return wa - wb;
        } else if (shipmentSort === "color") {
          const wa = weekSortValue(a);
          const wb = weekSortValue(b);
          if (wa !== wb) return wa - wb;
          const ca = colorSortValue(a);
          const cb = colorSortValue(b);
          if (ca !== cb) return ca.localeCompare(cb, "ru");
        }
        return String(a.item || "").localeCompare(String(b.item || ""), "ru");
      });
      return arr;
    },
    [shipmentSort, visibleCellsForItem],
  );

  const strapStockByMaterial = useMemo(() => {
    const result = { "Черный": 0, "Белый": 0 };
    if (!Array.isArray(materialsStockRows) || materialsStockRows.length === 0) return result;
    materialsStockRows.forEach((row) => {
      const material = String(row?.material || "").trim();
      const key = normalizeFurnitureKey(material);
      const qtySheets = Number(row?.qty_sheets ?? row?.qtySheets ?? 0);
      const qty = Number.isFinite(qtySheets) ? qtySheets : 0;
      if (key.includes("черн")) result["Черный"] = Math.max(result["Черный"], qty);
      if (key.includes("бел")) result["Белый"] = Math.max(result["Белый"], qty);
    });
    return result;
  }, [materialsStockRows]);

  const shipmentRenderSections = useMemo(() => {
    if (view !== "shipment") return [];

    let baseSections = [];

    if (shipmentSort === "name") {
      baseSections = [...filtered]
        .sort((a, b) => {
          const ka = sectionSortKey(a.name, SHIPMENT_SECTION_ORDER);
          const kb = sectionSortKey(b.name, SHIPMENT_SECTION_ORDER);
          if (ka !== kb) return ka - kb;
          return String(a.name || "").localeCompare(String(b.name || ""), "ru");
        })
        .map((section) => ({
          name: section.name,
          items: sortItemsForShipment(section.items || []),
        }));
    } else {
      const groups = {};
      (filtered || []).forEach((section) => {
        (section.items || []).forEach((it) => {
          const visibleCells = visibleCellsForItem(it);
          if (!visibleCells.length) return;

          if (shipmentSort === "color") {
            const key = String(it.material || "Материал не указан").trim() || "Материал не указан";
            if (!groups[key]) groups[key] = [];
            groups[key].push({ ...it, cells: visibleCells });
            return;
          }

          visibleCells.forEach((cell) => {
            const wk = String(cell.week || "-").trim() || "-";
            const key = `Неделя ${wk}`;
            if (!groups[key]) groups[key] = {};
            const rowKey = String(it.row);
            if (!groups[key][rowKey]) groups[key][rowKey] = { ...it, cells: [] };
            groups[key][rowKey].cells.push(cell);
          });
        });
      });

      if (shipmentSort === "color") {
        baseSections = Object.keys(groups)
          .sort((a, b) => a.localeCompare(b, "ru"))
          .map((name) => ({
            name,
            items: sortItemsForShipment(groups[name]),
          }));
      } else {
        baseSections = Object.keys(groups)
          .sort((a, b) => {
            const na = Number(String(a).replace(/[^\d]/g, ""));
            const nb = Number(String(b).replace(/[^\d]/g, ""));
            if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
            return String(a).localeCompare(String(b), "ru");
          })
          .map((name) => ({
            name,
            items: sortItemsForShipment(Object.values(groups[name])),
          }));
      }
    }

    if (!strapItems.length) return baseSections;
    const strapRows = strapItems.map((x, idx) => {
      const size = parseStrapSize(x.name);
      const stripsPerSheet = size ? Math.floor(STRAP_SHEET_HEIGHT / size.width) : 0;
      const perStrip = size ? Math.floor(STRAP_SHEET_WIDTH / size.length) : 0;
      const outputPerSheet = stripsPerSheet * perStrip;
      const qty = Number(x.qty || 0);
      const sheetsNeeded = outputPerSheet > 0 ? Math.ceil(qty / outputPerSheet) : 0;
      const material = resolveStrapMaterialByProduct(x.productName || "");
      const availableSheets = Number(strapStockByMaterial[material] || 0);
      return {
        row: `strap-order:${idx}`,
        sourceRowId: `strap-order:${idx}`,
        item: strapNameToOrderItem(x.name),
        strapProduct: String(x.productName || "").trim(),
        material,
        cells: [
          {
            col: `strap-order-col:${idx}`,
            sourceColId: `strap-order-col:${idx}`,
            week: "-",
            qty,
            bg: "#ffffff",
            canSendToWork: false,
            inWork: false,
            sheetsNeeded,
            outputPerSheet,
            availableSheets,
            note: "Обвязка: добавлена как заказ",
          },
        ],
      };
    });

    return [...baseSections, { name: "Обвязка", items: sortItemsForShipment(strapRows) }];
  }, [view, shipmentSort, filtered, strapItems, strapStockByMaterial, sortItemsForShipment, visibleCellsForItem]);

  return {
    overviewShippedOnly,
    visibleCellsForItem,
    sortItemsForShipment,
    strapStockByMaterial,
    shipmentRenderSections,
  };
}
