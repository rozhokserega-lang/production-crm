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

/**
 * Общие фильтры для списков заказов.
 * @param {Object} initialFilters — начальные значения фильтров
 */
export function useFilters(initialFilters = {}) {
  const [filters, setFilters] = useState({
    weekFilter: "all",
    query: "",
    statusFilter: "all",
    showBlueCells: false,
    showYellowCells: false,
    ...initialFilters,
  });

  const updateFilter = useCallback((key, value) => {
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
      if (key === "query" && !value.trim()) return false;
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

/**
 * Фильтры для представления отгрузки (shipment).
 */
export function useShipmentFilters() {
  const [shipmentViewMode, setShipmentViewMode] = useState("board");
  const [hiddenShipmentGroups, setHiddenShipmentGroups] = useState(new Set());

  const toggleGroupVisibility = useCallback((groupName) => {
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

// Ре-экспорт фильтров из useOrders.js для удобства импорта
export {
  useBaseOrderFilter,
  useLaborFilter,
  useSheetMirrorFilter,
  useShipmentFilter,
} from "./useOrders";
