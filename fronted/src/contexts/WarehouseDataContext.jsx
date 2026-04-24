import { createContext, useContext, useState } from "react";

const WarehouseDataContext = createContext(null);

export function WarehouseDataProvider({ children }) {
  const [warehouseRows, setWarehouseRows] = useState([]);
  const [leftoversRows, setLeftoversRows] = useState([]);
  const [leftoversHistoryRows, setLeftoversHistoryRows] = useState([]);
  const [consumeHistoryRows, setConsumeHistoryRows] = useState([]);
  const [pilkaDoneHistoryRows, setPilkaDoneHistoryRows] = useState([]);

  return (
    <WarehouseDataContext.Provider
      value={{
        warehouseRows,
        setWarehouseRows,
        leftoversRows,
        setLeftoversRows,
        leftoversHistoryRows,
        setLeftoversHistoryRows,
        consumeHistoryRows,
        setConsumeHistoryRows,
        pilkaDoneHistoryRows,
        setPilkaDoneHistoryRows,
      }}
    >
      {children}
    </WarehouseDataContext.Provider>
  );
}

export function useWarehouseData() {
  const ctx = useContext(WarehouseDataContext);
  if (!ctx) throw new Error("useWarehouseData must be used within WarehouseDataProvider");
  return ctx;
}
