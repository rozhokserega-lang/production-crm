import { createContext, useContext, useState } from "react";

const ShipmentDataContext = createContext(null);

export function ShipmentDataProvider({ children }) {
  const [shipmentBoard, setShipmentBoard] = useState({ sections: [] });
  const [planCatalogRows, setPlanCatalogRows] = useState([]);
  const [sectionCatalogRows, setSectionCatalogRows] = useState([]);
  const [sectionArticleRows, setSectionArticleRows] = useState([]);
  const [shipmentOrders, setShipmentOrders] = useState([]);
  const [materialsStockRows, setMaterialsStockRows] = useState([]);

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

export function useShipmentData() {
  const ctx = useContext(ShipmentDataContext);
  if (!ctx) throw new Error("useShipmentData must be used within ShipmentDataProvider");
  return ctx;
}
