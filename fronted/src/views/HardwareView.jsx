import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { OrderService } from "../services/orderService";

const HardwareBomGraph = lazy(() => import("./HardwareBomGraph"));

const SUB_VIEWS = [
  { id: "stock", label: "Склад" },
  { id: "plan", label: "Расчёт по плану" },
  { id: "graph", label: "Схема (блупринт)" },
  { id: "history", label: "История списаний" },
  { id: "map", label: "Соответствие" },
];

function num(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function HardwareView({ canOperateWarehouse = false, planWeeks = [] }) {
  const [subView, setSubView] = useState("stock");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const [stockRows, setStockRows] = useState([]);
  const [qtyDraft, setQtyDraft] = useState({});
  const [savingId, setSavingId] = useState(0);

  const [history, setHistory] = useState([]);

  const [planScope, setPlanScope] = useState("shipment");
  const [planKey, setPlanKey] = useState("");
  const [overviewMonths, setOverviewMonths] = useState([]);
  const [planRows, setPlanRows] = useState([]);
  const [planLoading, setPlanLoading] = useState(false);

  const [mapRows, setMapRows] = useState([]);
  const [mapDraft, setMapDraft] = useState(null);
  const [mapSaving, setMapSaving] = useState(false);

  const loadStock = useCallback(async () => {
    const rows = await OrderService.getHardwareStock();
    setStockRows(Array.isArray(rows) ? rows : []);
  }, []);

  const loadHistory = useCallback(async () => {
    const rows = await OrderService.getHardwareConsumeHistory(300);
    setHistory(Array.isArray(rows) ? rows : []);
  }, []);

  const loadMap = useCallback(async () => {
    const rows = await OrderService.getHardwareProductMap();
    setMapRows(Array.isArray(rows) ? rows : []);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([
      loadStock(),
      OrderService.getOverviewPlanMonths()
        .then((rows) => setOverviewMonths(Array.isArray(rows) ? rows : []))
        .catch(() => setOverviewMonths([])),
    ])
      .catch((e) => setError(String(e?.message || e || "Ошибка загрузки")))
      .finally(() => setLoading(false));
  }, [loadStock]);

  useEffect(() => {
    if (subView === "history") loadHistory().catch((e) => setError(String(e?.message || e)));
    if (subView === "map") loadMap().catch((e) => setError(String(e?.message || e)));
  }, [subView, loadHistory, loadMap]);

  const filteredStock = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stockRows;
    return stockRows.filter(
      (r) =>
        String(r.name || "").toLowerCase().includes(q) ||
        String(r.size || "").toLowerCase().includes(q),
    );
  }, [stockRows, query]);

  const saveStock = useCallback(
    async (itemId) => {
      const value = qtyDraft[itemId];
      if (value === undefined || value === "") return;
      setSavingId(itemId);
      setError("");
      try {
        await OrderService.setHardwareStock(itemId, num(value));
        await loadStock();
        setQtyDraft((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      } catch (e) {
        setError(String(e?.message || e || "Ошибка сохранения"));
      } finally {
        setSavingId(0);
      }
    },
    [qtyDraft, loadStock],
  );

  const planKeyOptions = useMemo(() => {
    if (planScope === "overview") {
      return overviewMonths.map((m) => ({ value: String(m.id), label: m.name }));
    }
    const weeks = (Array.isArray(planWeeks) ? planWeeks : [])
      .map((w) => String(w).trim())
      .filter(Boolean);
    return [...new Set(weeks)].map((w) => ({ value: w, label: `План ${w}` }));
  }, [planScope, overviewMonths, planWeeks]);

  const runPlanCalc = useCallback(async () => {
    if (!planKey) {
      setPlanRows([]);
      return;
    }
    setPlanLoading(true);
    setError("");
    try {
      const rows = await OrderService.getHardwarePlanRequirement(planScope, planKey);
      setPlanRows(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(String(e?.message || e || "Ошибка расчёта"));
      setPlanRows([]);
    } finally {
      setPlanLoading(false);
    }
  }, [planScope, planKey]);

  const planTotals = useMemo(
    () =>
      planRows.reduce(
        (acc, r) => {
          acc.deficit += Number(r.deficit || 0) > 0 ? 1 : 0;
          return acc;
        },
        { deficit: 0 },
      ),
    [planRows],
  );

  const saveMapRow = useCallback(
    async (draft) => {
      const bomProduct = String(draft.bom_product || "").trim();
      if (!bomProduct) {
        setError("Укажите изделие BOM");
        return;
      }
      if (!String(draft.section_name || "").trim() && !String(draft.item_name_pattern || "").trim()) {
        setError("Заполните секцию или шаблон названия");
        return;
      }
      setMapSaving(true);
      setError("");
      try {
        await OrderService.upsertHardwareProductMapRow({
          id: draft.id || null,
          bomProduct,
          sectionName: String(draft.section_name || "").trim() || null,
          itemNamePattern: String(draft.item_name_pattern || "").trim() || null,
          sortOrder: Number(draft.sort_order || 100),
          isActive: draft.is_active !== false,
        });
        setMapDraft(null);
        await loadMap();
      } catch (e) {
        setError(String(e?.message || e || "Ошибка сохранения соответствия"));
      } finally {
        setMapSaving(false);
      }
    },
    [loadMap],
  );

  const deleteMapRow = useCallback(
    async (id) => {
      setMapSaving(true);
      setError("");
      try {
        await OrderService.deleteHardwareProductMapRow(id);
        await loadMap();
      } catch (e) {
        setError(String(e?.message || e || "Ошибка удаления"));
      } finally {
        setMapSaving(false);
      }
    },
    [loadMap],
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="tabs" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {SUB_VIEWS.map((t) => (
          <button
            key={t.id}
            className={`mini ${subView === t.id ? "ok" : ""}`}
            onClick={() => setSubView(t.id)}
          >
            {t.label}
          </button>
        ))}
        {subView === "stock" && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск фурнитуры..."
            style={{ marginLeft: "auto", minWidth: 200 }}
          />
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {subView === "stock" && (
        <div className="sheet-table-wrap">
          {!loading && filteredStock.length === 0 ? (
            <div className="empty">Нет позиций фурнитуры</div>
          ) : (
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Фурнитура</th>
                  <th>Размер</th>
                  <th style={{ textAlign: "center" }}>В наличии</th>
                  <th style={{ textAlign: "center" }}>Ед.</th>
                  {canOperateWarehouse && <th>Установить</th>}
                  {canOperateWarehouse && <th>Действие</th>}
                </tr>
              </thead>
              <tbody>
                {filteredStock.map((r) => {
                  const id = Number(r.id);
                  const busy = savingId === id;
                  const draftVal = qtyDraft[id] ?? "";
                  return (
                    <tr key={id}>
                      <td>{r.name || "-"}</td>
                      <td>{r.size || "-"}</td>
                      <td style={{ textAlign: "center" }}>
                        <b style={{ color: Number(r.qty) <= 0 ? "#9ca3af" : undefined }}>{r.qty}</b>
                      </td>
                      <td style={{ textAlign: "center", color: "#9ca3af" }}>{r.unit || "шт"}</td>
                      {canOperateWarehouse && (
                        <td style={{ minWidth: 120 }}>
                          <input
                            value={draftVal}
                            inputMode="decimal"
                            placeholder={String(r.qty)}
                            disabled={busy}
                            onChange={(e) =>
                              setQtyDraft((prev) => ({
                                ...prev,
                                [id]: e.target.value.replace(/[^0-9.,]/g, ""),
                              }))
                            }
                          />
                        </td>
                      )}
                      {canOperateWarehouse && (
                        <td>
                          <button
                            className="mini ok"
                            disabled={busy || draftVal === ""}
                            onClick={() => saveStock(id)}
                          >
                            {busy ? "Сохраняю..." : "Сохранить"}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {subView === "plan" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="actions" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={planScope}
              onChange={(e) => {
                setPlanScope(e.target.value);
                setPlanKey("");
                setPlanRows([]);
              }}
            >
              <option value="shipment">План отгрузки (неделя)</option>
              <option value="overview">Месяц (Обзор → Планы)</option>
            </select>
            <select value={planKey} onChange={(e) => setPlanKey(e.target.value)}>
              <option value="">— выберите план —</option>
              {planKeyOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button className="mini ok" disabled={!planKey || planLoading} onClick={runPlanCalc}>
              {planLoading ? "Считаю..." : "Рассчитать"}
            </button>
          </div>

          <div className="sheet-table-wrap">
            {planRows.length === 0 ? (
              <div className="empty">
                {planLoading ? "Расчёт..." : "Выберите план и нажмите «Рассчитать»"}
              </div>
            ) : (
              <>
                <div className="empty" style={{ marginBottom: 8 }}>
                  Позиций: <b>{planRows.length}</b> | Дефицит по:{" "}
                  <b style={{ color: planTotals.deficit > 0 ? "#be123c" : "#2e7d32" }}>
                    {planTotals.deficit}
                  </b>{" "}
                  позициям
                </div>
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th>Фурнитура</th>
                      <th>Размер</th>
                      <th style={{ textAlign: "center" }}>Требуется</th>
                      <th style={{ textAlign: "center" }}>В наличии</th>
                      <th style={{ textAlign: "center" }}>Не хватает</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planRows.map((r) => {
                      const deficit = Number(r.deficit || 0);
                      return (
                        <tr key={r.hardware_item_id} style={deficit > 0 ? { background: "#fff5f5" } : { background: "#f5fff5" }}>
                          <td>{r.name || "-"}</td>
                          <td>{r.size || "-"}</td>
                          <td style={{ textAlign: "center" }}>{Number(r.required || 0)}</td>
                          <td style={{ textAlign: "center" }}>{Number(r.available || 0)}</td>
                          <td style={{ textAlign: "center" }}>
                            {deficit > 0 ? (
                              <b style={{ color: "#be123c" }}>-{deficit}</b>
                            ) : (
                              <span style={{ color: "#2e7d32" }}>хватает</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}

      {subView === "graph" && (
        <Suspense fallback={<div className="empty">Загрузка схемы…</div>}>
          <HardwareBomGraph canOperateWarehouse={canOperateWarehouse} />
        </Suspense>
      )}

      {subView === "history" && (
        <div className="sheet-table-wrap">
          {history.length === 0 ? (
            <div className="empty">Списаний пока нет</div>
          ) : (
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Заказ</th>
                  <th>Фурнитура</th>
                  <th>Размер</th>
                  <th style={{ textAlign: "center" }}>Кол-во</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.move_id}>
                    <td>{h.created_at ? new Date(h.created_at).toLocaleString("ru-RU") : "-"}</td>
                    <td>{h.order_id || "-"}</td>
                    <td>{h.name || "-"}</td>
                    <td>{h.size || "-"}</td>
                    <td style={{ textAlign: "center", color: "#be123c" }}>{Number(h.qty || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {subView === "map" && (
        <div style={{ display: "grid", gap: 10 }}>
          {canOperateWarehouse && (
            <div>
              <button
                className="mini ok"
                disabled={mapSaving}
                onClick={() =>
                  setMapDraft({ id: null, bom_product: "", section_name: "", item_name_pattern: "", sort_order: 100, is_active: true })
                }
              >
                + Добавить соответствие
              </button>
            </div>
          )}

          {mapDraft && (
            <div className="dialog-card" style={{ display: "grid", gap: 8, maxWidth: 640 }}>
              <input
                value={mapDraft.bom_product}
                placeholder="Изделие BOM (как в Excel), напр. «Стол Стабиле»"
                onChange={(e) => setMapDraft((p) => ({ ...p, bom_product: e.target.value }))}
              />
              <input
                value={mapDraft.section_name}
                placeholder="Секция плана (section_name), напр. «Stabile»"
                onChange={(e) => setMapDraft((p) => ({ ...p, section_name: e.target.value }))}
              />
              <input
                value={mapDraft.item_name_pattern}
                placeholder="ИЛИ шаблон названия (ILIKE), напр. «%Стабиле%»"
                onChange={(e) => setMapDraft((p) => ({ ...p, item_name_pattern: e.target.value }))}
              />
              <div className="actions">
                <button className="mini ok" disabled={mapSaving} onClick={() => saveMapRow(mapDraft)}>
                  {mapSaving ? "Сохраняю..." : "Сохранить"}
                </button>
                <button className="mini warn" disabled={mapSaving} onClick={() => setMapDraft(null)}>
                  Отмена
                </button>
              </div>
            </div>
          )}

          <div className="sheet-table-wrap">
            {mapRows.length === 0 ? (
              <div className="empty">Нет соответствий</div>
            ) : (
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>Изделие BOM</th>
                    <th>Секция плана</th>
                    <th>Шаблон названия</th>
                    <th style={{ textAlign: "center" }}>Активно</th>
                    {canOperateWarehouse && <th>Действие</th>}
                  </tr>
                </thead>
                <tbody>
                  {mapRows.map((r) => (
                    <tr key={r.id} style={r.is_active === false ? { opacity: 0.5 } : {}}>
                      <td>{r.bom_product}</td>
                      <td>{r.section_name || "-"}</td>
                      <td>{r.item_name_pattern || "-"}</td>
                      <td style={{ textAlign: "center" }}>{r.is_active === false ? "нет" : "да"}</td>
                      {canOperateWarehouse && (
                        <td style={{ display: "flex", gap: 4 }}>
                          <button
                            className="mini"
                            disabled={mapSaving}
                            onClick={() => setMapDraft({ ...r })}
                          >
                            Изменить
                          </button>
                          <button className="mini warn" disabled={mapSaving} onClick={() => deleteMapRow(r.id)}>
                            Удалить
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
