import { useState } from "react";
import ShelfCalculator from "../components/ShelfCalculator";

interface FurnitureSheetData {
  headers: string[];
  rows: Record<string, unknown>[];
}

interface FurnitureTemplate {
  productName: string;
  details: { detailName: string; qty: number; pattern: string }[];
}

interface FurnitureGeneratedDetail {
  detailName: string;
  qty: number;
  linkedArticles: string[];
}

interface FurnitureViewProps {
  furnitureLoading: boolean;
  furnitureError: string;
  furnitureSheetData: FurnitureSheetData;
  furnitureSelectedProduct: string;
  setFurnitureSelectedProduct: (v: string) => void;
  furnitureTemplates: FurnitureTemplate[];
  furnitureProductLabel: (name: string) => string;
  furnitureSelectedQty: string;
  setFurnitureSelectedQty: (v: string) => void;
  furnitureGeneratedDetails: FurnitureGeneratedDetail[];
  furnitureSelectedTemplate: FurnitureTemplate | null;
  furnitureQtyNumber: number;
  canOperateProduction: boolean;
  createShelfPlanOrder: (params: {
    item: string;
    article: string;
    material: string;
    week: string;
    qty: number;
    qrQty: number;
  }) => Promise<void>;
}

export function FurnitureView({
  furnitureLoading,
  furnitureError,
  furnitureSheetData,
  furnitureSelectedProduct,
  setFurnitureSelectedProduct,
  furnitureTemplates,
  furnitureProductLabel,
  furnitureSelectedQty,
  setFurnitureSelectedQty,
  furnitureGeneratedDetails,
  furnitureSelectedTemplate,
  furnitureQtyNumber,
  canOperateProduction,
  createShelfPlanOrder,
}: FurnitureViewProps) {
  const [furnitureSubTab, setFurnitureSubTab] = useState("main");

  return (
    <>
      {furnitureLoading && <div className="empty">Загружаю таблицу Мебель.xlsx...</div>}
      {!furnitureLoading && furnitureError && <div className="error">{furnitureError}</div>}
      {!furnitureLoading && !furnitureError && furnitureSheetData.headers.length === 0 && (
        <div className="empty">В файле нет данных для отображения.</div>
      )}
      {!furnitureLoading && !furnitureError && furnitureSheetData.headers.length > 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          <div className="tabs tabs--overview-sub">
            <button
              type="button"
              className={furnitureSubTab === "main" ? "tab active" : "tab"}
              onClick={() => setFurnitureSubTab("main")}
            >
              Основная мебель
            </button>
            <button
              type="button"
              className={furnitureSubTab === "storage" ? "tab active" : "tab"}
              onClick={() => setFurnitureSubTab("storage")}
            >
              Система хранения
            </button>
          </div>
          {furnitureSubTab === "main" && (
            <div className="sheet-table-wrap">
              <div style={{ display: "flex", gap: 8, alignItems: "end", marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 220 }}>
                  <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>Изделие</div>
                  <select
                    value={furnitureSelectedProduct}
                    onChange={(e) => setFurnitureSelectedProduct(e.target.value)}
                  >
                    {furnitureTemplates.map((t) => (
                      <option key={t.productName} value={t.productName}>{furnitureProductLabel(t.productName)}</option>
                    ))}
                  </select>
                </div>
                <div style={{ width: 140 }}>
                  <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>Количество</div>
                  <input
                    inputMode="decimal"
                    value={furnitureSelectedQty}
                    onChange={(e) => setFurnitureSelectedQty(e.target.value.replace(/[^0-9.,]/g, ""))}
                    placeholder="1"
                  />
                </div>
              </div>
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>Изделие</th>
                    <th>Кол-во</th>
                    <th>Деталь</th>
                    <th>Кол-во</th>
                    <th>Артикулы (из БД)</th>
                  </tr>
                </thead>
                <tbody>
                  {furnitureGeneratedDetails.map((d, idx) => (
                    <tr key={`fg-${idx}`}>
                      <td>{idx === 0 ? furnitureProductLabel(furnitureSelectedTemplate?.productName || "-") : ""}</td>
                      <td>{idx === 0 ? furnitureQtyNumber : ""}</td>
                      <td>{d.detailName}</td>
                      <td>{Number.isInteger(d.qty) ? d.qty : d.qty.toFixed(3)}</td>
                      <td>{(d.linkedArticles || []).join(", ") || "-"}</td>
                    </tr>
                  ))}
                  {furnitureGeneratedDetails.length === 0 && (
                    <tr>
                      <td colSpan={5}>Выберите изделие и укажите количество.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {furnitureSubTab === "storage" && (
            <ShelfCalculator
              canOperateProduction={canOperateProduction}
              onCreatePlanOrder={createShelfPlanOrder}
            />
          )}
        </div>
      )}
    </>
  );
}
