import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { buildLaborFactPayload } from "../app/laborImportHelpers";
import { STRAP_OPTIONS } from "../app/appConstants";

function formatHhMm(totalMin) {
  const safe = Math.max(0, Number(totalMin || 0));
  const hours = Math.floor(safe / 60);
  const minutes = Math.round(safe % 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

const CAPACITY_STORAGE_KEY = "labor_planner_capacity_v1";
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
  callBackend,
  setError,
  loading,
  canAdminSettings = false,
  load = async () => {},
  manualLaborOpenNonce = 0,
}) {
  const [plannerMode, setPlannerMode] = useState("groups");
  const [kitQtyByKey, setKitQtyByKey] = useState({});
  const [kitNameDraft, setKitNameDraft] = useState("");
  const [kitItemDraft, setKitItemDraft] = useState("");
  const [kitItemQtyDraft, setKitItemQtyDraft] = useState("1");
  const [kitBuilderItems, setKitBuilderItems] = useState([]);
  const [savedKits, setSavedKits] = useState([]);
  const [kitSavingId, setKitSavingId] = useState("");
  const [kitDeletingId, setKitDeletingId] = useState("");
  const [kromkaPosts, setKromkaPosts] = useState(2);
  const [prasPosts, setPrasPosts] = useState(2);
  const laborTotalRows = useMemo(
    () => laborTableRows.filter((r) => !isImportedLaborRow(r)),
    [laborTableRows],
  );

  const [laborAdminSavingKey, setLaborAdminSavingKey] = useState("");
  const saveLaborMinutes = useCallback(
    async (row, updates) => {
      if (!callBackend) return;
      const key = `${String(row?.orderId || "").trim()}::${String(row?.item || "").trim()}`;
      setLaborAdminSavingKey(key);
      if (setError) setError("");
      try {
        await callBackend("webUpsertLaborFact", buildLaborFactPayload({ ...row, ...updates }));
        await load();
      } catch (e) {
        if (setError) setError(String(e?.message || e || "Не удалось сохранить трудоемкость"));
      } finally {
        setLaborAdminSavingKey("");
      }
    },
    [callBackend, load, setError],
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
    if (!callBackend) return;
    const orderId = String(manualOrderId || "").trim();
    const item = String(manualItem || "").trim();
    if (!orderId || !item) return;
    setManualSaving(true);
    if (setError) setError("");
    try {
      await callBackend(
        "webUpsertLaborFact",
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
    callBackend,
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

  useEffect(() => {
    if (!callBackend) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await callBackend("webGetLaborKits", {});
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
                      return group ? { group, qty: 1 } : null;
                    }
                    const group = String(x?.group || "").trim();
                    const qtyRaw = Number(x?.qty);
                    const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
                    return group ? { group, qty } : null;
                  })
                  .filter(Boolean)
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
  }, [callBackend, setError]);

  const plannerGroups = useMemo(
    () => laborPlannerRows.map((r) => String(r.group || "").trim()).filter(Boolean),
    [laborPlannerRows],
  );
  const laborByGroup = useMemo(() => {
    const map = new Map();
    laborPlannerRows.forEach((r) => {
      const key = String(r.group || "").trim();
      if (!key) return;
      map.set(key, {
        total: Number(r.laborPerQtyMin || 0),
        pilka: Number(r.pilkaPerQtyMin || 0),
        kromka: Number(r.kromkaPerQtyMin || 0),
        pras: Number(r.prasPerQtyMin || 0),
      });
    });
    return map;
  }, [laborPlannerRows]);
  const plannerKitRows = useMemo(
    () =>
      savedKits.map((kit) => {
        const plannedQtyRaw = kitQtyByKey[kit.id];
        const kits = Math.max(0, Number(String(plannedQtyRaw ?? "").replace(",", ".")) || 0);
        const stagePerKit = kit.items.reduce(
          (sum, item) => {
            const row = laborByGroup.get(item.group) || { total: 0, pilka: 0, kromka: 0, pras: 0 };
            const q = Number(item.qty || 1);
            return {
              total: sum.total + Number(row.total || 0) * q,
              pilka: sum.pilka + Number(row.pilka || 0) * q,
              kromka: sum.kromka + Number(row.kromka || 0) * q,
              pras: sum.pras + Number(row.pras || 0) * q,
            };
          },
          { total: 0, pilka: 0, kromka: 0, pras: 0 },
        );
        const laborPerKitMin = stagePerKit.total;
        const laborPerKitMinParallel =
          stagePerKit.pilka +
          stagePerKit.kromka / Math.max(1, Number(kromkaPosts || 1)) +
          stagePerKit.pras / Math.max(1, Number(prasPosts || 1));
        const totalMin = kits * laborPerKitMin;
        const totalMinParallel = kits * laborPerKitMinParallel;
        const missingItems = kit.items.filter((item) => !laborByGroup.has(item.group)).map((item) => item.group);
        return {
          ...kit,
          kits,
          laborPerKitMin,
          laborPerKitMinParallel,
          totalMin,
          totalMinParallel,
          hhmm: formatHhMm(totalMin),
          hhmmParallel: formatHhMm(totalMinParallel),
          missingItems,
        };
      }),
    [savedKits, kitQtyByKey, laborByGroup, kromkaPosts, prasPosts],
  );

  const addBuilderItem = () => {
    const next = String(kitItemDraft || "").trim();
    const qtyRaw = Number(String(kitItemQtyDraft || "").replace(",", "."));
    const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
    if (!next) return;
    setKitBuilderItems((prev) => [...prev, { group: next, qty }]);
    setKitItemDraft("");
    setKitItemQtyDraft("1");
  };

  const removeBuilderItem = (idx) => {
    setKitBuilderItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveKitFromBuilder = () => {
    const name = String(kitNameDraft || "").trim();
    if (!name || kitBuilderItems.length === 0) return;
    const id = `kit-${Date.now()}`;
    const nextKit = { id, dbId: null, dbSaved: false, name, items: kitBuilderItems };
    setSavedKits((prev) => [nextKit, ...prev]);
    setKitNameDraft("");
    setKitBuilderItems([]);
    setKitItemDraft("");
    setKitItemQtyDraft("1");
  };

  const saveKitToDb = async (kit) => {
    if (!callBackend) return;
    setKitSavingId(kit.id);
    try {
      const payload = await callBackend("webUpsertLaborKit", {
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
    if (kit.dbId && callBackend) {
      setKitDeletingId(kit.id);
      try {
        await callBackend("webDeleteLaborKit", { id: kit.dbId });
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
                      disabled={loading || !callBackend || laborAdminSavingKey === `${String(r?.orderId || "").trim()}::${String(r?.item || "").trim()}`}
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
                    <span className="labor-group-name">{r.group}</span>
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
            <div className="sheet-table-wrap">
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>Группа изделия</th>
                    <th>Норма (мин/комплект)</th>
                    <th>План (комплектов)</th>
                    <th>Время (мин)</th>
                    <th>Время (ч:мм)</th>
                  </tr>
                </thead>
                <tbody>
                  {laborPlannerRows.map((r) => (
                    <tr key={`planner-${r.group}`}>
                      <td>{r.group}</td>
                      <td>{r.laborPerQtyMin.toFixed(2)}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={laborPlannerQtyByGroup[r.group] ?? ""}
                          onChange={(e) =>
                            setLaborPlannerQtyByGroup((prev) => ({
                              ...prev,
                              [r.group]: e.target.value,
                            }))
                          }
                          style={{ width: 120 }}
                          placeholder="0"
                        />
                      </td>
                      <td>{Math.round(r.totalMin)}</td>
                      <td><b>{r.hhmm}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              <div style={{ margin: "6px 0 12px" }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Конструктор комплекта</div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <span>Кромочников</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={kromkaPosts}
                      onChange={(e) => setKromkaPosts(Math.max(1, Number(e.target.value || 1)))}
                      style={{ width: 72 }}
                    />
                  </label>
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <span>Присадчиков</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={prasPosts}
                      onChange={(e) => setPrasPosts(Math.max(1, Number(e.target.value || 1)))}
                      style={{ width: 72 }}
                    />
                  </label>
                  <span style={{ color: "#64748b" }}>
                    Формула: Пила + Кромка/{Math.max(1, Number(kromkaPosts || 1))} + Присадка/{Math.max(1, Number(prasPosts || 1))}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                  <input
                    type="text"
                    value={kitNameDraft}
                    onChange={(e) => setKitNameDraft(e.target.value)}
                    placeholder="Имя комплекта (например: Стол + обвязка 1000_80)"
                    style={{ minWidth: 320 }}
                  />
                  <select value={kitItemDraft} onChange={(e) => setKitItemDraft(e.target.value)}>
                    <option value="">Выберите изделие…</option>
                    {plannerGroups.map((group) => (
                      <option key={`kit-option-${group}`} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={kitItemQtyDraft}
                    onChange={(e) => setKitItemQtyDraft(e.target.value)}
                    placeholder="Кол-во"
                    style={{ width: 96 }}
                    title="Количество позиции в комплекте"
                  />
                  <button type="button" className="mini" onClick={addBuilderItem} disabled={!kitItemDraft}>
                    Добавить в комплект
                  </button>
                  <button
                    type="button"
                    className="mini ok"
                    onClick={saveKitFromBuilder}
                    disabled={!kitNameDraft.trim() || kitBuilderItems.length === 0}
                  >
                    Сохранить комплект
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {kitBuilderItems.length === 0 ? (
                    <span style={{ color: "#64748b" }}>Состав пуст. Добавьте изделия по очереди.</span>
                  ) : (
                    kitBuilderItems.map((item, idx) => (
                      <button
                        key={`builder-item-${item.group}-${idx}`}
                        type="button"
                        className="mini"
                        onClick={() => removeBuilderItem(idx)}
                        title="Удалить из комплекта"
                      >
                        {idx + 1}. {item.group} x {item.qty}
                      </button>
                    ))
                  )}
                </div>
              </div>
              {plannerKitRows.length > 0 ? (
                <div className="sheet-table-wrap">
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>Имя комплекта</th>
                    <th>Состав изделий</th>
                    <th>Норма (мин/комплект)</th>
                    <th>План (комплектов)</th>
                    <th>Время seq (мин)</th>
                    <th>Время seq (ч:мм)</th>
                    <th>Время 2+2 (мин)</th>
                    <th>Время 2+2 (ч:мм)</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {plannerKitRows.map((r) => (
                    <tr key={`planner-kit-${r.id}`}>
                      <td>{r.name}</td>
                      <td>{r.items.map((x) => `${x.group} x ${x.qty}`).join(" + ")}</td>
                      <td>{r.laborPerKitMin.toFixed(2)}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={kitQtyByKey[r.id] ?? ""}
                          onChange={(e) =>
                            setKitQtyByKey((prev) => ({
                              ...prev,
                              [r.id]: e.target.value,
                            }))
                          }
                          style={{ width: 120 }}
                          placeholder="0"
                        />
                      </td>
                      <td>{Math.round(r.totalMin)}</td>
                      <td>
                        <b>{r.hhmm}</b>
                        {r.missingItems.length > 0 ? (
                          <div style={{ color: "#9a3412", marginTop: 4 }}>
                            Нет нормы: {r.missingItems.join(", ")}
                          </div>
                        ) : null}
                      </td>
                      <td>{Math.round(r.totalMinParallel)}</td>
                      <td>
                        <b>{r.hhmmParallel}</b>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            className="mini ok"
                            onClick={() => void saveKitToDb(r)}
                            disabled={kitSavingId === r.id}
                          >
                            {kitSavingId === r.id ? "Сохраняю..." : r.dbSaved ? "Обновить в БД" : "Сохранить в БД"}
                          </button>
                          <button
                            type="button"
                            className="mini warn"
                            onClick={() => void removeSavedKit(r)}
                            disabled={kitDeletingId === r.id}
                          >
                            {kitDeletingId === r.id ? "Удаляю..." : "Удалить"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
                </div>
              ) : (
                <div className="empty">Сохраненных комплектов пока нет. Соберите состав и нажмите "Сохранить комплект".</div>
              )}
            </div>
          )}
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
