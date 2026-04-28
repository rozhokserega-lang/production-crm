import { createContext, useContext, useState } from "react";

const FurnitureDataContext = createContext(null);

export function FurnitureDataProvider({ children }) {
  const [furnitureLoading, setFurnitureLoading] = useState(false);
  const [furnitureError, setFurnitureError] = useState("");
  const [furnitureWorkbook, setFurnitureWorkbook] = useState(null);
  const [furnitureActiveSheet, setFurnitureActiveSheet] = useState("");
  const [furnitureShowFormulas, setFurnitureShowFormulas] = useState(false);
  const [furnitureArticleRows, setFurnitureArticleRows] = useState([]);
  const [furnitureDetailArticleRows, setFurnitureDetailArticleRows] = useState([]);
  const [furnitureCustomTemplates, setFurnitureCustomTemplates] = useState([]);
  const [furnitureSelectedProduct, setFurnitureSelectedProduct] = useState("");
  const [furnitureSelectedQty, setFurnitureSelectedQty] = useState("1");

  return (
    <FurnitureDataContext.Provider
      value={{
        furnitureLoading,
        setFurnitureLoading,
        furnitureError,
        setFurnitureError,
        furnitureWorkbook,
        setFurnitureWorkbook,
        furnitureActiveSheet,
        setFurnitureActiveSheet,
        furnitureShowFormulas,
        setFurnitureShowFormulas,
        furnitureArticleRows,
        setFurnitureArticleRows,
        furnitureDetailArticleRows,
        setFurnitureDetailArticleRows,
        furnitureCustomTemplates,
        setFurnitureCustomTemplates,
        furnitureSelectedProduct,
        setFurnitureSelectedProduct,
        furnitureSelectedQty,
        setFurnitureSelectedQty,
      }}
    >
      {children}
    </FurnitureDataContext.Provider>
  );
}

export function useFurnitureData() {
  const ctx = useContext(FurnitureDataContext);
  if (!ctx) throw new Error("useFurnitureData must be used within FurnitureDataProvider");
  return ctx;
}
