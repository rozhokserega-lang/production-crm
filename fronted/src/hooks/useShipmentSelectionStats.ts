import { useMemo } from "react";

interface UseShipmentSelectionStatsParams {
  selectedShipments: unknown[];
  shipmentTableRows: unknown[];
  shipmentTableRowsWithStockStatus: unknown[];
  shipmentMaterialBalance: Record<string, unknown>;
  shipmentPlanDeficits: unknown[];
}

interface SelectedShipmentSummary {
  total: number;
  totalQty: number;
  totalWeight: number;
  totalVolume: number;
  [key: string]: unknown;
}

interface UseShipmentSelectionStatsReturn {
  selectedShipmentSummary: SelectedShipmentSummary;
  sendableSelectedCount: number;
  selectedShipmentStockCheck: unknown[];
  strapCalculation: unknown[];
}

export function useShipmentSelectionStats({
  selectedShipments,
  shipmentTableRows,
  shipmentTableRowsWithStockStatus,
  shipmentMaterialBalance,
  shipmentPlanDeficits,
}: UseShipmentSelectionStatsParams): UseShipmentSelectionStatsReturn {
  const selectedShipmentSummary = useMemo(() => {
    const total = selectedShipments.length;
    let totalQty = 0;
    let totalWeight = 0;
    let totalVolume = 0;
    selectedShipments.forEach((sel) => {
      const s = sel as Record<string, unknown>;
      totalQty += Number(s.qty || s.quantity || 0);
      totalWeight += Number(s.weight || 0);
      totalVolume += Number(s.volume || 0);
    });
    return { total, totalQty, totalWeight, totalVolume };
  }, [selectedShipments]);

  const sendableSelectedCount = useMemo(() => {
    return selectedShipments.filter((sel) => {
      const s = sel as Record<string, unknown>;
      return s.sendable !== false;
    }).length;
  }, [selectedShipments]);

  const selectedShipmentStockCheck = useMemo(() => {
    return selectedShipments.map((sel) => {
      const s = sel as Record<string, unknown>;
      const itemName = String(s.item || s.itemName || "").trim().toLowerCase();
      const balance = shipmentMaterialBalance[itemName] || 0;
      const qty = Number(s.qty || s.quantity || 0);
      return { ...(s as Record<string, unknown>), stockBalance: balance, hasStock: Number(balance) >= qty };
    });
  }, [selectedShipments, shipmentMaterialBalance]);

  const strapCalculation = useMemo(() => {
    return selectedShipments
      .filter((sel) => {
        const s = sel as Record<string, unknown>;
        return String(s.type || "").toLowerCase() === "strap";
      })
      .map((sel) => {
        const s = sel as Record<string, unknown>;
        return {
          itemName: s.item || s.itemName,
          qty: Number(s.qty || s.quantity || 0),
          weight: Number(s.weight || 0),
        };
      });
  }, [selectedShipments]);

  return {
    selectedShipmentSummary,
    sendableSelectedCount,
    selectedShipmentStockCheck,
    strapCalculation,
  };
}
