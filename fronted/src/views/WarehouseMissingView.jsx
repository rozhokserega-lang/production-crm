import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { PRODUCTS_CATALOG } from "../constants/missingParts";

const OTHER_PRODUCT_KEY = "__OTHER__";
const EXCLUDED_PRODUCT_PATTERNS = [
  /лофт/i,
  /системы\s*хранения/i,
];

export const WarehouseMissingView = memo(function WarehouseMissingView({
  callBackend,
  furnitureTemplates,
  furnitureArticleGroups,
  productColorMapRows,
  sectionArticleRows,
  materialsStockRows,
  formatProductName,
}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [listView, setListView] = useState("new");
  const [form, setForm] = useState({
    open: false, step: 1,
    product: "", part: "", qty: "1", color: "", note: "",
  });

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await callBackend("webGetReplacementOrders");
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

  const productsCatalog = useMemo(() => {
    const templates = Array.isArray(furnitureTemplates) ? furnitureTemplates : [];
    if (!templates.length) return PRODUCTS_CATALOG;
    const result = {};
    templates.forEach((tpl) => {
      const productName = String(tpl?.productName || "").trim();
      if (!productName) return;
      const detailRows = Array.isArray(tpl?.details) ? tpl.details : [];
      const details = detailRows
        .map((d) => String(d?.detailName || "").trim())
        .filter(Boolean);
      if (!details.length) return;
      const normalizedProduct = productName.toLowerCase().replace(/\s+/g, " ");
      const forceAllColors =
        normalizedProduct.includes("avella lite") ||
        normalizedProduct.includes("avella light") ||
        normalizedProduct.includes("авелла лайт");
      result[productName] = details.map((name) => {
        const fallback = (PRODUCTS_CATALOG[productName] || []).find((x) => x.name === name);
        return {
          name,
          hasColor: forceAllColors || Boolean(
            fallback?.hasColor ||
            String(detailRows.find((x) => String(x?.detailName || "").trim() === name)?.color || "").trim(),
          ),
        };
      });
    });
    return Object.keys(result).length ? result : PRODUCTS_CATALOG;
  }, [furnitureTemplates]);

  const allKnownColors = useMemo(() => {
    const fromFurniture = (Array.isArray(furnitureArticleGroups) ? furnitureArticleGroups : [])
      .flatMap((g) => (Array.isArray(g?.rows) ? g.rows : []))
      .map((r) => String(r?.color || "").trim())
      .filter(Boolean);
    const fromProductColorMap = (Array.isArray(productColorMapRows) ? productColorMapRows : [])
      .map((r) => String(r?.color_name || r?.colorName || "").trim())
      .filter(Boolean);
    const fromSections = (Array.isArray(sectionArticleRows) ? sectionArticleRows : [])
      .map((r) => String(r?.material || r?.table_color || r?.tableColor || "").trim())
      .filter(Boolean);
    const fromStock = (Array.isArray(materialsStockRows) ? materialsStockRows : [])
      .map((r) => String(r?.material || "").trim())
      .filter(Boolean);
    const preferred = Array.from(new Set(fromFurniture)).sort((a, b) => a.localeCompare(b, "ru"));
    if (preferred.length) return preferred;
    return Array.from(new Set([...fromProductColorMap, ...fromSections, ...fromStock])).sort((a, b) => a.localeCompare(b, "ru"));
  }, [furnitureArticleGroups, productColorMapRows, sectionArticleRows, materialsStockRows]);

  const colorOptionsForSelectedProduct = useMemo(() => {
    const colorsSet = new Set(allKnownColors);
    const selectedPart = String(form.part || "").toLowerCase();
    if (selectedPart.includes("обвяз")) colorsSet.add("Черный");
    return Array.from(colorsSet).sort((a, b) => a.localeCompare(b, "ru"));
  }, [allKnownColors, form.part]);

  const visibleProducts = useMemo(
    () =>
      Object.keys(productsCatalog).filter(
        (name) => !EXCLUDED_PRODUCT_PATTERNS.some((rx) => rx.test(String(name || ""))),
      ),
    [productsCatalog],
  );

  function openForm() {
    setForm({ open: true, step: 1, product: "", part: "", qty: "1", color: "", note: "" });
  }
  function closeForm() { setForm((f) => ({ ...f, open: false })); }
  function nextStep() { setForm((f) => ({ ...f, step: f.step + 1 })); }
  function prevStep() { setForm((f) => ({ ...f, step: Math.max(1, f.step - 1) })); }

  async function submitOrder() {
    const partDef = (productsCatalog[form.product] || []).find((p) => p.name === form.part);
    const isOther = form.product === OTHER_PRODUCT_KEY;
    const id = `RPL-${Date.now()}`;
    const payload = {
      p_id: id,
      p_product: isOther ? "Прочее" : form.product,
      p_part: form.part,
      p_qty: Number(form.qty) || 1,
      p_color: isOther ? (form.color || "") : (partDef?.hasColor ? (form.color || "") : "—"),
      p_note: form.note,
    };
    try {
      await callBackend("webCreateReplacementOrder", payload);
      closeForm();
      setListView("all");
      await loadOrders();
    } catch (_) {}
  }

  async function sendToWork(orderId) {
    setSendingId(orderId);
    try {
      await callBackend("webSendReplacementOrderToWork", { p_id: orderId });
      await loadOrders();
    } catch (_) {}
    setSendingId(null);
  }

  async function deleteOrder(orderId) {
    try {
      await callBackend("webDeleteReplacementOrder", { p_id: orderId });
      await loadOrders();
    } catch (_) {}
  }

  const partDef = form.product
    ? (productsCatalog[form.product] || []).find((p) => p.name === form.part)
    : null;
  const isOther = form.product === OTHER_PRODUCT_KEY;
  const step3Valid = form.qty && Number(form.qty) >= 1 && (isOther ? Boolean(String(form.color || "").trim()) : (!partDef?.hasColor || form.color));

  const displayOrders = listView === "new"
    ? orders.filter((o) => !o.sent_to_work)
    : orders;

  return (
    <div className="warehouse-view">
      <div className="warehouse-header">
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Заказ замены детали</h2>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>
            Деталь сломана, поцарапана, потеряна или бракована — создайте заказ на замену
          </p>
        </div>
        <button type="button" onClick={openForm} style={{ whiteSpace: "nowrap" }}>
          + Создать заказ
        </button>
      </div>

      <div className="warehouse-steps-hint">
        {["Изделие", "Деталь", "Кол-во и цвет", "В производство"].map((label, i) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <span style={{ color: "#9ca3af" }}>→</span>}
            <span className="step-hint"><span>{i + 1}</span> {label}</span>
          </span>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
        <div className="tabs" style={{ margin: 0 }}>
          <button type="button" className={listView === "new" ? "tab active" : "tab"} onClick={() => setListView("new")}>
            Новые ({orders.filter((o) => !o.sent_to_work).length})
          </button>
          <button type="button" className={listView === "all" ? "tab active" : "tab"} onClick={() => setListView("all")}>
            Все заказы ({orders.length})
          </button>
        </div>
        <button type="button" className="mini" onClick={loadOrders} disabled={loading}>
          {loading ? "Загрузка..." : "↻ Обновить"}
        </button>
      </div>

      {loading && orders.length === 0 ? (
        <div className="warehouse-empty" style={{ fontSize: 14, color: "#6b7280" }}>Загрузка...</div>
      ) : displayOrders.length === 0 ? (
        <div className="warehouse-empty">
          <div style={{ fontSize: 40, marginBottom: 8 }}>{listView === "new" ? "✅" : "📦"}</div>
          <div>{listView === "new" ? "Нет новых заказов на замену" : "Нет заказов на замену деталей"}</div>
          <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>Нажмите «+ Создать заказ» чтобы добавить</div>
        </div>
      ) : (
        displayOrders.map((o) => (
          <article key={o.id} className={`card missing-order-card ${o.sent_to_work ? "done" : ""}`}>
            <div className="line1">
              <strong>{o.product} — {o.part}</strong>
              <span className="badge">{o.status}</span>
            </div>
            <div className="line2">
              {o.color && o.color !== "—" && <span>🎨 {o.color}</span>}
              <span>📦 {o.qty} шт.</span>
            </div>
            {o.note && <div style={{ fontSize: 12, color: "#6b7280", paddingTop: 2 }}>💬 {o.note}</div>}
            <div className="line2" style={{ color: "#9ca3af", fontSize: 11 }}>
              <span>ID: {o.id}</span>
              <span>{new Date(o.created_at).toLocaleString("ru-RU")}</span>
            </div>
            <div className="actions">
              {!o.sent_to_work && (
                <button type="button" className="mini ok" disabled={sendingId === o.id} onClick={() => sendToWork(o.id)}>
                  {sendingId === o.id ? "Отправляю..." : "▶ Отправить в работу"}
                </button>
              )}
              <button type="button" className="mini warn" onClick={() => deleteOrder(o.id)}>Удалить</button>
            </div>
          </article>
        ))
      )}

      {form.open && (
        <div className="dialog-backdrop">
          <div className="dialog-card missing-form-dialog">
            <div className="missing-progress">
              {["Изделие", "Деталь", "Детали", "Итог"].map((label, i) => (
                <div key={label} className={`progress-step ${form.step === i + 1 ? "active" : form.step > i + 1 ? "done" : ""}`}>
                  <div className="progress-dot">{form.step > i + 1 ? "✓" : i + 1}</div>
                  <div className="progress-label">{label}</div>
                </div>
              ))}
            </div>

            {form.step === 1 && (
              <div className="missing-step">
                <h3 style={{ margin: "0 0 4px" }}>Шаг 1: Выберите изделие</h3>
                <p style={{ margin: "0 0 14px", color: "#6b7280", fontSize: 13 }}>Для какого изделия нужна деталь на замену?</p>
                <div className="product-grid">
                  {visibleProducts.map((prod) => (
                    <button type="button" key={prod} className={`product-btn ${form.product === prod ? "selected" : ""}`} onClick={() => setForm((f) => ({ ...f, product: prod, part: "", color: "" }))}>
                      🪑 {typeof formatProductName === "function" ? formatProductName(prod) : prod}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`product-btn ${form.product === OTHER_PRODUCT_KEY ? "selected" : ""}`}
                    onClick={() => setForm((f) => ({ ...f, product: OTHER_PRODUCT_KEY, part: "", color: "" }))}
                  >
                    ➕ Прочее
                  </button>
                </div>
                <div className="actions" style={{ marginTop: 16 }}>
                  <button type="button" className="mini ok" disabled={!form.product} onClick={nextStep}>Далее →</button>
                  <button type="button" className="mini" onClick={closeForm}>Отмена</button>
                </div>
              </div>
            )}

            {form.step === 2 && (
              <div className="missing-step">
                <h3 style={{ margin: "0 0 4px" }}>Шаг 2: Выберите деталь</h3>
                <p style={{ margin: "0 0 14px", color: "#6b7280", fontSize: 13 }}>
                  Изделие: <strong>{form.product === OTHER_PRODUCT_KEY ? "Прочее" : form.product}</strong>
                </p>
                {form.product === OTHER_PRODUCT_KEY ? (
                  <div>
                    <label>Что нужно изготовить</label>
                    <input
                      value={form.part}
                      onChange={(e) => setForm((f) => ({ ...f, part: e.target.value }))}
                      placeholder="Например: Доп. полка 500x300"
                      style={{ width: "100%", marginTop: 6 }}
                    />
                  </div>
                ) : (
                  <div className="parts-list">
                    {(productsCatalog[form.product] || []).map((part) => (
                      <button type="button" key={part.name} className={`part-btn ${form.part === part.name ? "selected" : ""}`} onClick={() => setForm((f) => ({ ...f, part: part.name, color: "" }))}>
                        🔩 {part.name}
                        {part.hasColor && <span className="part-tag">цвет</span>}
                      </button>
                    ))}
                  </div>
                )}
                <div className="actions" style={{ marginTop: 16 }}>
                  <button type="button" className="mini ok" disabled={!String(form.part || "").trim()} onClick={nextStep}>Далее →</button>
                  <button type="button" className="mini" onClick={prevStep}>← Назад</button>
                  <button type="button" className="mini" onClick={closeForm}>Отмена</button>
                </div>
              </div>
            )}

            {form.step === 3 && (
              <div className="missing-step">
                <h3 style={{ margin: "0 0 4px" }}>Шаг 3: Параметры</h3>
                <p style={{ margin: "0 0 14px", color: "#6b7280", fontSize: 13 }}>{form.product} → <strong>{form.part}</strong></p>
                <div className="missing-fields">
                  <label>Количество (шт.)</label>
                  <input inputMode="numeric" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="1" style={{ width: "100%", marginBottom: 12 }} />
                  {(isOther || partDef?.hasColor) && (
                    <>
                      <label>Цвет / Материал</label>
                      {isOther ? (
                        <input
                          value={form.color}
                          onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                          placeholder="Например: Черный матовый"
                          style={{ width: "100%", marginBottom: 12 }}
                        />
                      ) : (
                        <select value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} style={{ width: "100%", marginBottom: 12 }}>
                          <option value="">— Выберите цвет —</option>
                          {colorOptionsForSelectedProduct.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      )}
                    </>
                  )}
                  <label>Примечание (необязательно)</label>
                  <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Например: трещина на краю, заказ №123..." style={{ width: "100%" }} />
                </div>
                <div className="actions" style={{ marginTop: 16 }}>
                  <button type="button" className="mini ok" disabled={!step3Valid} onClick={nextStep}>Далее →</button>
                  <button type="button" className="mini" onClick={prevStep}>← Назад</button>
                  <button type="button" className="mini" onClick={closeForm}>Отмена</button>
                </div>
              </div>
            )}

            {form.step === 4 && (
              <div className="missing-step">
                <h3 style={{ margin: "0 0 4px" }}>Шаг 4: Подтверждение</h3>
                <p style={{ margin: "0 0 14px", color: "#6b7280", fontSize: 13 }}>Проверьте данные перед созданием заказа</p>
                <div className="missing-confirm-table">
                  <div className="confirm-row"><span>Изделие:</span><strong>{form.product === OTHER_PRODUCT_KEY ? "Прочее" : form.product}</strong></div>
                  <div className="confirm-row"><span>Деталь:</span><strong>{form.part}</strong></div>
                  <div className="confirm-row"><span>Количество:</span><strong>{form.qty} шт.</strong></div>
                  {form.color && <div className="confirm-row"><span>Цвет:</span><strong>{form.color}</strong></div>}
                  {form.note && <div className="confirm-row"><span>Примечание:</span><strong>{form.note}</strong></div>}
                </div>
                <div className="actions" style={{ marginTop: 16 }}>
                  <button type="button" className="mini ok" onClick={submitOrder}>✅ Создать заказ</button>
                  <button type="button" className="mini" onClick={prevStep}>← Назад</button>
                  <button type="button" className="mini" onClick={closeForm}>Отмена</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
