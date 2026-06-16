import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { OrderService } from "../services/orderService";
import { formatDateTimeRu } from "../app/rowHelpers";
import { HardwareRequirementDialog } from "../components/HardwareRequirementDialog";

const KIT_BUCKET = {
  NEW: "new",
  IN_WORK: "in_work",
  DONE: "done",
};

function getKitBucket(order) {
  const status = String(order?.overallStatus || order?.overall_status || "").toLowerCase();
  if (status.includes("комплектация готова")) return KIT_BUCKET.DONE;
  if (status.includes("в комплектации")) return KIT_BUCKET.IN_WORK;
  return KIT_BUCKET.NEW;
}

function getKitStatusLabel(bucket) {
  if (bucket === KIT_BUCKET.IN_WORK) return "В комплектации";
  if (bucket === KIT_BUCKET.DONE) return "Комплектация готова";
  return "Ожидает";
}

export const WarehouseKitOrdersView = memo(function WarehouseKitOrdersView({
  callBackend,
  runAction,
  openHardwareConsumeDialog,
  getMaterialLabel,
  canOperateWarehouse = false,
  canOperateProduction = false,
  isActionPending,
  onDataChanged,
}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [listView, setListView] = useState(KIT_BUCKET.NEW);
  const [hwReqDialog, setHwReqDialog] = useState({
    open: false,
    loading: false,
    orderId: "",
    item: "",
    qty: "",
    lines: [],
    error: "",
  });

  const closeHwReqDialog = useCallback(() => {
    setHwReqDialog({
      open: false,
      loading: false,
      orderId: "",
      item: "",
      qty: "",
      lines: [],
      error: "",
    });
  }, []);

  const openHwReqDialog = useCallback((o) => {
    const orderId = String(o.orderId || o.order_id || "").trim();
    if (!orderId) return;
    setHwReqDialog({
      open: true,
      loading: true,
      orderId,
      item: String(o.item || "").trim(),
      qty: o.qty,
      lines: [],
      error: "",
    });
    OrderService.getHardwareConsumeOptions(orderId)
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setHwReqDialog((prev) => ({
          ...prev,
          loading: false,
          lines: list.map((r) => ({
            hardwareItemId: Number(r.hardware_item_id),
            name: String(r.name || "").trim(),
            size: String(r.size || "").trim(),
            unit: String(r.unit || "шт").trim(),
            required: Number(r.suggested_qty || 0),
            available: Number(r.available || 0),
          })),
        }));
      })
      .catch((e) => {
        setHwReqDialog((prev) => ({
          ...prev,
          loading: false,
          error: String(e?.message || e || "Не удалось загрузить потребность"),
        }));
      });
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await (callBackend
        ? callBackend("webGetWarehouseKitOrders")
        : OrderService.getWarehouseKitOrders());
      setOrders(Array.isArray(rows) ? rows : []);
    } catch (_) {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [callBackend]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const buckets = useMemo(() => {
    const result = { new: [], in_work: [], done: [] };
    orders.forEach((o) => {
      const bucket = getKitBucket(o);
      result[bucket].push(o);
    });
    return result;
  }, [orders]);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    const base = buckets[listView] || [];
    if (!q) return base;
    return base.filter((o) => {
      const id = String(o.orderId || o.order_id || "").toLowerCase();
      const item = String(o.item || "").toLowerCase();
      const material = String(o.material || o.colorName || o.color_name || "").toLowerCase();
      return id.includes(q) || item.includes(q) || material.includes(q);
    });
  }, [buckets, listView, query]);

  const canOperate = canOperateWarehouse || canOperateProduction;
  const isPending = (key) => (typeof isActionPending === "function" ? isActionPending(key) : false);

  const afterAction = useCallback(async () => {
    await loadOrders();
    if (typeof onDataChanged === "function") onDataChanged();
  }, [loadOrders, onDataChanged]);

  const handleInWork = async (o) => {
    const orderId = String(o.orderId || o.order_id || "").trim();
    if (!orderId || typeof runAction !== "function") return;
    await runAction("webSetWarehouseKitInWork", orderId);
    await afterAction();
  };

  const handleKitDone = async (o) => {
    const orderId = String(o.orderId || o.order_id || "").trim();
    if (!orderId || typeof runAction !== "function") return;
    await runAction("webSetWarehouseKitDone", orderId);
    await afterAction();
  };

  const handleConsume = (o) => {
    const orderId = String(o.orderId || o.order_id || "").trim();
    if (!orderId || typeof openHardwareConsumeDialog !== "function") return;
    openHardwareConsumeDialog(orderId, {
      item: o.item,
      week: o.week,
      material: getMaterialLabel?.(o.item, o.material || o.colorName || o.color_name || "") || o.material,
      qty: o.qty,
    });
  };

  const handleShip = async (o) => {
    const orderId = String(o.orderId || o.order_id || "").trim();
    if (!orderId || typeof runAction !== "function") return;
    await runAction("webSetShippingDone", orderId, {}, {
      item: o.item,
      week: o.week,
      material: getMaterialLabel?.(o.item, o.material || o.colorName || o.color_name || "") || o.material,
      qty: o.qty,
    });
    await afterAction();
  };

  const emptyState = listView === KIT_BUCKET.NEW
    ? {
        icon: "📦",
        title: "Нет заказов в очереди",
        hint: "Заказы появятся здесь после нажатия «Готово» на вкладке «Финал» в производстве",
      }
    : listView === KIT_BUCKET.IN_WORK
      ? {
          icon: "🔨",
          title: "Нет заказов в работе",
          hint: "Возьмите заказ из очереди кнопкой «В работу»",
        }
      : {
          icon: "✅",
          title: "Нет готовых заказов",
          hint: "После комплектации фурнитурой отметьте заказ «Готово»",
        };

  return (
    <div className="warehouse-kit-orders">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
          Заказы после финала в производстве — комплектуйте фурнитурой и отправляйте на отгрузку
        </p>
        <button type="button" className="mini" onClick={loadOrders} disabled={loading}>
          {loading ? "Загрузка..." : "↻ Обновить"}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
        <div className="tabs" style={{ margin: 0 }}>
          <button
            type="button"
            className={listView === KIT_BUCKET.NEW ? "tab active" : "tab"}
            onClick={() => setListView(KIT_BUCKET.NEW)}
          >
            Ожидают ({buckets.new.length})
          </button>
          <button
            type="button"
            className={listView === KIT_BUCKET.IN_WORK ? "tab active" : "tab"}
            onClick={() => setListView(KIT_BUCKET.IN_WORK)}
          >
            В работе ({buckets.in_work.length})
          </button>
          <button
            type="button"
            className={listView === KIT_BUCKET.DONE ? "tab active" : "tab"}
            onClick={() => setListView(KIT_BUCKET.DONE)}
          >
            Готовые ({buckets.done.length})
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          type="search"
          className="search"
          placeholder="Поиск по названию или ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: "1 1 220px", maxWidth: 360 }}
        />
        <span className="badge" style={{ alignSelf: "center" }}>
          {filtered.length} заказ(ов)
        </span>
      </div>

      {loading && orders.length === 0 ? (
        <div className="warehouse-empty" style={{ fontSize: 14, color: "#6b7280" }}>Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="warehouse-empty">
          <div style={{ fontSize: 40, marginBottom: 8 }}>{emptyState.icon}</div>
          <div>{emptyState.title}</div>
          <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>{emptyState.hint}</div>
        </div>
      ) : (
        filtered.map((o) => {
          const orderId = String(o.orderId || o.order_id || "").trim();
          const bucket = getKitBucket(o);
          const materialLabel = getMaterialLabel?.(o.item, o.material || o.colorName || o.color_name || "") || o.material;
          const updatedAt = o.updatedAt || o.updated_at;
          return (
            <article key={orderId} className="card missing-order-card">
              <div className="line1">
                <strong>{o.item}</strong>
                <span className="badge">{getKitStatusLabel(bucket)}</span>
              </div>
              <div className="line2">
                {materialLabel && <span>🎨 {materialLabel}</span>}
                <span>📦 {o.qty} шт.</span>
                {o.week && <span>План: {o.week}</span>}
              </div>
              <div className="line2" style={{ color: "#9ca3af", fontSize: 11 }}>
                <span>ID: {orderId}</span>
                {updatedAt && <span>Обновлено: {formatDateTimeRu(updatedAt)}</span>}
              </div>
              <div className="actions warehouse-kit-card__actions">
                {bucket === KIT_BUCKET.NEW && (
                  <button
                    type="button"
                    className="mini ok"
                    disabled={!canOperate || isPending(`webSetWarehouseKitInWork:${orderId}`)}
                    onClick={() => handleInWork(o)}
                  >
                    {isPending(`webSetWarehouseKitInWork:${orderId}`) ? "Беру..." : "▶ В работу"}
                  </button>
                )}
                <button
                  type="button"
                  className="mini hw-req-open-btn"
                  onClick={() => openHwReqDialog(o)}
                >
                  🔩 Фурнитура
                </button>
                {bucket === KIT_BUCKET.IN_WORK && (
                  <>
                    <button
                      type="button"
                      className="mini"
                      disabled={!canOperate}
                      onClick={() => handleConsume(o)}
                    >
                      🔩 Списать фурнитуру
                    </button>
                    <button
                      type="button"
                      className="mini ok"
                      disabled={!canOperate || isPending(`webSetWarehouseKitDone:${orderId}`)}
                      onClick={() => handleKitDone(o)}
                    >
                      {isPending(`webSetWarehouseKitDone:${orderId}`) ? "Сохраняю..." : "✓ Готово"}
                    </button>
                  </>
                )}
                {bucket === KIT_BUCKET.DONE && (
                  <button
                    type="button"
                    className="mini ok"
                    disabled={!canOperate || isPending(`webSetShippingDone:${orderId}`)}
                    onClick={() => handleShip(o)}
                  >
                    {isPending(`webSetShippingDone:${orderId}`) ? "Отправляю..." : "✓ На отгрузку"}
                  </button>
                )}
              </div>
            </article>
          );
        })
      )}

      <HardwareRequirementDialog
        open={hwReqDialog.open}
        orderId={hwReqDialog.orderId}
        item={hwReqDialog.item}
        qty={hwReqDialog.qty}
        lines={hwReqDialog.lines}
        loading={hwReqDialog.loading}
        error={hwReqDialog.error}
        onClose={closeHwReqDialog}
      />
    </div>
  );
});
