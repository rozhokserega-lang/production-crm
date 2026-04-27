import { useEffect, useState } from "react";

interface HoverTip {
  visible: boolean;
  text: string;
  x: number;
  y: number;
}

interface CollapsedSections {
  [key: string]: boolean;
}

interface ShipmentUiPrefs {
  weekFilter: string;
  shipmentSort: string;
  showAwaiting: boolean;
  showOnPilka: boolean;
  showOnKromka: boolean;
  showOnPras: boolean;
  showReadyAssembly: boolean;
  showAwaitShipment: boolean;
  showShipped: boolean;
  collapsedSections: CollapsedSections;
}

interface UseShipmentUiStateReturn {
  selectedShipments: unknown[];
  setSelectedShipments: (v: unknown[]) => void;
  planPreviews: unknown[];
  setPlanPreviews: (v: unknown[]) => void;
  hoverTip: HoverTip;
  setHoverTip: (v: HoverTip | ((prev: HoverTip) => HoverTip)) => void;
  weekFilter: string;
  setWeekFilter: (v: string) => void;
  showAwaiting: boolean;
  setShowAwaiting: (v: boolean) => void;
  showOnPilka: boolean;
  setShowOnPilka: (v: boolean) => void;
  showOnKromka: boolean;
  setShowOnKromka: (v: boolean) => void;
  showOnPras: boolean;
  setShowOnPras: (v: boolean) => void;
  showReadyAssembly: boolean;
  setShowReadyAssembly: (v: boolean) => void;
  showAwaitShipment: boolean;
  setShowAwaitShipment: (v: boolean) => void;
  showShipped: boolean;
  setShowShipped: (v: boolean) => void;
  hiddenShipmentGroups: Record<string, boolean>;
  setHiddenShipmentGroups: (v: Record<string, boolean>) => void;
  shipmentSort: string;
  setShipmentSort: (v: string) => void;
  shipmentViewMode: string;
  setShipmentViewMode: (v: string) => void;
  collapsedSections: CollapsedSections;
  resetShipmentFilters: () => void;
  isSectionCollapsed: (name: string) => boolean;
  toggleSectionCollapsed: (name: string) => void;
}

