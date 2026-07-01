import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { OrderService } from "../services/orderService";

/**
 * Склад готовой металлической продукции.
 *
 * Приход: с производства («На склад» в «Готовые») или вручную (кнопка «Добавить»).
 * Списание / корректировка / удаление позиции — здесь, для admin/manager.
 */

const MOVE_TYPE_LABELS = {
  receipt: "Приход",
  ship: "Списание",
  adjust: "Корректировка",
};

function formatDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value || "—");
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mapStockRow(row) {
  return {
    article: String(row?.article || "").trim(),
    name: String(row?.name || "").trim(),
    qty: Number(row?.qty || 0),
    updatedAt: row?.updated_at || row?.updatedAt || null,
  };
}

function mapMoveRow(row) {
  return {
    id: Number(row?.id || 0),
    article: String(row?.article || "").trim(),
    name: String(row?.name || "").trim(),
    qty: Number(row?.qty || 0),
    moveType: String(row?.move_type || row?.moveType || "").trim(),
    sourceWorkItemId: row?.source_work_item_id ?? row?.sourceWorkItemId ?? null,
    note: String(row?.note || "").trim(),
    createdAt: row?.created_at || row?.createdAt || null,
  };
}

function mapCatalogOption(row) {
  const article = String(row?.article || "").trim().toUpperCase();
  const name = String(row?.name || "").trim();
  if (!article) return null;
  return { article, name, label: name ? `${article} — ${name}` : article };
}

function resolveCatalogOption(raw, catalogOptions = []) {
  const q = String(raw || "").trim();
  if (!q) return null;
  const upper = q.toUpperCase();
  const byArticle = catalogOptions.find((o) => o.article === upper);
  if (byArticle) return byArticle;
  const byLabel = catalogOptions.find((o) => o.label === q);
  if (byLabel) return byLabel;
  const lower = q.toLowerCase();
  const byNameExact = catalogOptions.find((o) => o.name.toLowerCase() === lower);
  if (byNameExact) return byNameExact;
  const partialName = catalogOptions.filter((o) => o.name.toLowerCase().includes(lower));
  if (partialName.length === 1) return partialName[0];
  const partialLabel = catalogOptions.filter((o) => o.label.toLowerCase().includes(lower));
  if (partialLabel.length === 1) return partialLabel[0];
  return null;
}

function filterCatalogOptions(options, rawQuery, limit = 25) {
  const q = String(rawQuery || "").trim().toLowerCase();
  if (!q) return options.slice(0, limit);
  const scored = [];
  for (const opt of options) {
    const article = opt.article.toLowerCase();
    const name = opt.name.toLowerCase();
    let score = -1;
    if (article === q) score = 100;
    else if (article.startsWith(q)) score = 80;
    else if (name === q) score = 70;
    else if (name.startsWith(q)) score = 60;
    else if (article.includes(q)) score = 40;
    else if (name.includes(q)) score = 30;
    if (score >= 0) scored.push({ opt, score });
  }
  scored.sort((a, b) => b.score - a.score || a.opt.article.localeCompare(b.opt.article, "ru"));
  return scored.slice(0, limit).map((x) => x.opt);
}

