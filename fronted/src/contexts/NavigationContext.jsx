import { createContext, useCallback, useContext, useMemo, useState } from "react";

const NavigationContext = createContext(null);

export function NavigationProvider({ children }) {
  const [view, setView] = useState("shipment");
  const [overviewSubView, setOverviewSubView] = useState("kanban");
  const [warehouseSubView, setWarehouseSubView] = useState("sheets");
  const [statsSort, setStatsSort] = useState("stage");
  const [orderDrawerId, setOrderDrawerId] = useState("");

  const navigateTo = useCallback((nextView) => {
    setView(nextView);
  }, []);

  const value = useMemo(
    () => ({
      view,
      setView,
      overviewSubView,
      setOverviewSubView,
      warehouseSubView,
      setWarehouseSubView,
      statsSort,
      setStatsSort,
      orderDrawerId,
      setOrderDrawerId,
      navigateTo,
    }),
    [
      view,
      overviewSubView,
      warehouseSubView,
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
