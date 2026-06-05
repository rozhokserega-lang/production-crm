import { useCallback, useEffect, useMemo, useState } from "react";
import { OrderService } from "../services/orderService";

function rowKey(r) {
  return `${r.source_row_id}|${r.source_col_id}|${r.week}`;
}

function statusLabel(row) {
  if (!row.hardware_mapped) return "—";
  if (row.hardware_ok) return "✅";
  return `❌ ${row.hardware_deficit_items}`;
}

function statusTitle(row) {
  if (!row.hardware_mapped) return "Нет схемы BOM";
  if (row.hardware_ok) return "Фурнитуры хватает";
  return `Не хватает: ${row.hardware_deficit_items} поз.`;
}

function shortOrderId(id) {
  const s = String(id || "").trim();
  if (!s) return "—";
  if (s.length <= 10) return s;
  return `${s.slice(0, 7)}…`;
}

export function HardwarePlanView({ planWeeks = [] }) {
  const [planScope, setPlanScope] = useState("shipment");
  const [planKey, setPlanKey] = useState("");
  const [overviewMonths, setOverviewMonths] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [hiddenGroups, setHiddenGroups] = useState({});
  const [selectedKey, setSelectedKey] = useState("");
  const [detail, setDetail] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const weeks = useMemo(() => {
    const list = (Array.isArray(planWeeks) ? planWeeks : [])
      .map((w) => String(w).trim())
      .filter(Boolean);
    return [...new Set(list)];
  }, [planWeeks]);

  const planKeyOptions = useMemo(() => {
    if (planScope === "overview") {
      return overviewMonths.map((m) => ({ value: String(m.id), label: m.name }));
    }
    return weeks.map((w) => ({ value: w, label: `План ${w}` }));
  }, [planScope, overviewMonths, weeks]);

  useEffect(() => {
    OrderService.getOverviewPlanMonths()
      .then((rows) => setOverviewMonths(Array.isArray(rows) ? rows : []))
      .catch(() => setOverviewMonths([]));
  }, []);

  useEffect(() => {
    if (planKey) return;
    const first = planKeyOptions[0]?.value;
    if (first) setPlanKey(first);
  }, [planKey, planKeyOptions]);

  const loadBoard = useCallback(async () => {
    if (!planKey) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await OrderService.getHardwarePlanBoard(planScope, planKey);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(String(e?.message || e || "Ошибка загрузки плана"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [planScope, planKey]);

  useEffect(() => {
    setSelectedKey("");
    loadBoard();
  }, [loadBoard]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [r.item, r.material, r.section_name, r.order_id, r.week].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  const groupNames = useMemo(() => {
    const names = [];
    const seen = new Set();
    for (const r of filteredRows) {
      const g = String(r.section_name || "Прочее");
      if (seen.has(g)) continue;
      seen.add(g);
      names.push(g);
    }
    return names;
  }, [filteredRows]);

  const selectedRow = useMemo(
    () => filteredRows.find((r) => rowKey(r) === selectedKey) || null,
    [filteredRows, selectedKey],
  );

  const loadDetail = useCallback(async (row) => {
    if (!row) {
      setDetail([]);
      return;
    }
    setDetailLoading(true);
    try {
      const orderId = String(row.order_id || "").trim();
      let lines = [];
      if (orderId) {
        const opts = await OrderService.getHardwareConsumeOptions(orderId);
        lines = (Array.isArray(opts) ? opts : []).map((x) => ({
          hardware_item_id: x.hardware_item_id,
          name: x.name,
          size: x.size,
          unit: x.unit,
          required: Number(x.suggested_qty || 0),
          available: Number(x.available || 0),
          deficit: Math.max(0, Number(x.suggested_qty || 0) - Number(x.available || 0)),
        }));
      } else {
        const req = await OrderService.getHardwareItemRequirement(
          row.section_name,
          row.item,
          Number(row.qty || 0),
        );
        lines = Array.isArray(req) ? req : [];
      }
      setDetail(lines);
    } catch (e) {
      setError(String(e?.message || e || "Ошибка расчёта фурнитуры"));
      setDetail([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedRow) {
      setDetail([]);
      return;
    }
    loadDetail(selectedRow);
  }, [selectedRow, loadDetail]);

  const planStats = useMemo(() => {
    let mapped = 0;
    let deficit = 0;
    for (const r of filteredRows) {
      if (!r.hardware_mapped) continue;
      mapped += 1;
      if (!r.hardware_ok) deficit += 1;
    }
    return { mapped, deficit, total: filteredRows.length };
  }, [filteredRows]);

  const detailDeficits = useMemo(
    () => detail.filter((x) => Number(x.deficit || 0) > 0),
    [detail],
  );

  const planLabel = planKeyOptions.find((o) => o.value === planKey)?.label || planKey;

  return (
    <div className="hardware-plan-layout">
      <aside className="hardware-plan-detail-pane">
        {selectedRow ? (
          <div className="selection-summary">
            <div className="selection-summary-title">Фурнитура для заказа:</div>
            <div className="selection-summary-item">
              <div>
                <b>{selectedRow.item}</b>
              </div>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                {selectedRow.section_name} • план {selectedRow.week} • {selectedRow.qty} шт.
              </div>
              {selectedRow.order_id && (
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  Заказ: <b>{selectedRow.order_id}</b>
                </div>
              )}
            </div>
            {detailLoading ? (
              <div style={{ fontSize: 13, color: "#64748b" }}>Считаю фурнитуру…</div>
            ) : !selectedRow.hardware_mapped ? (
              <div style={{ fontSize: 13, color: "#9ca3af" }}>
                Нет соответствия BOM для этого изделия. Настройте вкладку «Соответствие» или схему.
              </div>
            ) : detail.length === 0 ? (
              <div style={{ fontSize: 13, color: "#9ca3af" }}>Фурнитура не требуется</div>
            ) : (
              <>
                {detail.map((x) => {
                  const deficit = Number(x.deficit || 0);
                  return (
                    <div key={x.hardware_item_id} className="selection-summary-item">
                      <div>
                        {x.name}
                        {x.size ? ` (${x.size})` : ""}
                      </div>
                      <div style={{ fontSize: 13, color: deficit > 0 ? "#be123c" : "#2e7d32" }}>
                        нужно {Number(x.required || 0)}, в наличии {Number(x.available || 0)}
                        {deficit > 0 ? `, не хватает ${deficit}` : ", хватает"}
                      </div>
                    </div>
                  );
                })}
                {detailDeficits.length > 0 && (
                  <div className="selection-summary-title" style={{ marginTop: 10, color: "#be123c" }}>
                    Дефицит: {detailDeficits.length} поз.
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="selection-summary placeholder">
            Выберите строку в плане — покажем фурнитуру и остатки
          </div>
        )}
      </aside>

      <div className="hardware-plan-main">
        <div className="actions" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={planScope}
            onChange={(e) => {
              setPlanScope(e.target.value);
              setPlanKey("");
            }}
          >
            <option value="shipment">Неделя</option>
            <option value="overview">Месяц</option>
          </select>
          <select value={planKey} onChange={(e) => setPlanKey(e.target.value)}>
            <option value="">
              {planScope === "overview" ? "— выберите месяц —" : "— выберите неделю —"}
            </option>
            {planKeyOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск изделия, заказа..."
            style={{ minWidth: 200 }}
          />
          {planKey && !loading && (
            <span style={{ fontSize: 12, color: planStats.deficit > 0 ? "#be123c" : "#64748b" }}>
              {planLabel}: {planStats.total} поз. | с фурнитурой: {planStats.mapped} | дефицит:{" "}
              {planStats.deficit}
            </span>
          )}
          <button className="mini" disabled={loading || !planKey} onClick={loadBoard}>
            {loading ? "…" : "Обновить"}
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        {!planKey ? (
          <div className="empty">
            {planScope === "overview" ? "Выберите месяц" : "Выберите неделю плана"}
          </div>
        ) : loading ? (
          <div className="empty">Загрузка плана…</div>
        ) : filteredRows.length === 0 ? (
          <div className="empty">
            {planScope === "overview"
              ? "Нет позиций в плане на выбранный месяц"
              : "Нет позиций в плане на эту неделю"}
          </div>
        ) : (
          <div className="sheet-table-wrap hardware-plan-table-wrap">
            <table className="sheet-table hardware-plan-table">
              <thead>
                <tr>
                  <th className="hw-col-item">Изделие</th>
                  <th className="hw-col-material">Материал</th>
                  <th className="hw-col-narrow">План</th>
                  <th className="hw-col-narrow">Кол-во</th>
                  <th className="hw-col-order">Заказ</th>
                  <th className="hw-col-status">Статус</th>
                </tr>
              </thead>
              <tbody>
                {groupNames.flatMap((groupName) => {
                  const hidden = !!hiddenGroups[groupName];
                  const groupRows = filteredRows.filter(
                    (r) => String(r.section_name || "Прочее") === groupName,
                  );
                  const out = [
                    <tr
                      key={`section-${groupName}`}
                      className={`shipment-plan-group-row${hidden ? " shipment-plan-group-row--collapsed" : ""}`}
                    >
                      <td colSpan={6}>
                        <button
                          type="button"
                          className="shipment-plan-group-toggle"
                          onClick={() =>
                            setHiddenGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }))
                          }
                        >
                          <span className="shipment-plan-group-marker">{hidden ? "▸" : "▾"}</span>
                          <span className="shipment-plan-group-title">{groupName}</span>
                          <span className="section-count" style={{ marginLeft: 8 }}>
                            {groupRows.length}
                          </span>
                        </button>
                      </td>
                    </tr>,
                  ];
                  if (hidden) return out;
                  for (const row of groupRows) {
                    const key = rowKey(row);
                    const isSelected = selectedKey === key;
                    const showDeficit = row.hardware_mapped && !row.hardware_ok;
                    const rowBg = showDeficit ? "#fbcfe8" : isSelected ? "#e0f2fe" : undefined;
                    out.push(
                      <tr
                        key={key}
                        className={isSelected ? "selected-row" : ""}
                        style={{ backgroundColor: rowBg, cursor: "pointer" }}
                        onClick={() => setSelectedKey(key)}
                      >
                        <td className="hw-col-item" title={row.item}>
                          {row.item}
                        </td>
                        <td className="hw-col-material" title={row.material || ""}>
                          {row.material || "—"}
                        </td>
                        <td className="hw-col-narrow">{row.week}</td>
                        <td className="hw-col-narrow">{row.qty}</td>
                        <td className="hw-col-order" title={row.order_id || ""}>
                          {shortOrderId(row.order_id)}
                        </td>
                        <td className="hw-col-status" title={statusTitle(row)}>
                          {statusLabel(row)}
                        </td>
                      </tr>,
                    );
                  }
                  return out;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
