import { createContext, useContext, useState, type ReactNode } from "react";

interface FurnitureDataContextValue {
  furnitureLoading: boolean;
  setFurnitureLoading: (value: boolean) => void;
  furnitureError: string;
  setFurnitureError: (value: string) => void;
  furnitureWorkbook: Record<string, unknown> | null;
  setFurnitureWorkbook: (value: Record<string, unknown> | null) => void;
  furnitureActiveSheet: string;
  setFurnitureActiveSheet: (value: string) => void;
  furnitureShowFormulas: boolean;
  setFurnitureShowFormulas: (value: boolean) => void;
  furnitureArticleRows: Record<string, unknown>[];
  setFurnitureArticleRows: (value: Record<string, unknown>[]) => void;
  furnitureDetailArticleRows: Record<string, unknown>[];
  setFurnitureDetailArticleRows: (value: Record<string, unknown>[]) => void;
  furnitureSelectedProduct: string;
  setFurnitureSelectedProduct: (value: string) => void;
  furnitureSelectedQty: string;
  setFurnitureSelectedQty: (value: string) => void;
}

const FurnitureDataContext = createContext<FurnitureDataContextValue | null>(null);

export function FurnitureDataProvider({ children }: { children: ReactNode }) {
  const [furnitureLoading, setFurnitureLoading] = useState(false);
  const [furnitureError, setFurnitureError] = useState("");
  const [furnitureWorkbook, setFurnitureWorkbook] = useState<Record<string, unknown> | null>(null);
  const [furnitureActiveSheet, setFurnitureActiveSheet] = useState("");
  const [furnitureShowFormulas, setFurnitureShowFormulas] = useState(false);
  const [furnitureArticleRows, setFurnitureArticleRows] = useState<Record<string, unknown>[]>([]);
  const [furnitureDetailArticleRows, setFurnitureDetailArticleRows] = useState<Record<string, unknown>[]>([]);
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

export function useFurnitureData(): FurnitureDataContextValue {
  const ctx = useContext(FurnitureDataContext);
  if (!ctx) throw new Error("useFurnitureData must be used within FurnitureDataProvider");
  return ctx;
}