export function useShipmentUiState(defaultPrefs: ShipmentUiPrefs): UseShipmentUiStateReturn {
  const [selectedShipments, setSelectedShipments] = useState<unknown[]>([]);
  const [planPreviews, setPlanPreviews] = useState<unknown[]>([]);
  const [hoverTip, setHoverTip] = useState<HoverTip>({ visible: false, text: "", x: 0, y: 0 });
  const [weekFilter, setWeekFilter] = useState(defaultPrefs.weekFilter);
  const [showAwaiting, setShowAwaiting] = useState(defaultPrefs.showAwaiting);
  const [showOnPilka, setShowOnPilka] = useState(defaultPrefs.showOnPilka);
  const [showOnKromka, setShowOnKromka] = useState(defaultPrefs.showOnKromka);
  const [showOnPras, setShowOnPras] = useState(defaultPrefs.showOnPras);
  const [showReadyAssembly, setShowReadyAssembly] = useState(defaultPrefs.showReadyAssembly);
  const [showAwaitShipment, setShowAwaitShipment] = useState(defaultPrefs.showAwaitShipment);
  const [showShipped, setShowShipped] = useState(defaultPrefs.showShipped);
  const [hiddenShipmentGroups, setHiddenShipmentGroups] = useState<Record<string, boolean>>({});
  const [shipmentSort, setShipmentSort] = useState(defaultPrefs.shipmentSort);
  const [shipmentViewMode, setShipmentViewMode] = useState("table");
  const [collapsedSections, setCollapsedSections] = useState<CollapsedSections>(
    defaultPrefs.collapsedSections,
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem("shipmentUiPrefs");
      if (!raw) return;
      const prefs = JSON.parse(raw) as Record<string, unknown>;
      if (prefs && typeof prefs === "object") {
        if (typeof prefs.weekFilter === "string") setWeekFilter(prefs.weekFilter);
        if (typeof prefs.shipmentSort === "string") setShipmentSort(prefs.shipmentSort);
        if (typeof prefs.showAwaiting === "boolean") setShowAwaiting(prefs.showAwaiting);
        if (typeof prefs.showOnPilka === "boolean") setShowOnPilka(prefs.showOnPilka);
        if (typeof prefs.showOnKromka === "boolean") setShowOnKromka(prefs.showOnKromka);
        if (typeof prefs.showOnPras === "boolean") setShowOnPras(prefs.showOnPras);
        if (typeof prefs.showReadyAssembly === "boolean") setShowReadyAssembly(prefs.showReadyAssembly);
        if (typeof prefs.showAwaitShipment === "boolean") setShowAwaitShipment(prefs.showAwaitShipment);
        if (typeof prefs.showShipped === "boolean") setShowShipped(prefs.showShipped);
        if (typeof prefs.showOnlyEmpty === "boolean") setShowAwaiting(prefs.showOnlyEmpty);
        if (typeof prefs.showCompletedRedCells === "boolean") setShowShipped(prefs.showCompletedRedCells);
        if (prefs.collapsedSections && typeof prefs.collapsedSections === "object") {
          setCollapsedSections(prefs.collapsedSections as CollapsedSections);
        }
      }
    } catch (_) {
      // ignore parse errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "shipmentUiPrefs",
        JSON.stringify({
          weekFilter,
          shipmentSort,
          showAwaiting,
          showOnPilka,
          showOnKromka,
          showOnPras,
          showReadyAssembly,
          showAwaitShipment,
          showShipped,
          collapsedSections,
        }),
      );
    } catch (_) {
      // ignore storage errors
    }
  }, [
    weekFilter,
    shipmentSort,
    showAwaiting,
    showOnPilka,
    showOnKromka,
    showOnPras,
    showReadyAssembly,
    showAwaitShipment,
    showShipped,
    collapsedSections,
  ]);

  function resetShipmentFilters() {
    setWeekFilter(defaultPrefs.weekFilter);
    setShipmentSort(defaultPrefs.shipmentSort);
    setShowAwaiting(defaultPrefs.showAwaiting);
    setShowOnPilka(defaultPrefs.showOnPilka);
    setShowOnKromka(defaultPrefs.showOnKromka);
    setShowOnPras(defaultPrefs.showOnPras);
    setShowReadyAssembly(defaultPrefs.showReadyAssembly);
    setShowAwaitShipment(defaultPrefs.showAwaitShipment);
    setShowShipped(defaultPrefs.showShipped);
    setHiddenShipmentGroups({});
    setCollapsedSections(defaultPrefs.collapsedSections);
  }

  function sectionCollapseKey(name: string): string {
    return `${shipmentSort}:${String(name || "")}`;
  }

  function isSectionCollapsed(name: string): boolean {
    return !!collapsedSections[sectionCollapseKey(name)];
  }

  function toggleSectionCollapsed(name: string): void {
    const key = sectionCollapseKey(name);
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return {
    selectedShipments,
    setSelectedShipments,
    planPreviews,
    setPlanPreviews,
    hoverTip,
    setHoverTip,
    weekFilter,
    setWeekFilter,
    showAwaiting,
    setShowAwaiting,
    showOnPilka,
    setShowOnPilka,
    showOnKromka,
    setShowOnKromka,
    showOnPras,
    setShowOnPras,
    showReadyAssembly,
    setShowReadyAssembly,
    showAwaitShipment,
    setShowAwaitShipment,
    showShipped,
    setShowShipped,
    hiddenShipmentGroups,
    setHiddenShipmentGroups,
    shipmentSort,
    setShipmentSort,
    shipmentViewMode,
    setShipmentViewMode,
    collapsedSections,
    resetShipmentFilters,
    isSectionCollapsed,
    toggleSectionCollapsed,
  };
}
