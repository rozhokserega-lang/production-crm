import { createContext, useContext, useMemo } from "react";

const ShipmentContext = createContext(null);

/**
 * Провайдер отдаёт готовый value из useAppState (оркестратор).
 * Действия и derived-таблица не дублируются здесь.
 */
export function ShipmentProvider({ value, children }) {
  const ctx = useMemo(() => value, [value]);
  return (
    <ShipmentContext.Provider value={ctx}>
      {children}
    </ShipmentContext.Provider>
  );
}

export function useShipment() {
  const ctx = useContext(ShipmentContext);
  if (!ctx) throw new Error("useShipment must be used within ShipmentProvider");
  return ctx;
}
