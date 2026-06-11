import { createContext, useCallback, useContext, useMemo, useState } from "react";

const NavigationContext = createContext(null);

const WORK_DOMAIN_STORAGE_KEY = "crm_work_domain_v1";

function resolveWorkDomain(view) {
  if (view === "metalProcess") return "metal";
  if (view === "warehouseMissing") return "warehouse";
  return "furniture";
}

function readInitialView() {
  if (typeof window === "undefined") return "shipment";
  try {
    const domain = window.localStorage.getItem(WORK_DOMAIN_STORAGE_KEY);
    if (domain === "metal") return "metalProcess";
    if (domain === "warehouse") return "warehouseMissing";
  } catch (_) {
    // ignore storage errors
  }
  return "shipment";
}

function persistWorkDomain(view) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORK_DOMAIN_STORAGE_KEY, resolveWorkDomain(view));
  } catch (_) {
    // ignore storage errors
  }
}

export function NavigationProvider({ children }) {
  const [view, setViewRaw] = useState(readInitialView);
  const [overviewSubView, setOverviewSubView] = useState("kanban");
  const [warehouseSubView, setWarehouseSubView] = useState("sheets");
  const [warehouseMissingMainTab, setWarehouseMissingMainTab] = useState("create");
  const [statsSort, setStatsSort] = useState("stage");
  const [orderDrawerId, setOrderDrawerId] = useState("");

  const setView = useCallback((nextView) => {
    setViewRaw(nextView);
    persistWorkDomain(nextView);
  }, []);

  const navigateTo = useCallback((nextView) => {
    setView(nextView);
  }, [setView]);

  const value = useMemo(
    () => ({
      view,
      setView,
      overviewSubView,
      setOverviewSubView,
      warehouseSubView,
      setWarehouseSubView,
      warehouseMissingMainTab,
      setWarehouseMissingMainTab,
      statsSort,
      setStatsSort,
      orderDrawerId,
      setOrderDrawerId,
      navigateTo,
    }),
    [
      view,
      setView,
      overviewSubView,
      warehouseSubView,
      warehouseMissingMainTab,
      statsSort,
      orderDrawerId,
      navigateTo,
    ],
  );

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within NavigationProvider");
  return ctx;
}
