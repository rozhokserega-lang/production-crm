import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  readInitialViewFromStorage,
  readViewFromPathname,
  syncBrowserPathForView,
} from "../app/crmPathRoutes";

const NavigationContext = createContext(null);

const WORK_DOMAIN_STORAGE_KEY = "crm_work_domain_v1";

function resolveWorkDomain(view) {
  if (view === "metalProcess") return "metal";
  if (view === "warehouseMissing") return "warehouse";
  return "furniture";
}

function readInitialView() {
  if (typeof window === "undefined") return "shipment";
  const fromPath = readViewFromPathname(window.location.pathname);
  if (fromPath) return fromPath;
  return readInitialViewFromStorage();
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
    setViewRaw((prev) => {
      const resolved = typeof nextView === "function" ? nextView(prev) : nextView;
      persistWorkDomain(resolved);
      syncBrowserPathForView(resolved);
      return resolved;
    });
  }, []);

  useEffect(() => {
    syncBrowserPathForView(view, { replace: true });
  }, []);

  useEffect(() => {
    function onPopState() {
      const fromPath = readViewFromPathname(window.location.pathname);
      if (fromPath) {
        setViewRaw(fromPath);
        persistWorkDomain(fromPath);
        return;
      }
      const fallback = "shipment";
      setViewRaw(fallback);
      persistWorkDomain(fallback);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
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
