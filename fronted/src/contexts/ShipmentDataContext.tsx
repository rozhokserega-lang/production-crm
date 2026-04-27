import { createContext, useContext, useState, type ReactNode } from "react";

interface ShipmentDataContextValue {
  shipmentBoard: Record<string, unknown>;
  setShipmentBoard: (value: Record<string, unknown>) => void;
  planCatalogRows: Record<string, unknown>[];
  setPlanCatalogRows: (value: Record<string, unknown>[]) => void;
  sectionCatalogRows: Record<string, unknown>[];
  setSectionCatalogRows: (value: Record<string, unknown>[]) => void;
  sectionArticleRows: Record<string, unknown>[];
  setSectionArticleRows: (value: Record<string, unknown>[]) => void;
  shipmentOrders: Record<string, unknown>[];
  setShipmentOrders: (value: Record<string, unknown>[]) => void;
  materialsStockRows: Record<string, unknown>[];
  setMaterialsStockRows: (value: Record<string, unknown>[]) => void;
}

const ShipmentDataContext = createContext<ShipmentDataContextValue | null>(null);

export function ShipmentDataProvider({ children }: { children: ReactNode }) {
  const [shipmentBoard, setShipmentBoard] = useState<Record<string, unknown>>({ sections: [] });
  const [planCatalogRows, setPlanCatalogRows] = useState<Record<string, unknown>[]>([]);
  const [sectionCatalogRows, setSectionCatalogRows] = useState<Record<string, unknown>[]>([]);
  const [sectionArticleRows, setSectionArticleRows] = useState<Record<string, unknown>[]>([]);
  const [shipmentOrders, setShipmentOrders] = useState<Record<string, unknown>[]>([]);
  const [materialsStockRows, setMaterialsStockRows] = useState<Record<string, unknown>[]>([]);

  return (
    <ShipmentDataContext.Provider
      value={{
        shipmentBoard,
        setShipmentBoard,
        planCatalogRows,
        setPlanCatalogRows,
        sectionCatalogRows,
        setSectionCatalogRows,
        sectionArticleRows,
        setSectionArticleRows,
        shipmentOrders,
        setShipmentOrders,
        materialsStockRows,
        setMaterialsStockRows,
      }}
    >
      {children}
    </ShipmentDataContext.Provider>
  );
}

export function useShipmentData(): ShipmentDataContextValue {
  const ctx = useContext(ShipmentDataContext);
  if (!ctx) throw new Error("useShipmentData must be used within ShipmentDataProvider");
  return ctx;
}
