import { useEffect, useState } from "react";

export function useShipmentUiState(defaultPrefs) {
  const [selectedShipments, setSelectedShipments] = useState([]);
  const [planPreviews, setPlanPreviews] = useState([]);
  const [hoverTip, setHoverTip] = useState({ visible: false, text: "", x: 0, y: 0 });
  const [weekFilter, setWeekFilter] = useState(defaultPrefs.weekFilter);
  const [showAwaiting, setShowAwaiting] = useState(defaultPrefs.showAwaiting);
  const [showOnPilka, setShowOnPilka] = useState(defaultPrefs.showOnPilka);
  const [showOnKromka, setShowOnKromka] = useState(defaultPrefs.showOnKromka);
  const [showOnPras, setShowOnPras] = useState(defaultPrefs.showOnPras);
  const [showReadyAssembly, setShowReadyAssembly] = useState(defaultPrefs.showReadyAssembly);
  const [showAwaitShipment, setShowAwaitShipment] = useState(defaultPrefs.showAwaitShipment);
  const [showShipped, setShowShipped] = useState(defaultPrefs.showShipped);
  const [hiddenShipmentGroups, setHiddenShipmentGroups] = useState({});
  const [shipmentSort, setShipmentSort] = useState(defaultPrefs.shipmentSort);
  const [shipmentViewMode, setShipmentViewMode] = useState("table");
  const [collapsedSections, setCollapsedSections] = useState(defaultPrefs.collapsedSections);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("shipmentUiPrefs");
      if (!raw) return;
      const prefs = JSON.parse(raw);
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
          setCollapsedSections(prefs.collapsedSections);
        }
      }
    } catch (_) {}
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
    } catch (_) {}
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

  function sectionCollapseKey(name) {
    return `${shipmentSort}:${String(name || "")}`;
  }

  function isSectionCollapsed(name) {
    return !!collapsedSections[sectionCollapseKey(name)];
  }

  function toggleSectionCollapsed(name) {
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
