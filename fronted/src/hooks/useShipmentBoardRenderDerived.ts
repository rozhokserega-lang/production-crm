import { useCallback, useMemo } from "react";
import { getOverviewLaneId } from "../orderPipeline";
import {
  normalizeFurnitureKey,
  resolveStrapMaterialByProduct,
  strapNameToOrderItem,
} from "../utils/furnitureUtils";
import { getShipmentStageKey, normText, sectionSortKey } from "../utils/shipmentUtils";
import { parseStrapSize } from "../app/appUtils";

const SHIPMENT_SECTION_ORDER: string[] = [];
const STRAP_SHEET_WIDTH = 2800;
const STRAP_SHEET_HEIGHT = 2070;

interface StrapItem {
  name?: string;
  qty?: number;
  productName?: string;
}

interface UseShipmentBoardRenderDerivedParams {
  view: string;
  filtered: Record<string, unknown>[];
  weekFilter: string;
  shipmentOrderMaps: Record<string, unknown>;
  passesShipmentStageFilter: (stageKey: string) => boolean;
  shipmentSort: string;
  materialsStockRows: Record<string, unknown>[];
  strapItems: StrapItem[];
}

interface UseShipmentBoardRenderDerivedReturn {
  overviewShippedOnly: Record<string, unknown>[];
  visibleCellsForItem: (it: Record<string, unknown>) => Record<string, unknown>[];
  sortItemsForShipment: (items: Record<string, unknown>[]) => Record<string, unknown>[];
  strapStockByMaterial: Record<string, number>;
  shipmentRenderSections: Record<string, unknown>[];
}

function pickPreferredGroupLabel(currentLabel: string, nextLabel: string): string {
  const current = String(currentLabel || "").trim();
  const next = String(nextLabel || "").trim();
  if (!next) return current;
  if (!current) return next;
  const currentFirst = current[0] || "";
  const nextFirst = next[0] || "";
  const currentStartsUpper = currentFirst === currentFirst.toUpperCase() && currentFirst !== currentFirst.toLowerCase();
  const nextStartsUpper = nextFirst === nextFirst.toUpperCase() && nextFirst !== nextFirst.toLowerCase();
  if (!currentStartsUpper && nextStartsUpper) return next;
  return current;
}

