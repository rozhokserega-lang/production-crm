import { useState, useMemo, useCallback, useEffect } from "react";
import { callBackend } from "../api";
import { OrderService } from "../services/orderService";

// ─── useOrders ───────────────────────────────────────────────────────────────

interface UseOrdersParams {
  rows: unknown[];
  view: string;
}

interface UseOrdersReturn {
  orders: unknown[];
  setOrders: (v: unknown[]) => void;
}

export function useOrders({ rows, view }: UseOrdersParams): UseOrdersReturn {
  const [orders, setOrders] = useState<unknown[]>([]);

  useEffect(() => {
    if (view === "shipment") {
      setOrders([]);
      return;
    }
    setOrders(rows || []);
  }, [rows, view]);

  return { orders, setOrders };
}

// ─── useWorkshopRows ─────────────────────────────────────────────────────────

interface UseWorkshopRowsParams {
  rows: unknown[];
  view: string;
  orders: unknown[];
}

interface UseWorkshopRowsReturn {
  workshopRows: unknown[];
}

export function useWorkshopRows({
  rows,
  view,
  orders,
}: UseWorkshopRowsParams): UseWorkshopRowsReturn {
  const workshopRows = useMemo(() => {
    if (view !== "workshop") return [];
    const source = orders.length > 0 ? orders : rows;
    return source.filter((o) => {
      const order = o as Record<string, unknown>;
      const stage = String(order.pipeline_stage || order.pipelineStage || "").toLowerCase();
      return stage === "pilka" || stage === "kromka" || stage === "pras";
    });
  }, [view, orders, rows]);

  return { workshopRows };
}

// ─── useBaseOrderFilter ──────────────────────────────────────────────────────

interface UseBaseOrderFilterParams {
  view: string;
  rows: unknown[];
  query: string;
  weekFilter: string;
  statusFilter: string;
  showBlueCells: boolean;
  showYellowCells: boolean;
}

interface UseBaseOrderFilterReturn {
  filtered: unknown[];
}

export function useBaseOrderFilter({
  view,
  rows,
  query,
  weekFilter,
  statusFilter,
  showBlueCells,
  showYellowCells,
}: UseBaseOrderFilterParams): UseBaseOrderFilterReturn {
  const filtered = useMemo(() => {
    if (view === "shipment") return rows;
    const q = String(query || "").trim().toLowerCase();
    return (rows || []).filter((r) => {
      const row = r as Record<string, unknown>;
      if (weekFilter !== "all") {
        const week = String(row.week || row.week_number || "").trim();
        if (week !== weekFilter) return false;
      }
      if (statusFilter !== "all") {
        const status = String(row.status || row.stage_status || "").toLowerCase();
        if (status !== statusFilter.toLowerCase()) return false;
      }
      if (q) {
        const searchText = [
          String(row.id || ""),
          String(row.order_id || ""),
          String(row.item || row.item_name || ""),
          String(row.material || ""),
          String(row.article || ""),
        ]
          .join(" ")
          .toLowerCase();
        if (!searchText.includes(q)) return false;
      }
      return true;
    });
  }, [view, rows, query, weekFilter, statusFilter, showBlueCells, showYellowCells]);

  return { filtered };
}

// ─── useLaborFilter ──────────────────────────────────────────────────────────

interface UseLaborFilterParams {
  view: string;
  filtered: unknown[];
  laborSubView: string;
}

interface UseLaborFilterReturn {
  filtered: unknown[];
}

export function useLaborFilter({
  view,
  filtered,
  laborSubView,
}: UseLaborFilterParams): UseLaborFilterReturn {
  const result = useMemo(() => {
    if (view !== "labor") return filtered;
    if (laborSubView === "total") return filtered;
    return (filtered || []).filter((r) => {
      const row = r as Record<string, unknown>;
      const stage = String(row.pipeline_stage || row.pipelineStage || "").toLowerCase();
      return stage === laborSubView.toLowerCase();
    });
  }, [view, filtered, laborSubView]);

  return { filtered: result };
}

// ─── useSheetMirrorFilter ────────────────────────────────────────────────────

interface UseSheetMirrorFilterParams {
  view: string;
  filtered: unknown[];
}

