import { createContext, useContext, useMemo } from "react";
import { useCuttingState } from "../hooks/useCuttingState";

const CuttingContext = createContext(null);

export function CuttingProvider({ children }) {
  const state = useCuttingState();
  const ctx = useMemo(() => state, [state]);
  return (
    <CuttingContext.Provider value={ctx}>
      {children}
    </CuttingContext.Provider>
  );
}

export function useCutting() {
  const ctx = useContext(CuttingContext);
  if (!ctx) throw new Error("useCutting must be used within CuttingProvider");
  return ctx;
}
