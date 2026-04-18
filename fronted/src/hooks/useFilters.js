import { useState, useMemo } from 'react';

export function useFilters(initialFilters = {}) {
  const [filters, setFilters] = useState({
    weekFilter: 'all',
    query: '',
    statusFilter: 'all',
    showBlueCells: false,
    showYellowCells: false,
    ...initialFilters
  });

  const updateFilter = useCallback((key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      weekFilter: 'all',
      query: '',
      statusFilter: 'all',
      showBlueCells: false,
      showYellowCells: false,
      ...initialFilters
    });
  }, [initialFilters]);

  const activeFiltersCount = useMemo(() => {
    return Object.entries(filters).filter(([key, value]) => {
      if (key === 'weekFilter' && value === 'all') return false;
      if (key === 'statusFilter' && value === 'all') return false;
      if (key === 'query' && !value.trim()) return false;
      return true;
    }).length;
  }, [filters]);

  return {
    filters,
    updateFilter,
    resetFilters,
    activeFiltersCount,
    hasActiveFilters: activeFiltersCount > 0
  };
}

export function useShipmentFilters() {
  const [shipmentViewMode, setShipmentViewMode] = useState('board');
  const [hiddenShipmentGroups, setHiddenShipmentGroups] = useState(new Set());

  const toggleGroupVisibility = useCallback((groupName) => {
    setHiddenShipmentGroups(prev => {
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
    toggleGroupVisibility
  };
}
