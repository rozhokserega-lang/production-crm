import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { OrderService } from "../services/orderService";
import { formatDateTimeRu } from "../app/rowHelpers";
import { isWorkshopStrapOrderItem } from "../app/workshopStrapNeeds";
import { groupShippedOrdersByMonth } from "../app/warehouseShippedHelpers";

/**
 * История отгруженных заказов (вкладка «Отгружено» на /sklad).
 * Заказ попадает сюда после «На отгрузку» в очереди комплектации
 * (pipeline_stage = 'shipped'). Группировка — по месяцам отгрузки.
 */
export const WarehouseShippedOrdersView = memo(function WarehouseShippedOrdersView() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await OrderService.getOrdersByStage("shipped");
      // Обвязка (планки) в истории склада не нужна — у неё свой раздел «Обвязка».
      setOrders(
        (Array.isArray(rows) ? rows : []).filter((o) => !isWorkshopStrapOrderItem(o?.item)),
      );
    } catch (_) {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const id = String(o.orderId || o.order_id || "").toLowerCase();
      const item = String(o.item || "").toLowerCase();
      const week = String(o.week || "").toLowerCase();
      const material = String(o.material || o.colorName || o.color_name || "").toLowerCase();
      return id.includes(q) || item.includes(q) || week.includes(q) || material.includes(q);
    });
  }, [orders, query]);

  const groups = useMemo(() => groupShippedOrdersByMonth(filtered), [filtered]);
  const totalCount = groups.reduce((sum, g) => sum + g.count, 0);
  const totalQty = groups.reduce((sum, g) => sum + g.totalQty, 0);

  return (
    <div className="warehouse-shipped-orders">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
          История отгрузок — заказы, ушедшие с комплектации кнопкой «На отгрузку»
        </p>
        <button type="button" className="mini" onClick={loadOrders} disabled={loading}>
          {loading ? "Загрузка..." : "↻ Обновить"}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          value={query}
          placeholder="Поиск по номеру, изделию или плану"
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: "1 1 260px", maxWidth: 360, padding: "8px 10px", fontSize: 14 }}
        />
        <span className="badge meta-inline">
          {totalCount} заказ(ов) · {totalQty} шт
        </span>
      </div>

      {!groups.length && !loading && (
        <div className="empty">
          <div style={{ fontSize: 28, marginBottom: 6 }}>🚚</div>
          Пока нет отгруженных заказов
          <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
            Здесь появится история после кнопки «На отгрузку» на вкладке «Заказы»
          </div>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.key} style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "0 0 6px" }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>{group.label || "Без даты"}</h3>
            <span style={{ color: "#6b7280", fontSize: 13 }}>
              {group.count} заказ(ов) · {group.totalQty} шт
            </span>
          </div>
          <div className="sheet-table-wrap">
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Дата отгрузки</th>
                  <th>Номер заказа</th>
                  <th>Изделие</th>
                  <th>Цвет</th>
                  <th>План</th>
                  <th>Кол-во</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={`${row.orderId}-${row.item}-${row.dateTs}`}>
                    <td data-label="Дата отгрузки">{formatDateTimeRu(row.dateTs)}</td>
                    <td data-label="Номер заказа"><b>{row.orderId || "—"}</b></td>
                    <td data-label="Изделие">{row.item || "—"}</td>
                    <td data-label="Цвет">{row.material || "—"}</td>
                    <td data-label="План">{row.week || "—"}</td>
                    <td data-label="Кол-во"><b>{row.qty || "—"}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
});
