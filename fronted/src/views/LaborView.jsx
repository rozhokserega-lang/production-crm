import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { buildLaborFactPayload } from "../app/laborImportHelpers";
import { normalizeLaborNormRow } from "../app/laborGroupHelpers";
import { STRAP_OPTIONS } from "../app/appConstants";
import { OrderService } from "../services/orderService";
import { LaborKitBuilder } from "../components/LaborKitBuilder";
import { normalizeKitItem } from "../app/laborKitPlanner";
import { LaborPlanSummary } from "../components/LaborPlanSummary";

const isImportedLaborRow = (row) =>
  Boolean(row?.importedLocal) || /^import-/i.test(String(row?.orderId || "").trim());

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
    laborSaveSelected,
    setLaborSaveSelected,
    laborSavingByKey,
    laborSavedByKey,
    saveImportedLaborRowToDb,
    manualLaborOpenNonce = 0,
    workSchedule,
    setLaborNormsRows,
  } = labor;
  const {
    setError,
    loading,
    load = async () => {},
  } = shell;
  const { canAdminSettings = false, canOperateProduction = false } = permissions;

  const [kitQtyByKey, setKitQtyByKey] = useState({});
  const [savedKits, setSavedKits] = useState([]);
  const [kitSavingId, setKitSavingId] = useState("");
  const [kitDeletingId, setKitDeletingId] = useState("");
  const [kitPlanSavingId, setKitPlanSavingId] = useState("");
  const [kitPlanBulkSaving, setKitPlanBulkSaving] = useState(false);
  const [kitPlanSaveNotice, setKitPlanSaveNotice] = useState("");
  const laborTotalRows = useMemo(
    () => laborTableRows.filter((r) => !isImportedLaborRow(r)),
    [laborTableRows],
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
        const [rows, planQtyRows] = await Promise.all([
          OrderService.getLaborKits(),
          OrderService.getLaborKitPlanQty().catch(() => []),
        ]);
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
        const qtyMap = {};
        (Array.isArray(planQtyRows) ? planQtyRows : []).forEach((row) => {
          const kitId = Number(row?.kit_id ?? row?.kitId ?? 0);
          const qty = Number(row?.planned_qty ?? row?.plannedQty ?? row?.qty ?? 0);
          if (kitId > 0) qtyMap[`db-${kitId}`] = String(Number.isFinite(qty) ? qty : 0);
        });
        if (Object.keys(qtyMap).length) {
          setKitQtyByKey((prev) => ({ ...prev, ...qtyMap }));
        }
      } catch (e) {
        if (!cancelled && setError) setError(String(e?.message || e || "Не удалось загрузить комплекты"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setError]);

  const parseKitPlanQty = useCallback((qtyRaw) => {
    const qty = Number(String(qtyRaw ?? "").replace(",", ".").trim());
    return Number.isFinite(qty) && qty >= 0 ? qty : 0;
  }, []);

  const saveKitPlanQty = useCallback(async (kit, qtyRaw) => {
    if (!canOperateProduction) return;
    const dbId = Number(kit?.dbId || 0);
    if (!dbId) return;
    const qty = parseKitPlanQty(qtyRaw);
    setKitPlanSavingId(kit.id);
    setKitPlanSaveNotice("");
    if (setError) setError("");
    try {
      await OrderService.upsertLaborKitPlanQty({ kitId: dbId, qty });
    } catch (e) {
      if (setError) setError(String(e?.message || e || "Не удалось сохранить план комплекта"));
    } finally {
      setKitPlanSavingId("");
    }
  }, [canOperateProduction, parseKitPlanQty, setError]);

  const saveAllKitPlanQty = useCallback(async () => {
    if (!canOperateProduction) {
      if (setError) setError("Недостаточно прав: нужна роль оператор, менеджер или админ");
      return;
    }
    const dbKits = savedKits.filter((kit) => Number(kit?.dbId || 0) > 0);
    if (!dbKits.length) {
      if (setError) setError("Нет комплектов в БД — сначала сохраните комплекты кнопкой «В БД»");
      return;
    }
    setKitPlanBulkSaving(true);
    setKitPlanSaveNotice("");
    if (setError) setError("");
    try {
      await Promise.all(
        dbKits.map((kit) =>
          OrderService.upsertLaborKitPlanQty({
            kitId: kit.dbId,
            qty: parseKitPlanQty(kitQtyByKey[kit.id]),
          }),
        ),
      );
      setKitPlanSaveNotice(`Сохранено: ${dbKits.length} комплектов`);
    } catch (e) {
      if (setError) setError(String(e?.message || e || "Не удалось сохранить количества комплектов"));
    } finally {
      setKitPlanBulkSaving(false);
    }
  }, [canOperateProduction, kitQtyByKey, parseKitPlanQty, savedKits, setError]);

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
      const nextId = dbId > 0 ? `db-${dbId}` : kit.id;
      const plannedQty = kitQtyByKey[kit.id];
      setSavedKits((prev) =>
        prev.map((x) => (x.id === kit.id ? { ...x, id: nextId, dbId: dbId > 0 ? dbId : x.dbId, dbSaved: dbId > 0 } : x)),
      );
      if (dbId > 0 && plannedQty != null && String(plannedQty).trim() !== "") {
        setKitQtyByKey((prev) => {
          const next = { ...prev };
          if (kit.id !== nextId) delete next[kit.id];
          next[nextId] = plannedQty;
          return next;
        });
        await OrderService.upsertLaborKitPlanQty({
          kitId: dbId,
          qty: Number(String(plannedQty).replace(",", ".")) || 0,
        });
      }
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
      {laborSubView === "planner" && !laborPlannerRows.length && !loading && (
        <div className="empty">Нет данных для планировщика</div>
      )}
      {laborSubView === "planner" && laborPlannerRows.length > 0 && (
        <div className="labor-planner">
          <LaborPlanSummary
            laborPlannerRows={laborPlannerRows}
            laborPlannerQtyByGroup={laborPlannerQtyByGroup}
            savedKits={savedKits}
            kitQtyByKey={kitQtyByKey}
            workSchedule={workSchedule}
          />
          <LaborKitBuilder
            laborPlannerRows={laborPlannerRows}
            savedKits={savedKits}
            setSavedKits={setSavedKits}
            kitQtyByKey={kitQtyByKey}
            setKitQtyByKey={setKitQtyByKey}
            saveKitToDb={saveKitToDb}
            saveKitPlanQty={saveKitPlanQty}
            saveAllKitPlanQty={saveAllKitPlanQty}
            removeSavedKit={removeSavedKit}
            kitSavingId={kitSavingId}
            kitDeletingId={kitDeletingId}
            kitPlanSavingId={kitPlanSavingId}
            kitPlanBulkSaving={kitPlanBulkSaving}
            kitPlanSaveNotice={kitPlanSaveNotice}
            canSaveKitPlanQty={canOperateProduction}
          />
        </div>
      )}
    </>
  );
});
