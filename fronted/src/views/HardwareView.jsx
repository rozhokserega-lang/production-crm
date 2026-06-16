import { Fragment, Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { OrderService } from "../services/orderService";
import { HardwarePlanView } from "./HardwarePlanView";

const HardwareBomGraph = lazy(() => import("./HardwareBomGraph"));

const SUB_VIEWS = [
  { id: "stock", label: "Склад" },
  { id: "planBoard", label: "План" },
  { id: "plan", label: "Сводка" },
  { id: "graph", label: "Схема (блупринт)" },
  { id: "history", label: "История" },
  { id: "map", label: "Соответствие" },
];

const HISTORY_PAGE = 50;

const MOVE_LABELS = {
  consume: "Списание",
  income: "Приход",
  receipt: "Приход",
  adjust: "Корректировка",
};

function num(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDeltaInput(raw) {
  const s = String(raw ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function moveTypeLabel(type) {
  return MOVE_LABELS[String(type || "").toLowerCase()] || String(type || "—");
}

function qtyColor(type, qty) {
  const t = String(type || "").toLowerCase();
  if (t === "consume" || Number(qty) < 0) return "#be123c";
  if (t === "income" || t === "receipt" || Number(qty) > 0) return "#2e7d32";
  return undefined;
}

export function HardwareView({ canOperateWarehouse = false, planWeeks = [] }) {
  const [subView, setSubView] = useState("stock");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const [stockRows, setStockRows] = useState([]);
  const [deltaDraft, setDeltaDraft] = useState({});
  const [noteDraft, setNoteDraft] = useState({});
  const [invDraft, setInvDraft] = useState({});
  const [invOpenId, setInvOpenId] = useState(0);
  const [savingId, setSavingId] = useState(0);

  const [history, setHistory] = useState([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyPage, setHistoryPage] = useState(0);

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
    const rows = await OrderService.getHardwareConsumeHistory(500);
    setHistory(Array.isArray(rows) ? rows : []);
  }, []);

  const loadMap = useCallback(async () => {
    const rows = await OrderService.getHardwareProductMap();
    setMapRows(Array.isArray(rows) ? rows : []);
  }, []);

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

  // Автовыбор первой недели плана для индикации дефицита на складе
  useEffect(() => {
    if (planKey) return;
    const weeks = (Array.isArray(planWeeks) ? planWeeks : [])
      .map((w) => String(w).trim())
      .filter(Boolean);
    if (weeks.length) setPlanKey(weeks[0]);
  }, [planWeeks, planKey]);

  // Автоматический расчёт при смене плана
  useEffect(() => {
    if (!planKey) {
      setPlanRows([]);
      return;
    }
    runPlanCalc();
  }, [planKey, planScope, runPlanCalc]);

  const planByItem = useMemo(() => {
    const map = new Map();
    for (const r of planRows) {
      map.set(Number(r.hardware_item_id), {
        required: Number(r.required || 0),
        deficit: Number(r.deficit || 0),
      });
    }
    return map;
  }, [planRows]);

  const filteredStock = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? stockRows.filter(
          (r) =>
            String(r.name || "").toLowerCase().includes(q) ||
            String(r.size || "").toLowerCase().includes(q),
        )
      : stockRows;
    return base.map((r) => {
      const plan = planByItem.get(Number(r.id));
      return {
        ...r,
        planRequired: plan?.required ?? null,
        planDeficit: plan?.deficit ?? null,
      };
    });
  }, [stockRows, query, planByItem]);

  const applyDelta = useCallback(
    async (itemId) => {
      const delta = parseDeltaInput(deltaDraft[itemId]);
      if (delta == null) return;
      setSavingId(itemId);
      setError("");
      try {
        await OrderService.addHardwareStock(itemId, delta, noteDraft[itemId] || "");
        await loadStock();
        if (subView === "history") await loadHistory();
        setDeltaDraft((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
        setNoteDraft((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      } catch (e) {
        setError(String(e?.message || e || "Ошибка применения"));
      } finally {
        setSavingId(0);
      }
    },
    [deltaDraft, noteDraft, loadStock, loadHistory, subView],
  );

  const applyInventory = useCallback(
    async (itemId) => {
      const value = invDraft[itemId];
      if (value === undefined || value === "") return;
      setSavingId(itemId);
      setError("");
      try {
        await OrderService.setHardwareStock(itemId, num(value));
        await loadStock();
        if (subView === "history") await loadHistory();
        setInvDraft((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
        setInvOpenId(0);
      } catch (e) {
        setError(String(e?.message || e || "Ошибка инвентаризации"));
      } finally {
        setSavingId(0);
      }
    },
    [invDraft, loadStock, loadHistory, subView],
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

  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter((h) => {
      const hay = [
        h.name,
        h.size,
        h.order_id,
        h.note,
        h.move_type,
        moveTypeLabel(h.move_type),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [history, historyQuery]);

  const historyPageCount = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE));
  const historySlice = useMemo(() => {
    const page = Math.min(historyPage, historyPageCount - 1);
    const start = page * HISTORY_PAGE;
    return filteredHistory.slice(start, start + HISTORY_PAGE);
  }, [filteredHistory, historyPage, historyPageCount]);

  useEffect(() => {
    setHistoryPage(0);
  }, [historyQuery]);

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

  const planToolbar = (
    <div className="hardware-stock-toolbar__controls actions">
      <select
        value={planScope}
        onChange={(e) => {
          setPlanScope(e.target.value);
          setPlanKey("");
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
      {planLoading && <span style={{ color: "#64748b", fontSize: 12 }}>Считаю…</span>}
      {planKey && !planLoading && planRows.length > 0 && (
        <span style={{ fontSize: 12, color: planTotals.deficit > 0 ? "#be123c" : "#2e7d32" }}>
          Дефицит: {planTotals.deficit} поз.
        </span>
      )}
    </div>
  );

  return (
    <div className="hardware-view">
      <div className="hardware-view__tabs tabs">
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
            className="hardware-view__search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск фурнитуры..."
          />
        )}
        {subView === "history" && (
          <input
            className="hardware-view__search"
            value={historyQuery}
            onChange={(e) => setHistoryQuery(e.target.value)}
            placeholder="Поиск: фурнитура, заказ, примечание..."
          />
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {subView === "stock" && (
        <div className="hardware-stock-panel">
          <div className="hardware-stock-toolbar">{planToolbar}</div>
          <div className="hardware-stock-wrap sheet-table-wrap">
            {!loading && filteredStock.length === 0 ? (
              <div className="empty">Нет позиций фурнитуры</div>
            ) : (
              <table className="hardware-stock-table">
                <thead>
                  <tr>
                    <th className="hw-stock-col-name">Фурнитура</th>
                    <th className="hw-stock-col-size">Размер</th>
                    <th className="hw-stock-col-num">В наличии</th>
                    {planKey && <th className="hw-stock-col-num">На план</th>}
                    {planKey && <th className="hw-stock-col-num">Не хватает</th>}
                    <th className="hw-stock-col-unit">Ед.</th>
                    {canOperateWarehouse && <th className="hw-stock-col-edit">± / прим.</th>}
                    {canOperateWarehouse && <th className="hw-stock-col-actions"> </th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.map((r) => {
                    const id = Number(r.id);
                    const busy = savingId === id;
                    const deltaVal = deltaDraft[id] ?? "";
                    const noteVal = noteDraft[id] ?? "";
                    const invVal = invDraft[id] ?? "";
                    const invOpen = invOpenId === id;
                    const deficit = r.planDeficit;
                    const rowClass =
                      deficit != null && deficit > 0
                        ? "hw-stock-row--deficit"
                        : deficit != null && deficit === 0 && r.planRequired > 0
                          ? "hw-stock-row--ok"
                          : "";
                    const stockColSpan = 4 + (planKey ? 2 : 0) + 1 + (canOperateWarehouse ? 2 : 0);
                    return (
                      <Fragment key={id}>
                        <tr className={rowClass}>
                          <td className="hw-stock-col-name" title={r.name || ""}>
                            {r.name || "-"}
                          </td>
                          <td className="hw-stock-col-size">{r.size || "-"}</td>
                          <td className="hw-stock-col-num">
                            <b className={Number(r.qty) <= 0 ? "hw-stock-qty--zero" : undefined}>{r.qty}</b>
                          </td>
                          {planKey && (
                            <td className="hw-stock-col-num">
                              {r.planRequired != null ? r.planRequired : "—"}
                            </td>
                          )}
                          {planKey && (
                            <td className="hw-stock-col-num">
                              {r.planDeficit != null ? (
                                r.planDeficit > 0 ? (
                                  <b className="hw-stock-deficit">−{r.planDeficit}</b>
                                ) : (
                                  <span className="hw-stock-ok">ок</span>
                                )
                              ) : (
                                "—"
                              )}
                            </td>
                          )}
                          <td className="hw-stock-col-unit">{r.unit || "шт"}</td>
                          {canOperateWarehouse && (
                            <td className="hw-stock-col-edit">
                              <div className="hw-stock-edit">
                                <input
                                  className="hw-stock-input hw-stock-input--delta"
                                  value={deltaVal}
                                  inputMode="decimal"
                                  placeholder="±"
                                  disabled={busy}
                                  title="Приход (+) или расход (−)"
                                  onChange={(e) =>
                                    setDeltaDraft((prev) => ({
                                      ...prev,
                                      [id]: e.target.value.replace(/[^0-9+.,-]/g, ""),
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") applyDelta(id);
                                  }}
                                />
                                <input
                                  className="hw-stock-input hw-stock-input--note"
                                  value={noteVal}
                                  placeholder="прим."
                                  disabled={busy}
                                  title="Примечание к движению"
                                  onChange={(e) =>
                                    setNoteDraft((prev) => ({ ...prev, [id]: e.target.value }))
                                  }
                                />
                              </div>
                            </td>
                          )}
                          {canOperateWarehouse && (
                            <td className="hw-stock-col-actions">
                              <div className="hw-stock-actions">
                                <button
                                  type="button"
                                  className="hw-stock-btn hw-stock-btn--ok"
                                  disabled={busy || parseDeltaInput(deltaVal) == null}
                                  onClick={() => applyDelta(id)}
                                  title="Применить приход/расход"
                                >
                                  {busy ? "…" : "✓"}
                                </button>
                                <button
                                  type="button"
                                  className="hw-stock-btn hw-stock-btn--ghost"
                                  disabled={busy}
                                  title="Инвентаризация — установить точный остаток"
                                  onClick={() => {
                                    setInvOpenId(invOpen ? 0 : id);
                                    if (!invOpen) setInvDraft((prev) => ({ ...prev, [id]: String(r.qty) }));
                                  }}
                                >
                                  {invOpen ? "×" : "≡"}
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                        {canOperateWarehouse && invOpen && (
                          <tr className="hw-stock-inv-row">
                            <td colSpan={stockColSpan}>
                              <div className="hw-stock-inv">
                                <span className="hw-stock-inv__label">Инвент.:</span>
                                <input
                                  className="hw-stock-input hw-stock-input--inv"
                                  value={invVal}
                                  inputMode="decimal"
                                  disabled={busy}
                                  onChange={(e) =>
                                    setInvDraft((prev) => ({
                                      ...prev,
                                      [id]: e.target.value.replace(/[^0-9.,]/g, ""),
                                    }))
                                  }
                                />
                                <button
                                  type="button"
                                  className="hw-stock-btn hw-stock-btn--warn"
                                  disabled={busy || invVal === ""}
                                  onClick={() => applyInventory(id)}
                                >
                                  OK
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {canOperateWarehouse && (
            <div className="hardware-stock-hint empty">
              ±кол-во («+10», «-5») → <b>✓</b>. <b>≡</b> — инвентаризация (точный остаток).
            </div>
          )}
        </div>
      )}

      {subView === "planBoard" && <HardwarePlanView planWeeks={planWeeks} />}

      {subView === "plan" && (
        <div style={{ display: "grid", gap: 10 }}>
          {planToolbar}
          <div className="sheet-table-wrap">
            {!planKey ? (
              <div className="empty">Выберите план — расчёт запустится автоматически</div>
            ) : planRows.length === 0 ? (
              <div className="empty">{planLoading ? "Расчёт..." : "Нет потребности по выбранному плану"}</div>
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
                        <tr
                          key={r.hardware_item_id}
                          style={deficit > 0 ? { background: "#fff5f5" } : { background: "#f5fff5" }}
                        >
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
        <div style={{ display: "grid", gap: 8 }}>
          <div className="sheet-table-wrap">
            {history.length === 0 ? (
              <div className="empty">Движений пока нет</div>
            ) : filteredHistory.length === 0 ? (
              <div className="empty">Ничего не найдено по запросу</div>
            ) : (
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Тип</th>
                    <th>Заказ</th>
                    <th>Фурнитура</th>
                    <th>Размер</th>
                    <th style={{ textAlign: "center" }}>Кол-во</th>
                    <th>Примечание</th>
                  </tr>
                </thead>
                <tbody>
                  {historySlice.map((h) => (
                    <tr key={h.move_id}>
                      <td>{h.created_at ? new Date(h.created_at).toLocaleString("ru-RU") : "-"}</td>
                      <td style={{ fontSize: 12 }}>{moveTypeLabel(h.move_type)}</td>
                      <td>{h.order_id || "—"}</td>
                      <td>{h.name || "-"}</td>
                      <td>{h.size || "-"}</td>
                      <td style={{ textAlign: "center", color: qtyColor(h.move_type, h.qty), fontWeight: 700 }}>
                        {Number(h.qty) > 0 ? `+${h.qty}` : h.qty}
                      </td>
                      <td style={{ fontSize: 12, color: "#64748b" }}>{h.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {filteredHistory.length > HISTORY_PAGE && (
            <div className="actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                className="mini"
                disabled={historyPage <= 0}
                onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
              >
                ← Назад
              </button>
              <span style={{ fontSize: 12, color: "#64748b" }}>
                {historyPage + 1} / {historyPageCount} ({filteredHistory.length} записей)
              </span>
              <button
                className="mini"
                disabled={historyPage >= historyPageCount - 1}
                onClick={() => setHistoryPage((p) => Math.min(historyPageCount - 1, p + 1))}
              >
                Вперёд →
              </button>
            </div>
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
                  setMapDraft({
                    id: null,
                    bom_product: "",
                    section_name: "",
                    item_name_pattern: "",
                    sort_order: 100,
                    is_active: true,
                  })
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
                          <button className="mini" disabled={mapSaving} onClick={() => setMapDraft({ ...r })}>
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