function CatalogSearchCombobox({
  options,
  value,
  query,
  onQueryChange,
  onSelect,
  placeholder,
  autoFocus = false,
}) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => filterCatalogOptions(options, query), [options, query]);
  const selected = value ? options.find((o) => o.article === value) : null;

  const handleSelect = (opt) => {
    onSelect(opt);
    setOpen(false);
  };

  return (
    <div className="catalog-search-combobox">
      <input
        type="text"
        className="metal-process-field catalog-search-combobox__input"
        placeholder={placeholder}
        value={query}
        autoComplete="off"
        autoFocus={autoFocus}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key === "Enter" && open && filtered.length > 0) {
            e.preventDefault();
            handleSelect(filtered[0]);
          }
        }}
      />
      {open && filtered.length > 0 && (
        <ul className="catalog-search-combobox__list" role="listbox">
          {filtered.map((opt) => (
            <li key={opt.article} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={opt.article === value}
                className="catalog-search-combobox__option"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(opt);
                }}
              >
                <span className="catalog-search-combobox__article">{opt.article}</span>
                {opt.name ? <span className="catalog-search-combobox__name">{opt.name}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && String(query || "").trim() && filtered.length === 0 && (
        <div className="catalog-search-combobox__empty">Ничего не найдено</div>
      )}
      {selected && !open && (
        <div className="catalog-search-combobox__picked">
          Выбрано: <strong>{selected.article}</strong>
          {selected.name ? ` — ${selected.name}` : ""}
        </div>
      )}
    </div>
  );
}

export function MetalFinishedStockView({ canManageOrders, catalogRows = [], onError }) {
  const [tab, setTab] = useState("stock");
  const [stockRows, setStockRows] = useState([]);
  const [moveRows, setMoveRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionArticle, setActionArticle] = useState("");
  const [search, setSearch] = useState("");
  const [localError, setLocalError] = useState("");

  const [shipDialog, setShipDialog] = useState({ open: false, article: "", name: "", qty: 1, note: "" });
  const [adjustDialog, setAdjustDialog] = useState({ open: false, article: "", name: "", qty: 0 });
  const [addDialog, setAddDialog] = useState({ open: false, article: "", query: "", qty: 1, note: "" });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, article: "", name: "", note: "" });

  const catalogOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const row of Array.isArray(catalogRows) ? catalogRows : []) {
      const opt = mapCatalogOption(row);
      if (!opt || seen.has(opt.article)) continue;
      seen.add(opt.article);
      out.push(opt);
    }
    return out.sort((a, b) => a.article.localeCompare(b.article, "ru"));
  }, [catalogRows]);

  const catalogByArticle = useMemo(() => {
    const map = new Map();
    catalogOptions.forEach((opt) => map.set(opt.article, opt));
    return map;
  }, [catalogOptions]);

  const reportError = useCallback(
    (e) => {
      const text = String(e?.message || e || "Ошибка склада готовой продукции").trim();
      setLocalError(text);
      if (onError) onError(text);
    },
    [onError],
  );

  const loadStock = useCallback(async () => {
    setLoading(true);
    setLocalError("");
    try {
      const [stock, moves] = await Promise.all([
        OrderService.listMetalFinishedStock().catch(() => []),
        OrderService.listMetalFinishedMoves(500).catch(() => []),
      ]);
      setStockRows(Array.isArray(stock) ? stock.map(mapStockRow) : []);
      setMoveRows(Array.isArray(moves) ? moves.map(mapMoveRow) : []);
    } catch (e) {
      reportError(e);
    } finally {
      setLoading(false);
    }
  }, [reportError]);

  useEffect(() => {
    void loadStock();
  }, [loadStock]);

  const filteredStockRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = [...stockRows].sort((a, b) => a.article.localeCompare(b.article, "ru"));
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.article.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q),
    );
  }, [stockRows, search]);

  const filteredMoveRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return moveRows;
    return moveRows.filter(
      (r) =>
        r.article.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q),
    );
  }, [moveRows, search]);

  const totalQty = useMemo(
    () => stockRows.reduce((sum, r) => sum + Number(r.qty || 0), 0),
    [stockRows],
  );

  const submitShip = async () => {
    const article = String(shipDialog.article || "").trim().toUpperCase();
    const qty = Math.max(0, Math.floor(Number(shipDialog.qty || 0)));
    if (!article) return;
    if (!(qty > 0)) {
      reportError(new Error("Введите количество больше 0"));
      return;
    }
    setActionArticle(article);
    try {
      await OrderService.shipMetalFinished(article, qty, shipDialog.note || null);
      setShipDialog({ open: false, article: "", name: "", qty: 1, note: "" });
      await loadStock();
    } catch (e) {
      reportError(e);
    } finally {
      setActionArticle("");
    }
  };

  const submitAdjust = async () => {
    const article = String(adjustDialog.article || "").trim().toUpperCase();
    const qty = Math.max(0, Math.floor(Number(adjustDialog.qty || 0)));
    if (!article) return;
    setActionArticle(article);
    try {
      await OrderService.adjustMetalFinishedStock(article, qty);
      setAdjustDialog({ open: false, article: "", name: "", qty: 0 });
      await loadStock();
    } catch (e) {
      reportError(e);
    } finally {
      setActionArticle("");
    }
  };

  const submitAdd = async () => {
    const article = String(addDialog.article || "").trim().toUpperCase();
    const qty = Math.max(0, Math.floor(Number(addDialog.qty || 0)));
    if (!article) {
      reportError(new Error("Выберите артикул из каталога"));
      return;
    }
    if (!(qty > 0)) {
      reportError(new Error("Введите количество больше 0"));
      return;
    }
    if (!catalogByArticle.has(article)) {
      reportError(new Error("Артикул должен быть в каталоге металлообработки"));
      return;
    }
    setActionArticle(article);
    try {
      await OrderService.addMetalFinishedManual(article, qty, addDialog.note || null);
      setAddDialog({ open: false, article: "", query: "", qty: 1, note: "" });
      await loadStock();
    } catch (e) {
      reportError(e);
    } finally {
      setActionArticle("");
    }
  };

  const submitDelete = async () => {
    const article = String(deleteDialog.article || "").trim().toUpperCase();
    if (!article) return;
    setActionArticle(article);
    try {
      await OrderService.deleteMetalFinishedStock(article, deleteDialog.note || null);
      setDeleteDialog({ open: false, article: "", name: "", note: "" });
      await loadStock();
    } catch (e) {
      reportError(e);
    } finally {
      setActionArticle("");
    }
  };

  const handleAddCatalogQuery = (rawQuery) => {
    const query = String(rawQuery || "");
    const opt = resolveCatalogOption(query, catalogOptions);
    setAddDialog((prev) => ({
      ...prev,
      query,
      article: opt?.article || "",
    }));
  };

  const handleAddCatalogSelect = (opt) => {
    if (!opt) return;
    setAddDialog((prev) => ({
      ...prev,
      article: opt.article,
      query: opt.label,
    }));
  };

  return (
    <div className="metal-finished-stock">
      <div className="metal-finished-stock__header">
        <div className="metal-finished-stock__tabs">
          <button
            type="button"
            className={tab === "stock" ? "tab active" : "tab"}
            onClick={() => setTab("stock")}
          >
            Остатки
          </button>
          <button
            type="button"
            className={tab === "moves" ? "tab active" : "tab"}
            onClick={() => setTab("moves")}
          >
            Журнал движений
          </button>
        </div>
      </div>

      {localError && (
        <div className="error" style={{ marginBottom: 8 }}>
          {localError}
        </div>
      )}

      <div className="metal-finished-stock__toolbar">
        <input
          className="metal-process-field metal-finished-stock__search"
          placeholder="Поиск: артикул, название…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {tab === "stock" && canManageOrders && (
          <button
            type="button"
            className="mini metal-finished-stock__add-btn"
            onClick={() => setAddDialog({ open: true, article: "", query: "", qty: 1, note: "" })}
          >
            + Добавить
          </button>
        )}
        {tab === "stock" && (
          <span className="metal-finished-stock__total">
            Всего позиций: <b>{stockRows.length}</b>, кол-во: <b>{totalQty}</b>
          </span>
        )}
      </div>

      {tab === "stock" && (
        <div className="sheet-table-wrap">
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Артикул</th>
                <th>Название</th>
                <th style={{ width: 90 }}>Кол-во</th>
                <th>Обновлено</th>
                {canManageOrders && <th style={{ width: 260 }}>Действия</th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={canManageOrders ? 5 : 4} className="empty">Загрузка…</td>
                </tr>
              )}
              {!loading && stockRows.length === 0 && (
                <tr>
                  <td colSpan={canManageOrders ? 5 : 4} className="empty">
                    Склад пуст. Добавьте продукцию вручную или зачислите с производства («Готовые» → «На склад»).
                  </td>
                </tr>
              )}
              {!loading && stockRows.length > 0 && filteredStockRows.length === 0 && (
                <tr>
                  <td colSpan={canManageOrders ? 5 : 4} className="empty">Ничего не найдено по фильтру.</td>
                </tr>
              )}
              {filteredStockRows.map((row) => (
                <tr key={`stock-${row.article}`}>
                  <td><strong>{row.article}</strong></td>
                  <td>{row.name || "—"}</td>
                  <td><b>{row.qty}</b></td>
                  <td>{formatDateTime(row.updatedAt)}</td>
                  {canManageOrders && (
                    <td>
                      <div className="metal-finished-stock__row-actions">
                        <button
                          type="button"
                          className="mini warn"
                          disabled={row.qty <= 0 || actionArticle === row.article}
                          onClick={() =>
                            setShipDialog({ open: true, article: row.article, name: row.name, qty: 1, note: "" })
                          }
                        >
                          Списать
                        </button>
                        <button
                          type="button"
                          className="mini ghost"
                          disabled={actionArticle === row.article}
                          onClick={() =>
                            setAdjustDialog({ open: true, article: row.article, name: row.name, qty: row.qty })
                          }
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="mini warn"
                          disabled={actionArticle === row.article}
                          onClick={() =>
                            setDeleteDialog({ open: true, article: row.article, name: row.name, note: "" })
                          }
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "moves" && (
        <div className="sheet-table-wrap">
          <table className="sheet-table">
            <thead>
              <tr>
                <th style={{ width: 70 }}>ID</th>
                <th>Дата</th>
                <th>Артикул</th>
                <th>Название</th>
                <th style={{ width: 90 }}>Кол-во</th>
                <th>Тип</th>
                <th>Источник</th>
                <th>Примечание</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="empty">Загрузка…</td>
                </tr>
              )}
              {!loading && moveRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty">Движений пока нет.</td>
                </tr>
              )}
              {!loading && moveRows.length > 0 && filteredMoveRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty">Ничего не найдено по фильтру.</td>
                </tr>
              )}
              {filteredMoveRows.map((row) => {
                const isPos = row.qty >= 0;
                return (
                  <tr key={`move-${row.id}`}>
                    <td>{row.id}</td>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td><strong>{row.article}</strong></td>
                    <td>{row.name || "—"}</td>
                    <td style={{ color: isPos ? "#15803d" : "#b91c1c", fontWeight: 700 }}>
                      {row.qty > 0 ? `+${row.qty}` : row.qty}
                    </td>
                    <td>{MOVE_TYPE_LABELS[row.moveType] || row.moveType || "—"}</td>
                    <td>
                      {row.moveType === "receipt" && row.sourceWorkItemId
                        ? `Производство #${row.sourceWorkItemId}`
                        : row.moveType === "receipt"
                          ? "Вручную"
                          : "—"}
                    </td>
                    <td>{row.note || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {shipDialog.open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="dialog-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShipDialog({ open: false, article: "", name: "", qty: 1, note: "" });
          }}
        >
          <div className="dialog-card" style={{ maxWidth: 460 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Списать со склада</div>
            <div style={{ color: "#475569", fontSize: 12, marginBottom: 12 }}>
              <strong>{shipDialog.article}</strong>
              {shipDialog.name ? ` — ${shipDialog.name}` : ""}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800 }}>Количество</span>
                <input
                  type="number"
                  min="1"
                  className="metal-process-field"
                  value={shipDialog.qty}
                  onChange={(e) => setShipDialog((prev) => ({ ...prev, qty: e.target.value }))}
                  autoFocus
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800 }}>Примечание (необязательно)</span>
                <input
                  type="text"
                  className="metal-process-field"
                  placeholder="Куда списали / комментарий"
                  value={shipDialog.note}
                  onChange={(e) => setShipDialog((prev) => ({ ...prev, note: e.target.value }))}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
              <button type="button" className="mini" onClick={() => setShipDialog({ open: false, article: "", name: "", qty: 1, note: "" })}>
                Отмена
              </button>
              <button type="button" className="mini warn" onClick={() => void submitShip()}>
                Списать
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {adjustDialog.open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="dialog-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAdjustDialog({ open: false, article: "", name: "", qty: 0 });
          }}
        >
          <div className="dialog-card" style={{ maxWidth: 460 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Корректировка остатка</div>
            <div style={{ color: "#475569", fontSize: 12, marginBottom: 12 }}>
              <strong>{adjustDialog.article}</strong>
              {adjustDialog.name ? ` — ${adjustDialog.name}` : ""}
            </div>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 800 }}>Новый остаток (абсолютное значение)</span>
              <input
                type="number"
                min="0"
                className="metal-process-field"
                value={adjustDialog.qty}
                onChange={(e) => setAdjustDialog((prev) => ({ ...prev, qty: e.target.value }))}
                autoFocus
              />
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
              <button type="button" className="mini" onClick={() => setAdjustDialog({ open: false, article: "", name: "", qty: 0 })}>
                Отмена
              </button>
              <button type="button" className="mini" onClick={() => void submitAdjust()}>
                Сохранить
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {addDialog.open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="dialog-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAddDialog({ open: false, article: "", query: "", qty: 1, note: "" });
          }}
        >
          <div className="dialog-card" style={{ maxWidth: 520 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Добавить на склад</div>
            <div style={{ color: "#475569", fontSize: 12, marginBottom: 12 }}>
              Начните вводить артикул или название — выберите позицию из списка.
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800 }}>Изделие из каталога</span>
                <CatalogSearchCombobox
                  options={catalogOptions}
                  value={addDialog.article}
                  query={addDialog.query}
                  onQueryChange={handleAddCatalogQuery}
                  onSelect={handleAddCatalogSelect}
                  placeholder="Артикул или название…"
                  autoFocus
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800 }}>Количество</span>
                <input
                  type="number"
                  min="1"
                  className="metal-process-field"
                  value={addDialog.qty}
                  onChange={(e) => setAddDialog((prev) => ({ ...prev, qty: e.target.value }))}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800 }}>Примечание (необязательно)</span>
                <input
                  type="text"
                  className="metal-process-field"
                  placeholder="Откуда поступило"
                  value={addDialog.note}
                  onChange={(e) => setAddDialog((prev) => ({ ...prev, note: e.target.value }))}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
              <button type="button" className="mini" onClick={() => setAddDialog({ open: false, article: "", query: "", qty: 1, note: "" })}>
                Отмена
              </button>
              <button type="button" className="mini" onClick={() => void submitAdd()}>
                Добавить
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {deleteDialog.open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="dialog-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDeleteDialog({ open: false, article: "", name: "", note: "" });
          }}
        >
          <div className="dialog-card" style={{ maxWidth: 460 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Удалить позицию со склада</div>
            <div style={{ color: "#475569", fontSize: 12, marginBottom: 12 }}>
              Позиция <strong>{deleteDialog.article}</strong>
              {deleteDialog.name ? ` — ${deleteDialog.name}` : ""} будет полностью удалена.
              {stockRows.find((r) => r.article === deleteDialog.article)?.qty
                ? ` Остаток ${stockRows.find((r) => r.article === deleteDialog.article)?.qty} шт. спишется в журнал.`
                : ""}
            </div>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 800 }}>Причина (необязательно)</span>
              <input
                type="text"
                className="metal-process-field"
                placeholder="Почему удаляем"
                value={deleteDialog.note}
                onChange={(e) => setDeleteDialog((prev) => ({ ...prev, note: e.target.value }))}
                autoFocus
              />
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
              <button type="button" className="mini" onClick={() => setDeleteDialog({ open: false, article: "", name: "", note: "" })}>
                Отмена
              </button>
              <button type="button" className="mini warn" onClick={() => void submitDelete()}>
                Удалить
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default MetalFinishedStockView;