interface UseSheetMirrorFilterReturn {
  filtered: unknown[];
}

export function useSheetMirrorFilter({
  view,
  filtered,
}: UseSheetMirrorFilterParams): UseSheetMirrorFilterReturn {
  const result = useMemo(() => {
    if (view !== "sheet-mirror") return filtered;
    return (filtered || []).filter((r) => {
      const row = r as Record<string, unknown>;
      return String(row.source || "").toLowerCase() === "sheet";
    });
  }, [view, filtered]);

  return { filtered: result };
}

// ─── Domain data loaders ─────────────────────────────────────────────────────

interface LoadDomainDataParams {
  view: string;
  callBackend: typeof callBackend;
}

export async function loadOrdersDomainData({
  view,
  callBackend: backendCall,
}: LoadDomainDataParams): Promise<Record<string, unknown>> {
  if (view === "shipment") {
    const [orders, board] = await Promise.all([
      OrderService.getAllOrders(),
      OrderService.getShipmentBoard(),
    ]);
    return { orders, board };
  }
  const orders = await OrderService.getAllOrders();
  return { orders };
}

export async function loadShipmentDomainData({
  view,
  callBackend: backendCall,
}: LoadDomainDataParams): Promise<Record<string, unknown>> {
  if (view !== "shipment") return {};
  const data = await OrderService.loadShipmentDomainData();
  return data as Record<string, unknown>;
}

export async function loadWarehouseDomainData({
  view,
  callBackend: backendCall,
}: LoadDomainDataParams): Promise<Record<string, unknown>> {
  if (view !== "warehouse") return {};
  const data = await OrderService.loadWarehouseDomainData();
  return data as Record<string, unknown>;
}

export async function loadFurnitureDomainData({
  view,
  callBackend: backendCall,
}: LoadDomainDataParams): Promise<Record<string, unknown>> {
  if (view !== "furniture") return {};
  const data = await OrderService.loadFurnitureDomainData();
  return data as Record<string, unknown>;
}

// ─── useShipmentFilter ───────────────────────────────────────────────────────

interface UseShipmentFilterParams {
  view: string;
  rows: unknown[];
  weekFilter: string;
  showAwaiting: boolean;
  showOnPilka: boolean;
  showOnKromka: boolean;
  showOnPras: boolean;
  showReadyAssembly: boolean;
  showAwaitShipment: boolean;
  showShipped: boolean;
  hiddenShipmentGroups: Record<string, boolean>;
}

interface UseShipmentFilterReturn {
  filtered: unknown[];
}

export function useShipmentFilter({
  view,
  rows,
  weekFilter,
  showAwaiting,
  showOnPilka,
  showOnKromka,
  showOnPras,
  showReadyAssembly,
  showAwaitShipment,
  showShipped,
  hiddenShipmentGroups,
}: UseShipmentFilterParams): UseShipmentFilterReturn {
  const filtered = useMemo(() => {
    if (view !== "shipment") return rows;
    return (rows || []).filter((r) => {
      const row = r as Record<string, unknown>;
      if (weekFilter !== "all") {
        const week = String(row.week || "").trim();
        if (week !== weekFilter) return false;
      }
      const sectionName = String(row.section_name || row.sectionName || "");
      if (hiddenShipmentGroups[sectionName]) return false;
      const stage = String(row.pipeline_stage || row.pipelineStage || "").toLowerCase();
      if (!showAwaiting && stage === "awaiting") return false;
      if (!showOnPilka && stage === "pilka") return false;
      if (!showOnKromka && stage === "kromka") return false;
      if (!showOnPras && stage === "pras") return false;
      if (!showReadyAssembly && stage === "ready_assembly") return false;
      if (!showAwaitShipment && stage === "await_shipment") return false;
      if (!showShipped && stage === "shipped") return false;
      return true;
    });
  }, [
    view,
    rows,
    weekFilter,
    showAwaiting,
    showOnPilka,
    showOnKromka,
    showOnPras,
    showReadyAssembly,
    showAwaitShipment,
    showShipped,
    hiddenShipmentGroups,
  ]);

  return { filtered };
}
