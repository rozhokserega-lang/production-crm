import { useMemo } from "react";
import { getShipmentCellStatus, getShipmentCellStatusShort } from "../utils/shipmentUtils";

interface UseShipmentTableDataParams {
  view: string;
  rows: unknown[];
  shipmentBoard: Record<string, unknown>;
  shipmentSort: string;
  weekFilter: string;
  showAwaiting: boolean;
  showOnPilka: boolean;
  showOnKromka: boolean;
  showOnPras: boolean;
  showReadyAssembly: boolean;
  showAwaitShipment: boolean;
  showShipped: boolean;
  hiddenShipmentGroups: Record<string, boolean>;
  shipmentOrderMaps: Record<string, unknown>;
}

interface UseShipmentTableDataReturn {
  shipmentTableRows: unknown[];
  shipmentMaterialBalance: Record<string, number>;
  shipmentTableRowsWithStockStatus: unknown[];
  shipmentTableGroupNames: string[];
  visibleShipmentTableRows: unknown[];
  shipmentPlanDeficits: unknown[];
}

export function useShipmentTableData({
  view,
  rows,
  shipmentBoard,
  shipmentSort,
  weekFilter,
  showAwaiting,
  showOnPilka,
  showOnKromka,
  showOnPras,
  showReadyAssembly,
  showAwaitShipment,
  showShipped,
  hiddenShipmentGroups,
  shipmentOrderMaps,
}: UseShipmentTableDataParams): UseShipmentTableDataReturn {
  const shipmentTableRows = useMemo(() => {
    if (view !== "shipment") return [];
    const rowsFlat: unknown[] = [];
    const sections = (shipmentBoard.sections || []) as Record<string, unknown>[];
    sections.forEach((section) => {
      const sectionName = String(section.name || "");
      const items = (section.items || []) as Record<string, unknown>[];
      items.forEach((item) => {
        const cells = (item.cells || []) as Record<string, unknown>[];
        cells.forEach((cell) => {
          const week = String(cell.week || "");
          if (weekFilter !== "all" && week !== weekFilter) return;
          const status = getShipmentCellStatus(cell);
          const statusShort = getShipmentCellStatusShort(cell);
          rowsFlat.push({
            sectionName,
            itemName: item.item || "",
            week,
            status,
            statusShort,
            cell,
            orderId: cell.orderId || "",
            qty: cell.qty || 0,
            weight: cell.weight || 0,
            volume: cell.volume || 0,
            material: item.material || "",
            type: item.type || "",
          });
        });
      });
    });
    return rowsFlat;
  }, [view, shipmentBoard, weekFilter]);

  const shipmentMaterialBalance = useMemo(() => {
    const balance: Record<string, number> = {};
    (shipmentTableRows as Record<string, unknown>[]).forEach((row) => {
      const itemName = String(row.itemName || "").trim().toLowerCase();
      const qty = Number(row.qty || 0);
      if (itemName) {
        balance[itemName] = (balance[itemName] || 0) + qty;
      }
    });
    return balance;
  }, [shipmentTableRows]);

  const shipmentTableRowsWithStockStatus = useMemo(() => {
    return (shipmentTableRows as Record<string, unknown>[]).map((row) => {
      const itemName = String(row.itemName || "").trim().toLowerCase();
      const balance = shipmentMaterialBalance[itemName] || 0;
      const qty = Number(row.qty || 0);
      return { ...row, stockBalance: balance, hasStock: Number(balance) >= qty };
    });
  }, [shipmentTableRows, shipmentMaterialBalance]);

  const shipmentTableGroupNames = useMemo(() => {
    const names = new Set<string>();
    (shipmentTableRows as Record<string, unknown>[]).forEach((row) => {
      const sectionName = String(row.sectionName || "");
      if (sectionName) names.add(sectionName);
    });
    return [...names].sort((a, b) => a.localeCompare(b, "ru"));
  }, [shipmentTableRows]);

  const visibleShipmentTableRows = useMemo(() => {
    return (shipmentTableRows as Record<string, unknown>[]).filter((row) => {
      const sectionName = String(row.sectionName || "");
      if (hiddenShipmentGroups[sectionName]) return false;
      const status = String(row.status || "");
      if (!showAwaiting && status === "awaiting") return false;
      if (!showOnPilka && status === "on_pilka") return false;
      if (!showOnKromka && status === "on_kromka") return false;
      if (!showOnPras && status === "on_pras") return false;
      if (!showReadyAssembly && status === "ready_assembly") return false;
      if (!showAwaitShipment && status === "await_shipment") return false;
      if (!showShipped && status === "shipped") return false;
      return true;
    });
  }, [shipmentTableRows, hiddenShipmentGroups, showAwaiting, showOnPilka, showOnKromka, showOnPras, showReadyAssembly, showAwaitShipment, showShipped]);

  const shipmentPlanDeficits = useMemo(() => {
    return (shipmentTableRows as Record<string, unknown>[]).filter((row) => {
      const itemName = String(row.itemName || "").trim().toLowerCase();
      const balance = shipmentMaterialBalance[itemName] || 0;
      const qty = Number(row.qty || 0);
      return Number(balance) < qty;
    });
  }, [shipmentTableRows, shipmentMaterialBalance]);

  return {
    shipmentTableRows,
    shipmentMaterialBalance,
    shipmentTableRowsWithStockStatus,
    shipmentTableGroupNames,
    visibleShipmentTableRows,
    shipmentPlanDeficits,
  };
}
