import { useCallback } from "react";

/**
 * Warehouse actions: print order plan PDF.
 */
export function useWarehouseActions({
  warehouseOrderPlanRows,
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

  return { printWarehouseOrderPlanPdf };
}
