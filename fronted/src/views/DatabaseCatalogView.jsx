import { useCallback, useEffect, useMemo, useState } from "react";
import { OrderService } from "../services/orderService";
import { toUserError } from "../app/errorCatalogHelpers";

function normalizeRow(r) {
  return {
    article: String(r?.article || "").trim(),
    itemName: String(r?.item_name ?? r?.itemName ?? "").trim(),
    source: String(r?.source || "").trim() || "manual",
    sectionName: String(r?.section_name ?? r?.sectionName ?? "").trim(),
    tableColor: String(r?.table_color ?? r?.tableColor ?? "").trim(),
    sortOrder: Number(r?.sort_order ?? r?.sortOrder ?? 999) || 999,
  };
}

function emptyForm() {
  return {
    prevArticle: "",
    article: "",
    itemName: "",
    source: "manual",
    sectionName: "",
    tableColor: "",
    sortOrder: 999,
  };
}

export function DatabaseCatalogView({ canAdminSettings, refreshPlanCatalogs, load }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [formMode, setFormMode] = useState(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await OrderService.getItemArticleMapAdmin();
      const list = Array.isArray(data) ? data.map(normalizeRow) : [];
      setRows(list);
    } catch (e) {
      setError(toUserError(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredRows = useMemo(() => {
    const n = String(filter || "").trim().toLowerCase();
    if (!n) return rows;
    return rows.filter((r) => {
      const hay = [
        r.article,
        r.itemName,
        r.sectionName,
        r.tableColor,
        r.source,
        String(r.sortOrder),
      ]
        .join("\n")
        .toLowerCase();
      return hay.includes(n);
    });
  }, [rows, filter]);

  const syncCaches = useCallback(async () => {
    if (typeof refreshPlanCatalogs === "function") {
      try {
        await refreshPlanCatalogs();
      } catch (_) {
        /* ignore */
      }
    }
    if (typeof load === "function") {
      try {
        await load();
      } catch (_) {
        /* ignore */
      }
    }
  }, [refreshPlanCatalogs, load]);

  const onSave = useCallback(async () => {
    const article = String(form.article || "").trim();
    const itemName = String(form.itemName || "").trim();
    if (!article || !itemName) {
      setError("Заполните артикул и название изделия.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await OrderService.adminUpsertItemArticleMapRow({
        prevArticle: formMode === "edit" ? String(form.prevArticle || "").trim() : "",
        article,
        itemName,
        source: String(form.source || "").trim() || "manual",
        sectionName: String(form.sectionName || "").trim(),
        tableColor: String(form.tableColor || "").trim(),
        sortOrder: Number(String(form.sortOrder).replace(",", ".")) || 999,
      });
      setForm(emptyForm());
      setFormMode(null);
      await loadRows();
      await syncCaches();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setSaving(false);
    }
  }, [form, formMode, loadRows, syncCaches]);

  const onDelete = useCallback(
    async (article) => {
      const a = String(article || "").trim();
      if (!a) return;
      if (!window.confirm(`Удалить строку с артикулом «${a}» из каталога?`)) return;
      setSaving(true);
      setError("");
      try {
        await OrderService.adminDeleteItemArticleMapRow(a);
        if (formMode === "edit" && String(form.prevArticle || "").trim() === a) {
          setForm(emptyForm());
          setFormMode(null);
        }
        await loadRows();
        await syncCaches();
      } catch (e) {
        setError(toUserError(e));
      } finally {
        setSaving(false);
      }
    },
    [form.prevArticle, formMode, loadRows, syncCaches],
  );

  const startEdit = useCallback((r) => {
    setFormMode("edit");
    setForm({
      prevArticle: r.article,
      article: r.article,
      itemName: r.itemName,
      source: r.source || "manual",
      sectionName: r.sectionName,
      tableColor: r.tableColor,
      sortOrder: r.sortOrder,
    });
    setError("");
  }, []);

  const startCreate = useCallback(() => {
    setFormMode("create");
    setForm(emptyForm());
    setError("");
  }, []);

  const cancelForm = useCallback(() => {
    setForm(emptyForm());
    setFormMode(null);
    setError("");
  }, []);

  useEffect(() => {
    if (!canAdminSettings) return;
    void loadRows();
  }, [canAdminSettings, loadRows]);

  if (!canAdminSettings) return null;

  return (
    <div className="admin-panel">
      <div className="admin-panel__head">
        <div className="admin-panel__title">БД: соответствия артикулов</div>
        <button type="button" className="mini" disabled={loading || saving} onClick={() => void loadRows()}>
          {loading ? "Загрузка…" : "Обновить из БД"}
        </button>
      </div>
      <div className="line2" style={{ marginBottom: 12, maxWidth: 920 }}>
        Таблица <code>item_article_map</code>: связь артикула с изделием, секцией отгрузки и цветом/материалом
        (колонка цвета в плане). Изменения сразу пишутся в Postgres; после сохранения обновляются кэши отгрузки
        и диалога плана.
      </div>
      <div className="line2" style={{ marginBottom: 12, color: "#b45309", maxWidth: 920 }}>
        Строки с источником вроде <code>xlsx_catalog</code> обычно приходят из импорта Excel; правки здесь
        перезапишут БД и могут разойтись с файлом соответствий при следующем импорте.
      </div>

      <div className="admin-panel__create" style={{ flexWrap: "wrap", gap: 8 }}>
        <input
          placeholder="Фильтр по любому полю…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ minWidth: 200, flex: "1 1 200px" }}
        />
        <button type="button" className="mini ok" disabled={saving} onClick={startCreate}>
          Новая строка
        </button>
      </div>

      {(formMode || form.article || form.itemName) && (
        <div
          className="admin-panel__create"
          style={{
            flexDirection: "column",
            alignItems: "stretch",
            gap: 10,
            marginTop: 12,
            padding: 12,
            border: "1px solid rgba(0,0,0,.08)",
            borderRadius: 8,
          }}
        >
          <div style={{ fontWeight: 600 }}>
            {formMode === "edit" ? "Редактирование" : "Новая запись"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              Артикул
              <input
                value={form.article}
                onChange={(e) => setForm((f) => ({ ...f, article: e.target.value }))}
                disabled={saving}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              Изделие (item_name)
              <input
                value={form.itemName}
                onChange={(e) => setForm((f) => ({ ...f, itemName: e.target.value }))}
                disabled={saving}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              Секция
              <input
                value={form.sectionName}
                onChange={(e) => setForm((f) => ({ ...f, sectionName: e.target.value }))}
                disabled={saving}
                placeholder="Как в отгрузке"
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              Цвет / материал (table_color)
              <input
                value={form.tableColor}
                onChange={(e) => setForm((f) => ({ ...f, tableColor: e.target.value }))}
                disabled={saving}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              Источник (source)
              <input
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                disabled={saving}
                placeholder="manual, xlsx_catalog…"
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              Порядок (sort_order)
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                disabled={saving}
              />
            </label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="mini ok" disabled={saving} onClick={() => void onSave()}>
              {saving ? "Сохранение…" : "Записать в БД"}
            </button>
            <button type="button" className="mini" disabled={saving} onClick={cancelForm}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {error ? <div className="error-banner" style={{ marginTop: 12 }}>{error}</div> : null}

      {!loading && rows.length === 0 && !error ? (
        <div className="empty" style={{ marginTop: 16 }}>
          Нет данных. Нажмите «Обновить из БД» (нужны права админа и применённая миграция RPC на сервере).
        </div>
      ) : null}

      {rows.length > 0 && (
        <div className="sheet-table-wrap" style={{ marginTop: 16 }}>
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Артикул</th>
                <th>Изделие</th>
                <th>Секция</th>
                <th>Цвет / материал</th>
                <th>Источник</th>
                <th>Порядок</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.article}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.article}</td>
                  <td>{r.itemName}</td>
                  <td>{r.sectionName || "—"}</td>
                  <td>{r.tableColor || "—"}</td>
                  <td style={{ fontSize: 12 }}>{r.source}</td>
                  <td>{r.sortOrder}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="mini" disabled={saving} onClick={() => startEdit(r)}>
                      Изменить
                    </button>{" "}
                    <button
                      type="button"
                      className="mini"
                      style={{ color: "#b91c1c" }}
                      disabled={saving}
                      onClick={() => void onDelete(r.article)}
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading ? <div className="empty" style={{ marginTop: 16 }}>Загрузка…</div> : null}

      {rows.length > 0 && filteredRows.length === 0 && !loading ? (
        <div className="empty" style={{ marginTop: 12 }}>Ничего не найдено по фильтру.</div>
      ) : null}
    </div>
  );
}
