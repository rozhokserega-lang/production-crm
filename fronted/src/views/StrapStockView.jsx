import { useState, useEffect, useCallback, useMemo } from "react";
import { STRAP_OPTIONS } from "../app/appConstants";
import {
  computeWorkshopStrapDemandByInventoryKey,
  strapWarehouseShortage,
} from "../app/workshopStrapNeeds";

/**
 * Extracts the size code from a STRAP_OPTIONS display name.
 * "Обвязка (1000_80)" → "1000_80"
 */
function strapOptionToCode(name) {
  const m = String(name || "").match(/\((\d[\d_x]+)\)/);
  return m ? m[1] : String(name || "").trim();
}

/**
 * Groups strap stock rows by strap_type.
 */
function buildStockMap(rows) {
  const map = {};
  for (const row of rows || []) {
    const key = String(row.strap_type || "");
    if (!map[key]) map[key] = [];
    map[key].push(row);
  }
  return map;
}

/** Если в БД ещё нет строки по типу — создаём остаток с этим цветом (как в существующих строках склада). */
const DEFAULT_STRAP_STOCK_COLOR = "Черный";

function ShortageCell({ demandByKey, strapType, color, qty }) {
  const miss = strapWarehouseShortage(demandByKey, strapType, color, qty);
  return (
    <td
      className={`strap-stock-shortage${miss > 0 ? " strap-stock-shortage--deficit" : " strap-stock-shortage--ok"}`}
      title="По заказам в цеху (все этапы, как на вкладке «Все»): max(0, нужно − остаток в этой строке)"
    >
      {miss > 0 ? <b>{miss}</b> : <span className="strap-stock-shortage-zero">0</span>}
    </td>
  );
}

