import { createContext, useContext, useState, type ReactNode } from "react";

interface WarehouseDataContextValue {
  warehouseRows: Record<string, unknown>[];
  setWarehouseRows: (value: Record<string, unknown>[]) => void;
  leftoversRows: Record<string, unknown>[];
  setLeftoversRows: (value: Record<string, unknown>[]) => void;
  leftoversHistoryRows: Record<string, unknown>[];
  setLeftoversHistoryRows: (value: Record<string, unknown>[]) => void;
  consumeHistoryRows: Record<string, unknown>[];
  setConsumeHistoryRows: (value: Record<string, unknown>[]) => void;
  pilkaDoneHistoryRows: Record<string, unknown>[];
  setPilkaDoneHistoryRows: (value: Record<string, unknown>[]) => void;
}

const WarehouseDataContext = createContext<WarehouseDataContextValue | null>(null);

export function WarehouseDataProvider({ children }: { children: ReactNode }) {
  const [warehouseRows, setWarehouseRows] = useState<Record<string, unknown>[]>([]);
  const [leftoversRows, setLeftoversRows] = useState<Record<string, unknown>[]>([]);
  const [leftoversHistoryRows, setLeftoversHistoryRows] = useState<Record<string, unknown>[]>([]);
  const [consumeHistoryRows, setConsumeHistoryRows] = useState<Record<string, unknown>[]>([]);
  const [pilkaDoneHistoryRows, setPilkaDoneHistoryRows] = useState<Record<string, unknown>[]>([]);

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

export function useWarehouseData(): WarehouseDataContextValue {
  const ctx = useContext(WarehouseDataContext);
  if (!ctx) throw new Error("useWarehouseData must be used within WarehouseDataProvider");
  return ctx;
}
