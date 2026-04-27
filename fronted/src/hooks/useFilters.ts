/**
 * Единая точка входа для всех фильтров.
 *
 * Ре-экспортирует фильтры из специализированных хуков, чтобы App.jsx
 * мог импортировать всё из одного места.
 *
 * Фильтры разделены по доменам:
 * - useFilters — общие фильтры (query, weekFilter, statusFilter, цвета)
 * - useShipmentFilters — фильтры отгрузки (viewMode, hiddenGroups)
 * - Остальные фильтры живут в useOrders.js (useBaseOrderFilter, useLaborFilter,
 *   useSheetMirrorFilter, useShipmentFilter) и useShipmentUiState.js
 */

import { useState, useMemo, useCallback } from "react";

interface FiltersState {
  weekFilter: string;
  query: string;
  statusFilter: string;
  showBlueCells: boolean;
  showYellowCells: boolean;
  [key: string]: unknown;
}

interface UseFiltersReturn {
  filters: FiltersState;
  updateFilter: (key: string, value: unknown) => void;
  resetFilters: () => void;
  activeFiltersCount: number;
  hasActiveFilters: boolean;
}

/**
 * Общие фильтры для списков заказов.
 */
export function useFilters(initialFilters: Partial<FiltersState> = {}): UseFiltersReturn {
  const [filters, setFilters] = useState<FiltersState>({
    weekFilter: "all",
    query: "",
    statusFilter: "all",
    showBlueCells: false,
    showYellowCells: false,
    ...initialFilters,
  });

  const updateFilter = useCallback((key: string, value: unknown) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      weekFilter: "all",
      query: "",
      statusFilter: "all",
      showBlueCells: false,
      showYellowCells: false,
      ...initialFilters,
    });
  }, [initialFilters]);

  const activeFiltersCount = useMemo(() => {
    return Object.entries(filters).filter(([key, value]) => {
      if (key === "weekFilter" && value === "all") return false;
      if (key === "statusFilter" && value === "all") return false;
      if (key === "query" && typeof value === "string" && !value.trim()) return false;
      if (value === false) return false;
      return true;
    }).length;
  }, [filters]);

  return {
    filters,
    updateFilter,
    resetFilters,
    activeFiltersCount,
    hasActiveFilters: activeFiltersCount > 0,
  };
}

interface UseShipmentFiltersReturn {
  shipmentViewMode: string;
  setShipmentViewMode: (v: string) => void;
  hiddenShipmentGroups: Set<string>;
  toggleGroupVisibility: (groupName: string) => void;
}

/**
 * Фильтры для представления отгрузки (shipment).
 */
export function useShipmentFilters(): UseShipmentFiltersReturn {
  const [shipmentViewMode, setShipmentViewMode] = useState("board");
  const [hiddenShipmentGroups, setHiddenShipmentGroups] = useState(new Set<string>());

  const toggleGroupVisibility = useCallback((groupName: string) => {
    setHiddenShipmentGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupName)) {
        newSet.delete(groupName);
      } else {
        newSet.add(groupName);
      }
      return newSet;
    });
  }, []);

  return {
    shipmentViewMode,
    setShipmentViewMode,
    hiddenShipmentGroups,
    toggleGroupVisibility,
  };
}

// Ре-экспорт фильтров из useOrders.ts для удобства импорта
export {
  useBaseOrderFilter,
  useLaborFilter,
  useSheetMirrorFilter,
  useShipmentFilter,
} from "./useOrders";