export function StrapStockView({
  callBackend,
  workshopRows = [],
  furnitureTemplates = [],
  furnitureCustomTemplates = [],
  furnitureDetailArticleRows = [],
  normalizeFurnitureKey,
}) {
  const [stockRows, setStockRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editKey, setEditKey] = useState(null); // "strapType|color"
  const [editQty, setEditQty] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await callBackend("webGetStrapStock", {});
      setStockRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(String(e?.message || e || "Ошибка загрузки"));
    } finally {
      setLoading(false);
    }
  }, [callBackend]);

  useEffect(() => {
    load();
  }, [load]);

  const strapDeps = useMemo(
    () => ({
      furnitureTemplates,
      furnitureCustomTemplates,
      furnitureDetailArticleRows,
      normalizeFurnitureKey:
        typeof normalizeFurnitureKey === "function"
          ? normalizeFurnitureKey
          : (v) => String(v || "").toLowerCase().trim(),
    }),
    [furnitureTemplates, furnitureCustomTemplates, furnitureDetailArticleRows, normalizeFurnitureKey],
  );

  const demandByKey = useMemo(
    () => computeWorkshopStrapDemandByInventoryKey(workshopRows, strapDeps),
    [workshopRows, strapDeps],
  );

  const stockMap = buildStockMap(stockRows);

  // All known strap types from STRAP_OPTIONS + any in DB not in the list
  const knownCodes = STRAP_OPTIONS.map(strapOptionToCode);
  const dbCodes = stockRows.map((r) => String(r.strap_type || ""));
  const allCodes = Array.from(new Set([...knownCodes, ...dbCodes])).filter(Boolean);

  const handleEditStart = (strapType, color, currentQty) => {
    setEditKey(`${strapType}|${color}`);
    setEditQty(String(currentQty || 0));
  };

  const handleEditSave = async (strapType, color) => {
    const qty = parseInt(editQty, 10);
    if (!Number.isFinite(qty) || qty < 0) {
      setError("Введите корректное количество (≥ 0)");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await callBackend("webSetStrapStock", { strapType, color, qty });
      setEditKey(null);
      setEditQty("");
      await load();
    } catch (e) {
      setError(String(e?.message || e || "Ошибка сохранения"));
    } finally {
      setSaving(false);
    }
  };

  const handleEditCancel = () => {
    setEditKey(null);
    setEditQty("");
    setError("");
  };

  return (
    <div className="strap-stock-view">
      <div className="strap-stock-header">
        <h2 className="strap-stock-title">Склад обвязки</h2>
        <button type="button" className="mini" onClick={load} disabled={loading}>
          {loading ? "Загрузка..." : "↻ Обновить"}
        </button>
      </div>

      {error && (
        <div className="strap-stock-error">{error}</div>
      )}

      {loading && stockRows.length === 0 ? (
        <div className="strap-stock-empty">Загрузка...</div>
      ) : (
        <div className="strap-stock-table-wrap">
          <table className="strap-stock-table">
            <thead>
              <tr>
                <th>Тип обвязки</th>
                <th>Цвет</th>
                <th className="strap-stock-th-numeric">Кол-во (шт)</th>
                <th className="strap-stock-th-numeric" title="Сколько не хватает по производству (цех, все этапы) при текущем остатке в строке">
                  Нехватает
                </th>
                <th>Изменено</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {allCodes.map((code) => {
                const rows = stockMap[code] || [];
                const label = STRAP_OPTIONS.find((o) => strapOptionToCode(o) === code) || code;

                if (rows.length === 0) {
                  const strapType = code;
                  const color = DEFAULT_STRAP_STOCK_COLOR;
                  const key = `${strapType}|${color}`;
                  const isEditing = editKey === key;
                  const displayQty = isEditing ? Number.parseInt(editQty, 10) : 0;
                  const qtyForShortage = Number.isFinite(displayQty) && displayQty >= 0 ? displayQty : 0;
                  return (
                    <tr key={code} className="strap-stock-row strap-stock-row--zero">
                      <td className="strap-stock-type">{label}</td>
                      <td className="strap-stock-color">{color}</td>
                      <td className="strap-stock-qty">
                        {isEditing ? (
                          <input
                            type="number"
                            className="strap-stock-qty-input"
                            value={editQty}
                            min={0}
                            onChange={(e) => setEditQty(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleEditSave(strapType, color);
                              if (e.key === "Escape") handleEditCancel();
                            }}
                            autoFocus
                          />
                        ) : (
                          <span className="strap-qty-zero">0</span>
                        )}
                      </td>
                      <ShortageCell demandByKey={demandByKey} strapType={strapType} color={color} qty={qtyForShortage} />
                      <td className="strap-stock-updated">—</td>
                      <td className="strap-stock-actions">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="mini ok"
                              disabled={saving}
                              onClick={() => handleEditSave(strapType, color)}
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              className="mini ghost"
                              disabled={saving}
                              onClick={handleEditCancel}
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="mini ghost"
                            onClick={() => handleEditStart(strapType, color, 0)}
                          >
                            Изменить
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                }

                return rows.map((row) => {
                  const key = `${row.strap_type}|${row.color}`;
                  const isEditing = editKey === key;
                  const updatedAt = row.updated_at
                    ? new Date(row.updated_at).toLocaleString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—";
                  const rowQty = Number(row.qty || 0);
                  const editParsed = Number.parseInt(editQty, 10);
                  const qtyForShortage =
                    isEditing && Number.isFinite(editParsed) && editParsed >= 0 ? editParsed : rowQty;
                  return (
                    <tr
                      key={key}
                      className={`strap-stock-row ${row.qty === 0 ? "strap-stock-row--zero" : ""}`}
                    >
                      <td className="strap-stock-type">{label}</td>
                      <td className="strap-stock-color">{row.color || "—"}</td>
                      <td className="strap-stock-qty">
                        {isEditing ? (
                          <input
                            type="number"
                            className="strap-stock-qty-input"
                            value={editQty}
                            min={0}
                            onChange={(e) => setEditQty(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleEditSave(row.strap_type, row.color);
                              if (e.key === "Escape") handleEditCancel();
                            }}
                            autoFocus
                          />
                        ) : (
                          <span className={row.qty === 0 ? "strap-qty-zero" : "strap-qty-value"}>
                            {row.qty}
                          </span>
                        )}
                      </td>
                      <ShortageCell
                        demandByKey={demandByKey}
                        strapType={row.strap_type}
                        color={row.color}
                        qty={qtyForShortage}
                      />
                      <td className="strap-stock-updated">{updatedAt}</td>
                      <td className="strap-stock-actions">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="mini ok"
                              disabled={saving}
                              onClick={() => handleEditSave(row.strap_type, row.color)}
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              className="mini ghost"
                              disabled={saving}
                              onClick={handleEditCancel}
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="mini ghost"
                            onClick={() => handleEditStart(row.strap_type, row.color, row.qty)}
                          >
                            Изменить
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
