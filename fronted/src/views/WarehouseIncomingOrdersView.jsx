import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { isDone } from "../app/appUtils";
import { isOrderCustomerShipped, getOrderStageDisplayLabel } from "../orderPipeline";
import {
  filterWorkshopFinalIncomingOrders,
  sortWorkshopFinalIncomingOrders,
} from "../app/workshopFinalIncoming";
import { normalizeOrder } from "../app/rowHelpers";
import { fetchAllOrdersWithRetry } from "../hooks/useOrders";

export const WarehouseIncomingOrdersView = memo(function WarehouseIncomingOrdersView({
  getMaterialLabel,
  embedded = false,
  onOrdersLoaded,
  reloadNonce = 0,
  onLoadingChange,
}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    onLoadingChange?.(true);
    setLoadError("");
    try {
      const raw = await fetchAllOrdersWithRetry({ preferStaged: true, maxAttempts: 2 });
      const rows = (Array.isArray(raw) ? raw : []).map(normalizeOrder);
      const helpers = { isDone, isOrderCustomerShipped };
      const filtered = sortWorkshopFinalIncomingOrders(
        filterWorkshopFinalIncomingOrders(rows, helpers),
      );
      setOrders(filtered);
      if (typeof onOrdersLoaded === "function") onOrdersLoaded(filtered);
    } catch (e) {
      setOrders([]);
      setLoadError(String(e?.message || e || "Не удалось загрузить заказы"));
      if (typeof onOrdersLoaded === "function") onOrdersLoaded([]);
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }, [onOrdersLoaded, onLoadingChange]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders, reloadNonce]);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const id = String(o.orderId || o.order_id || "").toLowerCase();
      const item = String(o.item || "").toLowerCase();
      const material = String(o.material || o.colorName || o.color_name || "").toLowerCase();
      return id.includes(q) || item.includes(q) || material.includes(q);
    });
  }, [orders, query]);

  return (
    <div className="warehouse-incoming-orders">
      {!embedded && (
        <p className="warehouse-incoming-orders__lead">
          То же, что на вкладке «Финал» в производстве — можно заранее подготовить комплектацию
        </p>
      )}

      <div className="warehouse-incoming-orders__toolbar">
        <input
          type="search"
          className="search"
          placeholder="Поиск по названию или ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="badge">{filtered.length} заказ(ов)</span>
        {!embedded && (
          <button type="button" className="mini" onClick={loadOrders} disabled={loading}>
            {loading ? "Загрузка..." : "↻ Обновить"}
          </button>
        )}
      </div>

      {loading && orders.length === 0 ? (
        <div className="warehouse-empty" style={{ fontSize: 14, color: "#6b7280" }}>Загрузка...</div>
      ) : loadError ? (
        <div className="warehouse-empty">
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
          <div>{loadError}</div>
          <button type="button" className="mini" style={{ marginTop: 12 }} onClick={loadOrders}>
            Повторить
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="warehouse-empty">
          <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
          <div>Сейчас ничего не едет с финала</div>
          <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
            Заказы появятся после сборки на производстве
          </div>
        </div>
      ) : (
        filtered.map((o) => {
          const orderId = String(o.orderId || o.order_id || "").trim();
          const materialLabel =
            getMaterialLabel?.(o.item, o.material || o.colorName || o.color_name || "") ||
            o.material ||
            o.colorName;
          const stageLabel = getOrderStageDisplayLabel(o);
          return (
            <article key={orderId || `${o.item}-${o.week}`} className="card missing-order-card warehouse-incoming-card">
              <div className="line1">
                <strong>{o.item}</strong>
                <span className="badge warehouse-incoming-card__badge">🚚 {stageLabel || "На финале"}</span>
              </div>
              <div className="line2">
                {materialLabel && <span>🎨 {materialLabel}</span>}
                <span>📦 {o.qty} шт.</span>
                {o.week != null && String(o.week).trim() !== "" && <span>План: {o.week}</span>}
              </div>
              <div className="line2" style={{ color: "#9ca3af", fontSize: 11 }}>
                <span>ID: {orderId}</span>
              </div>
            </article>
          );
        })
      )}
    </div>
  );
});