export function useShipmentBoardRenderDerived({
  view,
  filtered,
  weekFilter,
  shipmentOrderMaps,
  passesShipmentStageFilter,
  shipmentSort,
  materialsStockRows,
  strapItems,
}: UseShipmentBoardRenderDerivedParams): UseShipmentBoardRenderDerivedReturn {
  const overviewShippedOnly = useMemo((): Record<string, unknown>[] => {
    if (view !== "overview") return [];
    return filtered.filter((x) => getOverviewLaneId(x) === "shipped");
  }, [view, filtered]);

  const visibleCellsForItem = useCallback(
    (it: Record<string, unknown>): Record<string, unknown>[] => {
      const sourceRow = it?.sourceRowId != null ? String(it.sourceRowId) : String(it?.row || "");
      const cells = (it?.cells || []) as Record<string, unknown>[];
      return cells.filter((c) => {
        const cc = c as Record<string, unknown>;
        const qtyOk = (Number(cc.qty) || 0) > 0;
        if (!qtyOk) return false;
        const byWeek = weekFilter === "all" || String(cc.week || "") === weekFilter;
        if (!byWeek) return false;
        const stageKey = getShipmentStageKey(cc, sourceRow, shipmentOrderMaps, String(it.item || ""));
        return passesShipmentStageFilter(stageKey);
      }) as Record<string, unknown>[];
    },
    [weekFilter, shipmentOrderMaps, passesShipmentStageFilter],
  );

  const sortItemsForShipment = useCallback(
    (items: Record<string, unknown>[]): Record<string, unknown>[] => {
      const weekSortValue = (it: Record<string, unknown>): number => {
        const arr = visibleCellsForItem(it)
          .map((c) => Number(c.week))
          .filter((n) => Number.isFinite(n));
        if (!arr.length) return 9999;
        return Math.min(...arr);
      };
      const colorSortValue = (it: Record<string, unknown>): string => normText(String(it?.material || ""));
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

  const strapStockByMaterial = useMemo((): Record<string, number> => {
    const result: Record<string, number> = { "Черный": 0, "Белый": 0 };
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

  const shipmentRenderSections = useMemo((): Record<string, unknown>[] => {
    if (view !== "shipment") return [];

    let baseSections: Record<string, unknown>[] = [];

    if (shipmentSort === "name") {
      baseSections = [...filtered]
        .sort((a, b) => {
          const ka = sectionSortKey(String(a.name || ""), SHIPMENT_SECTION_ORDER);
          const kb = sectionSortKey(String(b.name || ""), SHIPMENT_SECTION_ORDER);
          if (ka !== kb) return ka - kb;
          return String(a.name || "").localeCompare(String(b.name || ""), "ru");
        })
        .map((section) => ({
          name: section.name,
          items: sortItemsForShipment((section.items || []) as Record<string, unknown>[]),
        }));
    } else {
      const groups: Record<string, Record<string, unknown> | Record<string, Record<string, unknown>>> = {};
      (filtered || []).forEach((section) => {
        ((section.items || []) as Record<string, unknown>[]).forEach((it) => {
          const visibleCells = visibleCellsForItem(it);
          if (!visibleCells.length) return;

          if (shipmentSort === "color") {
            const rawLabel = String(it.material || "Материал не указан").trim() || "Материал не указан";
            const groupKey = normalizeFurnitureKey(rawLabel) || "материал не указан";
            if (!(groups as Record<string, { title: string; items: Record<string, unknown>[] }>)[groupKey]) {
              (groups as Record<string, { title: string; items: Record<string, unknown>[] }>)[groupKey] = { title: rawLabel, items: [] };
            } else {
              (groups as Record<string, { title: string; items: Record<string, unknown>[] }>)[groupKey].title = pickPreferredGroupLabel(
                (groups as Record<string, { title: string; items: Record<string, unknown>[] }>)[groupKey].title,
                rawLabel,
              );
            }
            (groups as Record<string, { title: string; items: Record<string, unknown>[] }>)[groupKey].items.push({ ...it, cells: visibleCells });
            return;
          }

          visibleCells.forEach((cell) => {
            const wk = String(cell.week || "-").trim() || "-";
            const key = `Неделя ${wk}`;
            if (!(groups as Record<string, Record<string, Record<string, unknown>>>)[key]) (groups as Record<string, Record<string, Record<string, unknown>>>)[key] = {};
            const rowKey = String(it.row);
            if (!(groups as Record<string, Record<string, Record<string, unknown>>>)[key][rowKey]) {
              (groups as Record<string, Record<string, Record<string, unknown>>>)[key][rowKey] = { ...it, cells: [] };
            }
            ((groups as Record<string, Record<string, Record<string, unknown>>>)[key][rowKey].cells as Record<string, unknown>[]).push(cell);
          });
        });
      });

      if (shipmentSort === "color") {
        baseSections = Object.keys(groups)
          .sort((a, b) => a.localeCompare(b, "ru"))
          .map((groupKey) => ({
            name: (groups[groupKey] as { title: string }).title,
            items: sortItemsForShipment((groups[groupKey] as { items: Record<string, unknown>[] }).items),
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
            items: sortItemsForShipment(Object.values(groups[name] as Record<string, Record<string, unknown>>)),
          }));
      }
    }

    if (!strapItems.length) return baseSections;
    const strapRows = strapItems.map((x, idx) => {
      const size = parseStrapSize(String(x.name || ""));
      const stripsPerSheet = size ? Math.floor(STRAP_SHEET_HEIGHT / size.width) : 0;
      const perStrip = size ? Math.floor(STRAP_SHEET_WIDTH / size.length) : 0;
      const outputPerSheet = stripsPerSheet * perStrip;
      const qty = Number(x.qty || 0);
      const sheetsNeeded = outputPerSheet > 0 ? Math.ceil(qty / outputPerSheet) : 0;
      const material = resolveStrapMaterialByProduct(String(x.productName || ""));
      const availableSheets = Number(strapStockByMaterial[material] || 0);
      return {
        row: `strap-order:${idx}`,
        sourceRowId: `strap-order:${idx}`,
        item: strapNameToOrderItem(String(x.name || "")),
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
