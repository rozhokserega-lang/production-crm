import { useCallback } from "react";
import { OrderService } from "../services/orderService";
import { normalizeWarehouseSheetSizeInput } from "../app/warehouseSheetSizeHelpers";
import { normalizeFurnitureKey } from "../utils/furnitureUtils";

/**
 * Warehouse actions: print order plan PDF, update sheet size.
 */
export function useWarehouseActions({
  warehouseOrderPlanRows,
  canOperateWarehouse = false,
  setWarehouseRows,
  setError,
}) {
  const printWarehouseOrderPlanPdf = useCallback(() => {
    const rows = warehouseOrderPlanRows;
    if (!rows.length) {
      setError("Дефицита материалов нет — заказывать нечего.");
      return;
    }
    const now = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
    const htmlRows = rows
      .map(
        (r, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${String(r.material || "")}</td>
            <td>${r.needed}</td>
            <td>${r.available}</td>
            <td><b>${r.toOrder}</b></td>
          </tr>`,
      )
      .join("");
    const popup = window.open("", "_blank");
    if (!popup) {
      setError("Не удалось открыть окно печати. Разреши pop-up для сайта.");
      return;
    }
    popup.document.write(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Что заказать (склад)</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    .meta { margin: 0 0 16px; color: #334155; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 13px; text-align: left; }
    th { background: #f1f5f9; }
  </style>
</head>
<body>
  <h1>Лист заказа материалов</h1>
  <div class="meta">Сформировано: ${now}</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Материал</th>
        <th>Нужно для плана</th>
        <th>В наличии</th>
        <th>Заказать</th>
      </tr>
    </thead>
    <tbody>${htmlRows}</tbody>
  </table>
</body>
</html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  }, [warehouseOrderPlanRows, setError]);

  const updateMaterialSheetSize = useCallback(async (material, sizeLabel) => {
    const materialName = String(material || "").trim();
    if (!materialName) return false;
    if (!canOperateWarehouse) {
      setError("Недостаточно прав для изменения размера листа.");
      return false;
    }
    const normalized = normalizeWarehouseSheetSizeInput(sizeLabel);
    if (String(sizeLabel || "").trim() && normalized === null) {
      setError("Формат размера: 2800x2070");
      return false;
    }
    try {
      const raw = await OrderService.updateMaterialsStockSheetSize(materialName, normalized || "");
      const row = Array.isArray(raw) ? raw[0] : raw;
      if (row && typeof setWarehouseRows === "function") {
        const targetKey = normalizeFurnitureKey(materialName);
        setWarehouseRows((prev) =>
          prev.map((item) => {
            if (normalizeFurnitureKey(item.material) !== targetKey) return item;
            return {
              ...item,
              material: row.material ?? item.material,
              size_label: row.size_label ?? row.sizeLabel ?? null,
              sizeLabel: row.size_label ?? row.sizeLabel ?? "",
              sheet_width_mm: row.sheet_width_mm ?? row.sheetWidthMm ?? null,
              sheet_height_mm: row.sheet_height_mm ?? row.sheetHeightMm ?? null,
              updated_at: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
              updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
            };
          }),
        );
      }
      return true;
    } catch (e) {
      setError(String(e?.message || e || "Ошибка сохранения размера"));
      return false;
    }
  }, [canOperateWarehouse, setError, setWarehouseRows]);

  return { printWarehouseOrderPlanPdf, updateMaterialSheetSize };
}
