import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { buildLaborFactPayload } from "../app/laborImportHelpers";
import { buildProductionLoadForecast } from "../app/laborForecastHelpers";
import {
  LABOR_GROUP_ORDER,
  normalizeLaborNormRow,
  sortLaborGroups,
} from "../app/laborGroupHelpers";
import { STRAP_OPTIONS } from "../app/appConstants";
import { OrderService } from "../services/orderService";
import { LaborOrderCalculator } from "../components/LaborOrderCalculator";
import { LaborKitBuilder } from "../components/LaborKitBuilder";
import { calcGroupPlanLabor, normalizeKitItem } from "../app/laborKitPlanner";
import { LaborPlanSummary } from "../components/LaborPlanSummary";

function formatHhMm(totalMin) {
  const safe = Math.max(0, Number(totalMin || 0));
  const hours = Math.floor(safe / 60);
  const minutes = Math.round(safe % 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

const CAPACITY_STORAGE_KEY = "labor_planner_capacity_v1";
const isImportedLaborRow = (row) =>
  Boolean(row?.importedLocal) || /^import-/i.test(String(row?.orderId || "").trim());
const FORECAST_STATUS_LABELS = {
  ok: "Свободно",
  warn: "Плотно",
  over: "Перегруз",
};

function parseMinInput(v) {
  const n = Number(String(v ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function LaborRowMinutesAdmin({ row, disabled, onSave }) {
  const [pilka, setPilka] = useState(() => String(row?.pilkaMin ?? ""));
  const [kromka, setKromka] = useState(() => String(row?.kromkaMin ?? ""));
  const [pras, setPras] = useState(() => String(row?.prasMin ?? ""));
  useEffect(() => {
    setPilka(String(row?.pilkaMin ?? ""));
    setKromka(String(row?.kromkaMin ?? ""));
    setPras(String(row?.prasMin ?? ""));
  }, [row?.pilkaMin, row?.kromkaMin, row?.prasMin, row?.orderId, row?.item]);

  const assembly = Number(row?.assemblyMin || 0);
  const totalLocal = parseMinInput(pilka) + parseMinInput(kromka) + parseMinInput(pras) + assembly;
  const inp = { width: 76, padding: "4px 6px", boxSizing: "border-box" };

  const commit = () => {
    const p = parseMinInput(pilka);
    const k = parseMinInput(kromka);
    const r0 = parseMinInput(pras);
    if (
      p === Number(row?.pilkaMin || 0) &&
      k === Number(row?.kromkaMin || 0) &&
      r0 === Number(row?.prasMin || 0)
    ) {
      return;
    }
    onSave({ pilkaMin: p, kromkaMin: k, prasMin: r0 });
  };

  return (
    <>
      <td>
        <input style={inp} type="number" min={0} step={1} value={pilka} onChange={(e) => setPilka(e.target.value)} onBlur={commit} disabled={disabled} />
      </td>
      <td>
        <input style={inp} type="number" min={0} step={1} value={kromka} onChange={(e) => setKromka(e.target.value)} onBlur={commit} disabled={disabled} />
      </td>
      <td>
        <input style={inp} type="number" min={0} step={1} value={pras} onChange={(e) => setPras(e.target.value)} onBlur={commit} disabled={disabled} />
      </td>
      <td><b>{Math.round(totalLocal)}</b></td>
    </>
  );
}

export const LaborView = memo(function LaborView({
  labor,
  permissions,
  shell,
}) {
  const {
    laborSubView,
    laborTableRows,
    laborOrdersRows,
    laborPlannerRows,
    laborPlannerQtyByGroup,
    setLaborPlannerQtyByGroup,
    laborStageTimelineRows,
    laborSaveSelected,
    setLaborSaveSelected,
    laborSavingByKey,
    laborSavedByKey,
    saveImportedLaborRowToDb,
    manualLaborOpenNonce = 0,
    workSchedule,
    laborNormsRows,
    setLaborNormsRows,
  } = labor;
  const {
    setError,
    loading,
    load = async () => {},
  } = shell;
  const { canAdminSettings = false } = permissions;

  const [plannerMode, setPlannerMode] = useState("groups");
  const [kitQtyByKey, setKitQtyByKey] = useState({});
  const [savedKits, setSavedKits] = useState([]);
  const [kitSavingId, setKitSavingId] = useState("");
  const [kitDeletingId, setKitDeletingId] = useState("");
  const [kromkaPosts, setKromkaPosts] = useState(2);
  const [prasPosts, setPrasPosts] = useState(2);
  const [normDraft, setNormDraft] = useState({
    id: null,
    groupName: "",
    pilkaMin: "",
    kromkaMin: "",
    prasMin: "",
    assemblyMin: "",
    qtyUnit: "1",
    note: "",
  });
  const [normSaving, setNormSaving] = useState(false);
  const [normDeletingId, setNormDeletingId] = useState(null);
  const laborTotalRows = useMemo(
    () => laborTableRows.filter((r) => !isImportedLaborRow(r)),
    [laborTableRows],
  );
  const laborForecastRows = useMemo(
    () =>
      buildProductionLoadForecast({
        laborTableRows,
        workSchedule,
        stationMultipliers: {
          kromka: Math.max(1, Number(kromkaPosts || 1)),
          pras: Math.max(1, Number(prasPosts || 1)),
        },
      }),
    [kromkaPosts, laborTableRows, prasPosts, workSchedule],
  );

  const [laborAdminSavingKey, setLaborAdminSavingKey] = useState("");
  const saveLaborMinutes = useCallback(
    async (row, updates) => {
      const key = `${String(row?.orderId || "").trim()}::${String(row?.item || "").trim()}`;
      setLaborAdminSavingKey(key);
      if (setError) setError("");
      try {
        await OrderService.upsertLaborFact(buildLaborFactPayload({ ...row, ...updates }));
        await load();
      } catch (e) {
        if (setError) setError(String(e?.message || e || "Не удалось сохранить трудоемкость"));
      } finally {
        setLaborAdminSavingKey("");
      }
    },
    [load, setError],
  );

  const [manualLaborOpen, setManualLaborOpen] = useState(false);
  const [manualOrderId, setManualOrderId] = useState("");
  const [manualItem, setManualItem] = useState("");
  const [manualWeek, setManualWeek] = useState("");
  const [manualQty, setManualQty] = useState("1");
  const [manualPilka, setManualPilka] = useState("");
  const [manualKromka, setManualKromka] = useState("");
  const [manualPras, setManualPras] = useState("");
  const [manualAssembly, setManualAssembly] = useState("");
  const [manualSaving, setManualSaving] = useState(false);

  const laborManualOrderOptions = useMemo(() => {
    const set = new Set();
    (Array.isArray(laborTableRows) ? laborTableRows : []).forEach((r) => {
      const id = String(r?.orderId || "").trim();
      if (id) set.add(id);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [laborTableRows]);

  const laborManualItemOptions = useMemo(() => {
    const set = new Set();
    (Array.isArray(laborTableRows) ? laborTableRows : []).forEach((r) => {
      const it = String(r?.item || "").trim();
      if (it) set.add(it);
    });
    (Array.isArray(STRAP_OPTIONS) ? STRAP_OPTIONS : []).forEach((x) => {
      const it = String(x || "").trim();
      if (it) set.add(it);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [laborTableRows]);

  const openManualLaborDialog = () => {
    setManualLaborOpen(true);
    if (!manualOrderId && laborManualOrderOptions.length) setManualOrderId(laborManualOrderOptions[0]);
    if (!manualItem && laborManualItemOptions.length) setManualItem(laborManualItemOptions[0]);
    if (!manualQty) setManualQty("1");
  };

  useEffect(() => {
    if (!canAdminSettings) return;
    if (!manualLaborOpenNonce) return;
    openManualLaborDialog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualLaborOpenNonce]);

  const saveManualLaborRow = useCallback(async () => {
    const orderId = String(manualOrderId || "").trim();
    const item = String(manualItem || "").trim();
    if (!orderId || !item) return;
    setManualSaving(true);
    if (setError) setError("");
    try {
      await OrderService.upsertLaborFact(
        buildLaborFactPayload({
          orderId,
          item,
          week: String(manualWeek || "").trim(),
          qty: parseMinInput(manualQty || 0),
          pilkaMin: parseMinInput(manualPilka || 0),
          kromkaMin: parseMinInput(manualKromka || 0),
          prasMin: parseMinInput(manualPras || 0),
          assemblyMin: parseMinInput(manualAssembly || 0),
          dateFinished: null,
        }),
      );
      await load();
      setManualLaborOpen(false);
    } catch (e) {
      if (setError) setError(String(e?.message || e || "Не удалось сохранить трудоемкость"));
    } finally {
      setManualSaving(false);
    }
  }, [
    load,
    manualAssembly,
    manualItem,
    manualKromka,
    manualOrderId,
    manualPilka,
    manualPras,
    manualQty,
    manualWeek,
    setError,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CAPACITY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const nextKromka = Number(parsed?.kromkaPosts);
      const nextPras = Number(parsed?.prasPosts);
      if (Number.isFinite(nextKromka) && nextKromka > 0) setKromkaPosts(nextKromka);
      if (Number.isFinite(nextPras) && nextPras > 0) setPrasPosts(nextPras);
    } catch (_) {
      // ignore invalid local storage
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        CAPACITY_STORAGE_KEY,
        JSON.stringify({
          kromkaPosts: Math.max(1, Number(kromkaPosts || 1)),
          prasPosts: Math.max(1, Number(prasPosts || 1)),
        }),
      );
    } catch (_) {
      // ignore storage issues
    }
  }, [kromkaPosts, prasPosts]);

  const reloadLaborNorms = useCallback(async () => {
    const rows = await OrderService.getLaborNorms();
    const normalized = (Array.isArray(rows) ? rows : []).map((row) => normalizeLaborNormRow(row));
    setLaborNormsRows(normalized);
    return normalized;
  }, [setLaborNormsRows]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reloadLaborNorms();
      } catch (e) {
        if (!cancelled && setError) setError(String(e?.message || e || "Не удалось загрузить нормативы"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadLaborNorms, setError]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await OrderService.getLaborKits();
        if (cancelled) return;
        const normalized = (Array.isArray(rows) ? rows : [])
          .map((k) => ({
            id: `db-${String(k?.id || "").trim()}`,
            dbId: Number(k?.id || 0),
            dbSaved: true,
            name: String(k?.kit_name || k?.name || "").trim(),
            items: Array.isArray(k?.items)
              ? k.items
                  .map((x) => {
                    if (typeof x === "string") {
                      const group = String(x || "").trim();
                      return group ? normalizeKitItem({ group, qty: 1 }) : null;
                    }
                    return normalizeKitItem(x);
                  })
                  .filter((item) => item?.group)
              : [],
          }))
          .filter((k) => k.dbId > 0 && k.name && k.items.length > 0);
        setSavedKits(normalized);
      } catch (e) {
        if (!cancelled && setError) setError(String(e?.message || e || "Не удалось загрузить комплекты"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setError]);

  const normGroupOptions = useMemo(() => {
    const set = new Set(LABOR_GROUP_ORDER);
    laborOrdersRows.forEach((row) => {
      if (row?.group) set.add(row.group);
    });
    (laborNormsRows || []).forEach((row) => {
      if (row?.groupName) set.add(row.groupName);
    });
    return [...set].sort(sortLaborGroups);
  }, [laborOrdersRows, laborNormsRows]);
  const resetNormDraft = useCallback(() => {
    setNormDraft({
      id: null,
      groupName: "",
      pilkaMin: "",
      kromkaMin: "",
      prasMin: "",
      assemblyMin: "",
      qtyUnit: "1",
      note: "",
    });
  }, []);
  const editNormRow = useCallback((row) => {
    setNormDraft({
      id: row?.id || null,
      groupName: String(row?.groupName || ""),
      pilkaMin: String(row?.pilkaMin ?? ""),
      kromkaMin: String(row?.kromkaMin ?? ""),
      prasMin: String(row?.prasMin ?? ""),
      assemblyMin: String(row?.assemblyMin ?? ""),
      qtyUnit: String(row?.qtyUnit ?? 1),
      note: String(row?.note || ""),
    });
  }, []);
  const saveNormDraft = useCallback(async () => {
    const groupName = String(normDraft.groupName || "").trim();
    if (!groupName) {
      setError?.("Укажите группу изделия");
      return;
    }
    setNormSaving(true);
    try {
      await OrderService.upsertLaborNorm({
        id: normDraft.id,
        groupName,
        pilkaMin: parseMinInput(normDraft.pilkaMin),
        kromkaMin: parseMinInput(normDraft.kromkaMin),
        prasMin: parseMinInput(normDraft.prasMin),
        assemblyMin: parseMinInput(normDraft.assemblyMin),
        qtyUnit: Math.max(1, parseMinInput(normDraft.qtyUnit) || 1),
        note: normDraft.note,
      });
      await reloadLaborNorms();
      resetNormDraft();
    } catch (e) {
      setError?.(String(e?.message || e || "Не удалось сохранить норматив"));
    } finally {
      setNormSaving(false);
    }
  }, [normDraft, reloadLaborNorms, resetNormDraft, setError]);
  const deleteNormRow = useCallback(async (id) => {
    const normId = Number(id || 0);
    if (!normId) return;
    setNormDeletingId(normId);
    try {
      await OrderService.deleteLaborNorm(normId);
      await reloadLaborNorms();
      if (Number(normDraft.id || 0) === normId) resetNormDraft();
    } catch (e) {
      setError?.(String(e?.message || e || "Не удалось удалить норматив"));
    } finally {
      setNormDeletingId(null);
    }
  }, [normDraft.id, reloadLaborNorms, resetNormDraft, setError]);
  const saveKitToDb = async (kit) => {
    setKitSavingId(kit.id);
    try {
      const payload = await OrderService.upsertLaborKit({
        id: kit.dbId || null,
        name: kit.name,
        items: kit.items,
      });
      const row = Array.isArray(payload) ? payload[0] : payload;
      const dbId = Number(row?.id || 0);
      setSavedKits((prev) =>
        prev.map((x) => (x.id === kit.id ? { ...x, dbId: dbId > 0 ? dbId : x.dbId, dbSaved: dbId > 0 } : x)),
      );
    } catch (e) {
      if (setError) setError(String(e?.message || e || "Не удалось сохранить комплект"));
    } finally {
      setKitSavingId("");
    }
  };

  const removeSavedKit = async (kit) => {
    if (kit.dbId) {
      setKitDeletingId(kit.id);
      try {
        await OrderService.deleteLaborKit(kit.dbId);
      } catch (e) {
        if (setError) setError(String(e?.message || e || "Не удалось удалить комплект"));
        setKitDeletingId("");
        return;
      }
      setKitDeletingId("");
    }
    const kitId = kit.id;
    setSavedKits((prev) => prev.filter((k) => k.id !== kitId));
    setKitQtyByKey((prev) => {
      const next = { ...prev };
      delete next[kitId];
      return next;
    });
  };

  return (
    <>
      {laborSubView === "total" && !laborTotalRows.length && !loading && <div className="empty">Нет данных по трудоемкости</div>}
      {laborSubView === "total" && laborTotalRows.length > 0 && (
        <div className="sheet-table-wrap">
          <table className="sheet-table">
            <thead>
              <tr>
                <th>ID заказа</th>
                <th>Изделие</th>
                <th>План</th>
                <th>Кол-во</th>
                <th>Пилка (мин)</th>
                <th>Кромка (мин)</th>
                <th>Присадка (мин)</th>
                <th>Итого (мин)</th>
                <th>Дата завершения</th>
                <th>Сохранить в БД</th>
              </tr>
            </thead>
            <tbody>
              {laborTotalRows.map((r) => (
                <tr key={`${r.orderId}-${r.item}-${r.importKey || "db"}`}>
                  <td>{r.orderId || "-"}</td>
                  <td>{r.item}</td>
                  <td>{r.week || "-"}</td>
                  <td>{r.qty}</td>
                  {canAdminSettings ? (
                    <LaborRowMinutesAdmin
                      row={r}
                      disabled={loading || laborAdminSavingKey === `${String(r?.orderId || "").trim()}::${String(r?.item || "").trim()}`}
                      onSave={(u) => void saveLaborMinutes(r, u)}
                    />
                  ) : (
                    <>
                      <td>{r.pilkaMin}</td>
                      <td>{r.kromkaMin}</td>
                      <td>{r.prasMin}</td>
                      <td><b>{r.totalMin}</b></td>
                    </>
                  )}
                  <td>{r.dateFinished || "-"}</td>
                  <td>
                    {r.importedLocal && r.importKey ? (
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={Boolean(laborSaveSelected[r.importKey])}
                          disabled={Boolean(laborSavingByKey[r.importKey]) || Boolean(laborSavedByKey[r.importKey])}
                          onChange={(e) => {
                            const checked = Boolean(e.target.checked);
                            setLaborSaveSelected((prev) => ({ ...prev, [r.importKey]: checked }));
                            if (checked) void saveImportedLaborRowToDb(r);
                          }}
                        />
                        <span>
                          {laborSavedByKey[r.importKey]
                            ? "Сохранено"
                            : laborSavingByKey[r.importKey]
                              ? "Сохраняю..."
                              : "Сохранить"}
                        </span>
                      </label>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {laborSubView === "forecast" && !laborForecastRows.length && !loading && (
        <div className="empty">Нет данных для прогноза загрузки</div>
      )}
      {laborSubView === "forecast" && laborForecastRows.length > 0 && (
        <div className="labor-forecast">
          <div className="labor-forecast__toolbar">
            <div>
              <b>Мощность недели</b>
              <span>
                {laborForecastRows[0]?.capacity?.workingDaysCount || 5} дн. x {laborForecastRows[0]?.capacity?.hoursPerDay || 8} ч
              </span>
            </div>
            <label>
              <span>Кромка</span>
              <input
                type="number"
                min="1"
                step="1"
                value={kromkaPosts}
                onChange={(e) => setKromkaPosts(Math.max(1, Number(e.target.value || 1)))}
              />
            </label>
            <label>
              <span>Присадка</span>
              <input
                type="number"
                min="1"
                step="1"
                value={prasPosts}
                onChange={(e) => setPrasPosts(Math.max(1, Number(e.target.value || 1)))}
              />
            </label>
          </div>
          <div className="labor-forecast__weeks">
            {laborForecastRows.map((weekRow) => (
              <section
                key={`labor-forecast-${weekRow.week}`}
                className={`labor-forecast-week labor-forecast-week--${weekRow.status}`}
              >
                <div className="labor-forecast-week__head">
                  <div>
                    <h3>Неделя {weekRow.week}</h3>
                    <p>{weekRow.ordersCount} заказов, {weekRow.qty} шт, {weekRow.totalHhmm}</p>
                  </div>
                  <span className={`labor-forecast-status labor-forecast-status--${weekRow.status}`}>
                    {FORECAST_STATUS_LABELS[weekRow.status] || weekRow.status}
                  </span>
                </div>
                <div className="labor-forecast-stages">
                  {weekRow.stages.map((stage) => (
                    <div
                      key={`${weekRow.week}-${stage.key}`}
                      className={`labor-forecast-stage labor-forecast-stage--${stage.status}`}
                    >
                      <div className="labor-forecast-stage__top">
                        <span>{stage.label}</span>
                        <b>{stage.hhmm}</b>
                      </div>
                      <div className="labor-forecast-stage__bar">
                        <span style={{ width: `${Math.min(140, Math.max(2, stage.loadPct))}%` }} />
                      </div>
                      <div className="labor-forecast-stage__meta">
                        <span>{stage.loadPct}%</span>
                        <span>план {formatHhMm(stage.capacity)}</span>
                        {stage.over > 0 ? (
                          <span>перегруз {formatHhMm(stage.over)}</span>
                        ) : (
                          <span>свободно {formatHhMm(stage.free)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {weekRow.overloadedStages.length > 0 && (
                  <div className="labor-forecast-alert">
                    Перегруз: {weekRow.overloadedStages.map((stage) => stage.label).join(", ")}
                  </div>
                )}
                <div className="labor-forecast-orders">
                  {weekRow.topOrders.map((order) => (
                    <span key={`${weekRow.week}-${order.orderId || order.item}-${order.totalMin}`}>
                      {order.orderId ? `#${order.orderId}: ` : ""}
                      {order.item || "-"} ({order.hhmm})
                    </span>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
      {manualLaborOpen && (
        <div className="dialog-backdrop">
          <div className="dialog-card">
            <h3 style={{ marginTop: 0 }}>Добавить трудоёмкость вручную</h3>
            <div className="line2" style={{ marginBottom: 10 }}>
              Выберите заказ и изделие (или обвязку), задайте минуты по этапам и сохраните в БД.
            </div>
            <div className="strap-grid">
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>ID заказа</label>
                <div>
                  <input
                    value={manualOrderId}
                    onChange={(e) => setManualOrderId(e.target.value)}
                    placeholder="Например: 12345"
                    list="labor-manual-orders"
                  />
                  <datalist id="labor-manual-orders">
                    {laborManualOrderOptions.map((x) => (
                      <option key={x} value={x} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Изделие / обвязка</label>
                <div>
                  <input
                    value={manualItem}
                    onChange={(e) => setManualItem(e.target.value)}
                    placeholder="Например: Обвязка 1000_80"
                    list="labor-manual-items"
                  />
                  <datalist id="labor-manual-items">
                    {laborManualItemOptions.map((x) => (
                      <option key={x} value={x} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>План (неделя)</label>
                <input value={manualWeek} onChange={(e) => setManualWeek(e.target.value)} placeholder="Например: 71" />
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Кол-во</label>
                <input inputMode="numeric" value={manualQty} onChange={(e) => setManualQty(e.target.value)} placeholder="1" />
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Пилка (мин)</label>
                <input inputMode="numeric" value={manualPilka} onChange={(e) => setManualPilka(e.target.value)} placeholder="0" />
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Кромка (мин)</label>
                <input inputMode="numeric" value={manualKromka} onChange={(e) => setManualKromka(e.target.value)} placeholder="0" />
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Присадка (мин)</label>
                <input inputMode="numeric" value={manualPras} onChange={(e) => setManualPras(e.target.value)} placeholder="0" />
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Сборка (мин)</label>
                <input inputMode="numeric" value={manualAssembly} onChange={(e) => setManualAssembly(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="actions" style={{ marginTop: 10 }}>
              <button
                className="mini ok"
                type="button"
                disabled={manualSaving || !String(manualOrderId || "").trim() || !String(manualItem || "").trim()}
                onClick={() => void saveManualLaborRow()}
              >
                {manualSaving ? "Сохраняю..." : "Сохранить"}
              </button>
              <button className="mini" type="button" disabled={manualSaving} onClick={() => setManualLaborOpen(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
      {laborSubView === "orders" && !laborOrdersRows.length && !loading && (
        <div className="empty">Нет завершенных заказов для сводной трудоемкости</div>
      )}
      {laborSubView === "orders" && laborOrdersRows.length > 0 && (
        <div className="sheet-table-wrap">
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Группа изделия</th>
                <th>Источник</th>
                <th>Заказов</th>
                <th>Кол-во (шт)</th>
                <th>Пилка (мин)</th>
                <th>Кромка (мин)</th>
                <th>Присадка (мин)</th>
                <th>Итого (мин)</th>
                <th>Трудоемкость (ч/заказ)</th>
                <th>Трудоемкость (мин/шт)</th>
                <th>Трудоемкость (ч/шт)</th>
                <th>Доля пилки</th>
                <th>Доля кромки</th>
                <th>Доля присадки</th>
                <th>Последнее обновление</th>
              </tr>
            </thead>
            <tbody>
              {laborOrdersRows.map((r) => (
                <tr key={r.group}>
                  <td className="labor-group-cell">
                    <span className="labor-group-name">
                      {r.group}
                      {r.hasNorm && r.normQtyUnit > 1 ? (
                        <span style={{ color: "#6b7280", fontSize: 11, marginLeft: 6 }}>
                          / {r.normQtyUnit} шт
                        </span>
                      ) : null}
                    </span>
                    <div className="labor-share-tooltip">
                      <div className="labor-share-tooltip__title">Распределение этапов</div>
                      <div className="labor-share-tooltip__bar">
                        <span
                          className="labor-share-tooltip__seg labor-share-tooltip__seg--pilka"
                          style={{ width: `${Math.max(0, Math.min(100, Number(r.pilkaShare || 0)))}%` }}
                        />
                        <span
                          className="labor-share-tooltip__seg labor-share-tooltip__seg--kromka"
                          style={{ width: `${Math.max(0, Math.min(100, Number(r.kromkaShare || 0)))}%` }}
                        />
                        <span
                          className="labor-share-tooltip__seg labor-share-tooltip__seg--pras"
                          style={{ width: `${Math.max(0, Math.min(100, Number(r.prasShare || 0)))}%` }}
                        />
                      </div>
                      <div className="labor-share-tooltip__rows">
                        <div className="labor-share-tooltip__row">
                          <span className="dot pilka" /> Пила: <b>{r.pilkaShare.toFixed(1)}%</b>
                        </div>
                        <div className="labor-share-tooltip__row">
                          <span className="dot kromka" /> Кромка: <b>{r.kromkaShare.toFixed(1)}%</b>
                        </div>
                        <div className="labor-share-tooltip__row">
                          <span className="dot pras" /> Присадка: <b>{r.prasShare.toFixed(1)}%</b>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${r.source === "norm" ? "" : ""}`}>{r.sourceLabel}</span>
                  </td>
                  <td>{r.orders}</td>
                  <td>{r.qty}</td>
                  <td>{Math.round(r.pilkaMin)}</td>
                  <td>{Math.round(r.kromkaMin)}</td>
                  <td>{Math.round(r.prasMin)}</td>
                  <td><b>{Math.round(r.totalMin)}</b></td>
                  <td>{r.laborPerOrderHour.toFixed(2)}</td>
                  <td>{r.laborPerQtyMin.toFixed(2)}</td>
                  <td>{r.laborPerQtyHour.toFixed(2)}</td>
                  <td>{r.pilkaShare.toFixed(1)}%</td>
                  <td>{r.kromkaShare.toFixed(1)}%</td>
                  <td>{r.prasShare.toFixed(1)}%</td>
                  <td>{r.lastDate || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {laborSubView === "norms" && (
        <div className="labor-norms">
          <p style={{ margin: "0 0 12px", color: "#6b7280", fontSize: 14 }}>
            Фиксированные нормативы по группам изделий. Используются в «По заказам» и планировщике вместо среднего факта.
          </p>
          <div className="sheet-table-wrap" style={{ marginBottom: 16 }}>
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Группа</th>
                  <th>Пила</th>
                  <th>Кромка</th>
                  <th>Присадка</th>
                  <th>Сборка</th>
                  <th>На кол-во</th>
                  <th>Итого</th>
                  <th>Примечание</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(laborNormsRows) ? laborNormsRows : []).length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ color: "#6b7280" }}>Нормативы не заданы — добавьте первую группу ниже</td>
                  </tr>
                ) : (
                  laborNormsRows.map((row) => {
                    const total = Number(row.pilkaMin || 0) + Number(row.kromkaMin || 0)
                      + Number(row.prasMin || 0) + Number(row.assemblyMin || 0);
                    return (
                      <tr key={row.id || row.groupName}>
                        <td><strong>{row.groupName}</strong></td>
                        <td>{Math.round(row.pilkaMin)}</td>
                        <td>{Math.round(row.kromkaMin)}</td>
                        <td>{Math.round(row.prasMin)}</td>
                        <td>{Math.round(row.assemblyMin)}</td>
                        <td>{row.qtyUnit} шт</td>
                        <td><b>{Math.round(total)}</b></td>
                        <td>{row.note || "—"}</td>
                        <td>
                          <div className="actions" style={{ margin: 0 }}>
                            <button type="button" className="mini" onClick={() => editNormRow(row)}>Изменить</button>
                            <button
                              type="button"
                              className="mini warn"
                              disabled={normDeletingId === row.id}
                              onClick={() => void deleteNormRow(row.id)}
                            >
                              {normDeletingId === row.id ? "..." : "Удалить"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>
              {normDraft.id ? "Редактировать норматив" : "Добавить норматив"}
            </h3>
            <div className="strap-grid">
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Группа изделия</label>
                <div>
                  <input
                    list="labor-norm-groups"
                    value={normDraft.groupName}
                    onChange={(e) => setNormDraft((prev) => ({ ...prev, groupName: e.target.value }))}
                    placeholder="Например: Stabile"
                  />
                  <datalist id="labor-norm-groups">
                    {normGroupOptions.map((group) => (
                      <option key={group} value={group} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>На кол-во (шт)</label>
                <input
                  inputMode="numeric"
                  value={normDraft.qtyUnit}
                  onChange={(e) => setNormDraft((prev) => ({ ...prev, qtyUnit: e.target.value }))}
                  placeholder="1"
                />
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Пила (мин)</label>
                <input inputMode="numeric" value={normDraft.pilkaMin} onChange={(e) => setNormDraft((p) => ({ ...p, pilkaMin: e.target.value }))} />
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Кромка (мин)</label>
                <input inputMode="numeric" value={normDraft.kromkaMin} onChange={(e) => setNormDraft((p) => ({ ...p, kromkaMin: e.target.value }))} />
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Присадка (мин)</label>
                <input inputMode="numeric" value={normDraft.prasMin} onChange={(e) => setNormDraft((p) => ({ ...p, prasMin: e.target.value }))} />
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Сборка (мин)</label>
                <input inputMode="numeric" value={normDraft.assemblyMin} onChange={(e) => setNormDraft((p) => ({ ...p, assemblyMin: e.target.value }))} />
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Примечание</label>
                <input value={normDraft.note} onChange={(e) => setNormDraft((p) => ({ ...p, note: e.target.value }))} placeholder="Необязательно" />
              </div>
            </div>
            <div className="actions" style={{ marginTop: 12 }}>
              <button type="button" className="mini ok" disabled={normSaving} onClick={() => void saveNormDraft()}>
                {normSaving ? "Сохраняю..." : normDraft.id ? "Сохранить" : "Добавить"}
              </button>
              {normDraft.id ? (
                <button type="button" className="mini" disabled={normSaving} onClick={resetNormDraft}>
                  Отмена
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
      {laborSubView === "calculator" && (
        <LaborOrderCalculator
          laborTableRows={laborTableRows}
          laborNormsRows={laborNormsRows}
          laborOrdersRows={laborOrdersRows}
        />
      )}
      {laborSubView === "planner" && !laborPlannerRows.length && !loading && (
        <div className="empty">Нет данных для планировщика</div>
      )}
      {laborSubView === "planner" && laborPlannerRows.length > 0 && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button
              type="button"
              className={plannerMode === "groups" ? "tab active" : "tab"}
              onClick={() => setPlannerMode("groups")}
            >
              Группы изделий
            </button>
            <button
              type="button"
              className={plannerMode === "kits" ? "tab active" : "tab"}
              onClick={() => setPlannerMode("kits")}
            >
              Комплекты
            </button>
          </div>
          {plannerMode === "groups" ? (
            <div className="sheet-table-wrap labor-planner-groups">
              <table className="sheet-table labor-planner-groups__table">
                <thead>
                  <tr>
                    <th>Группа</th>
                    <th>Норма</th>
                    <th>План</th>
                    <th>seq</th>
                    <th>2+2</th>
                  </tr>
                </thead>
                <tbody>
                  {laborPlannerRows.map((r) => {
                    const plannedQty = Number(String(laborPlannerQtyByGroup[r.group] ?? "").replace(",", ".")) || 0;
                    const batch = calcGroupPlanLabor(r, plannedQty);
                    return (
                    <tr key={`planner-${r.group}`}>
                      <td>{r.group}</td>
                      <td className="num">{Math.round(r.laborPerQtyMin)}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="labor-planner-groups__plan-input"
                          value={laborPlannerQtyByGroup[r.group] ?? ""}
                          onChange={(e) =>
                            setLaborPlannerQtyByGroup((prev) => ({
                              ...prev,
                              [r.group]: e.target.value,
                            }))
                          }
                          placeholder="0"
                        />
                      </td>
                      <td className="num"><b>{batch.hhmmSeq}</b></td>
                      <td className="num"><b>{batch.hhmmParallel}</b></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <LaborKitBuilder
              laborPlannerRows={laborPlannerRows}
              savedKits={savedKits}
              setSavedKits={setSavedKits}
              kitQtyByKey={kitQtyByKey}
              setKitQtyByKey={setKitQtyByKey}
              saveKitToDb={saveKitToDb}
              removeSavedKit={removeSavedKit}
              kitSavingId={kitSavingId}
              kitDeletingId={kitDeletingId}
            />
          )}
          <LaborPlanSummary
            laborPlannerRows={laborPlannerRows}
            laborPlannerQtyByGroup={laborPlannerQtyByGroup}
            savedKits={savedKits}
            kitQtyByKey={kitQtyByKey}
            workSchedule={workSchedule}
          />
        </div>
      )}
      {laborSubView === "stages" && !laborStageTimelineRows.length && !loading && (
        <div className="empty">Нет данных по этапам (нужны роли manager/admin)</div>
      )}
      {laborSubView === "stages" && laborStageTimelineRows.length > 0 && (
        <div className="sheet-table-wrap">
          <table className="sheet-table">
            <thead>
              <tr>
                <th>ID заказа</th>
                <th>Текущий этап</th>
                <th>Время этапа</th>
                <th>Пила: статус</th>
                <th>Пила: начало</th>
                <th>Пила: конец</th>
                <th>Кромка: статус</th>
                <th>Кромка: начало</th>
                <th>Кромка: конец</th>
                <th>Присадка: статус</th>
                <th>Присадка: начало</th>
                <th>Присадка: конец</th>
                <th>Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {laborStageTimelineRows.map((r) => (
                <tr key={`labor-stage-${r.orderId}`}>
                  <td>{r.orderId || "-"}</td>
                  <td>{r.liveStageLabel || "-"}</td>
                  <td style={{ color: r.liveRunning ? "#166534" : "#9a3412" }}>
                    {r.liveDurationText || "-"}
                  </td>
                  <td>{r.pilkaStatus || "-"}</td>
                  <td>{r.pilkaStart ? new Date(r.pilkaStart).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                  <td>{r.pilkaEnd ? new Date(r.pilkaEnd).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                  <td>{r.kromkaStatus || "-"}</td>
                  <td>{r.kromkaStart ? new Date(r.kromkaStart).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                  <td>{r.kromkaEnd ? new Date(r.kromkaEnd).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                  <td>{r.prasStatus || "-"}</td>
                  <td>{r.prasStart ? new Date(r.prasStart).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                  <td>{r.prasEnd ? new Date(r.prasEnd).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                  <td>{r.lastEventAt ? new Date(r.lastEventAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
});
