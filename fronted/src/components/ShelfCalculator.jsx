import { useMemo, useState } from "react";

const CATALOG = {
  furniture_items: [
    { primary: { code: "GXss2-900hBVO", name: "Система хранения. 2 секции 900 мм. 3 полки с вешалкой. Чёрная. Дуб вотан" }, pairs: [{ text: "полка 887x340", qty: 4 }, { text: "полка 887x330", qty: 2 }] },
    { primary: { code: "GXss2-900hWOS", name: "Система хранения. 2 секции 900 мм. 3 полки с вешалкой. Белая. Дуб сонома" }, pairs: [{ text: "полка 887x340", qty: 4 }, { text: "полка 887x330", qty: 2 }] },
    { primary: { code: "GXss1-900BVO", name: "Система хранения. 1 секция 900 мм. 5 полок. Чёрная. Дуб вотан" }, pairs: [{ text: "полка 887x340", qty: 5 }] },
    { primary: { code: "GXss1-900WOS", name: "Система хранения. 1 секция 900 мм. 5 полок. Белая. Дуб сонома" }, pairs: [{ text: "полка 887x340", qty: 5 }] },
    { primary: { code: "GXss1-900hBVO", name: "Система хранения. 1 секция 900 мм. 3 полки с вешалкой. Чёрная. Дуб вотан" }, pairs: [{ text: "полка 887x340", qty: 2 }, { text: "полка 887x330", qty: 1 }] },
    { primary: { code: "GXss1-900hWOS", name: "Система хранения. 1 секция 900 мм. 3 полки с вешалкой. Белая. Дуб сонома" }, pairs: [{ text: "полка 887x340", qty: 2 }, { text: "полка 887x330", qty: 1 }] },
    { primary: { code: "GXss1-600BVO", name: "Система хранения. 1 секция 600 мм. 5 полок. Чёрная. Дуб вотан" }, pairs: [{ text: "полка 587x340", qty: 5 }] },
    { primary: { code: "GXss1-600WOS", name: "Система хранения. 1 секция 600 мм. 5 полок. Белая. Дуб сонома" }, pairs: [{ text: "полка 587x340", qty: 5 }] },
    { primary: { code: "GXss2-400-600hBVO", name: "Система хранения. 400+600 мм, полки + вешалка. Чёрная. Дуб вотан" }, pairs: [{ text: "полка 387x340", qty: 5 }, { text: "полка 587x330", qty: 1 }] },
    { primary: { code: "GXss2-400-600hWOS", name: "Система хранения. 400+600 мм, полки + вешалка. Белая. Дуб сонома" }, pairs: [{ text: "полка 387x340", qty: 5 }, { text: "полка 587x330", qty: 1 }] },
    { primary: { code: "GXssShelf900BVO", name: "Полка с кронштейном 900, Чёрная. Дуб вотан" }, pairs: [{ text: "полка 887x340", qty: 1 }] },
    { primary: { code: "GXssShelf900WOS", name: "Полка с кронштейном 900, Белая. Дуб сонома" }, pairs: [{ text: "полка 887x340", qty: 1 }] },
    { primary: { code: "GXssShelf600BVO", name: "Полка с кронштейном 600, Чёрная. Дуб вотан" }, pairs: [{ text: "полка 587x340", qty: 1 }] },
    { primary: { code: "GXssShelf600WOS", name: "Полка с кронштейном 600, Белая. Дуб сонома" }, pairs: [{ text: "полка 587x340", qty: 1 }] },
    { primary: { code: "GXssShelf400BVO", name: "Полка с кронштейном 400, Чёрная. Дуб вотан" }, pairs: [{ text: "полка 387x340", qty: 1 }] },
    { primary: { code: "GXssShelf400WOS", name: "Полка с кронштейном 400, Белая. Дуб сонома" }, pairs: [{ text: "полка 387x340", qty: 1 }] },
    { primary: { code: "GXssShShelf900BVO", name: "Полка обувная с кронштейном 900, Чёрная. Дуб вотан" }, pairs: [{ text: "полка 887x330", qty: 1 }] },
    { primary: { code: "GXssShShelf900WOS", name: "Полка обувная с кронштейном 900, Белая. Дуб сонома" }, pairs: [{ text: "полка 887x330", qty: 1 }] },
    { primary: { code: "GXssShShelf600BVO", name: "Полка обувная с кронштейном 600, Чёрная. Дуб вотан" }, pairs: [{ text: "полка 587x330", qty: 1 }] },
    { primary: { code: "GXssShShelf600WOS", name: "Полка обувная с кронштейном 600, Белая. Дуб сонома" }, pairs: [{ text: "полка 587x330", qty: 1 }] },
    { primary: { code: "GXssShShelf400BVO", name: "Полка обувная с кронштейном 400, Чёрная. Дуб вотан" }, pairs: [{ text: "полка 387x330", qty: 1 }] },
    { primary: { code: "GXssShShelf400WOS", name: "Полка обувная с кронштейном 400, Белая. Дуб сонома" }, pairs: [{ text: "полка 387x330", qty: 1 }] },
  ],
};

const CATALOG_MAP = Object.fromEntries(CATALOG.furniture_items.map((item) => [item.primary.code, item]));
let idCounter = 0;

function makeRow(code = "", qty = "") {
  idCounter += 1;
  return { id: idCounter, code, qty };
}

function calcTotals(rows) {
  const totals = {};
  for (const row of rows) {
    const qty = Number(row.qty);
    if (!qty || qty <= 0) continue;
    const item = CATALOG_MAP[row.code];
    if (!item) continue;
    for (const pair of item.pairs) {
      totals[pair.text] = (totals[pair.text] || 0) + pair.qty * qty;
    }
  }
  return totals;
}

function formatQty(value) {
  return Number.isInteger(value) ? String(value) : Number(value || 0).toFixed(1);
}

function ShelfBadge({ text, qty }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: "1px solid #9bd3a5",
        background: "#edf9ef",
        color: "#1f6b2d",
        borderRadius: 8,
        padding: "3px 8px",
        fontSize: 13,
        fontFamily: "monospace",
        whiteSpace: "nowrap",
      }}
    >
      <b>{formatQty(qty)}</b> x {text}
    </span>
  );
}

export default function ShelfCalculator() {
  const [rows, setRows] = useState([makeRow()]);
  const [activeRowId, setActiveRowId] = useState(0);
  const [search, setSearch] = useState("");
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);

  const suggestions = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return [];
    return CATALOG.furniture_items.filter((it) =>
      it.primary.code.toLowerCase().includes(q) || it.primary.name.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [search]);

  const totals = useMemo(() => calcTotals(rows), [rows]);
  const totalEntries = Object.entries(totals).sort((a, b) => a[0].localeCompare(b[0], "ru"));
  const activeRows = rows.filter((r) => Number(r.qty) > 0 && CATALOG_MAP[r.code]);

  function updateRow(id, patch) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow(code = "", qty = "") {
    setRows((prev) => [...prev, makeRow(code, qty)]);
  }

  function removeRow(id) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }

  return (
    <div
      className="sheet-table-wrap"
      style={{
        maxWidth: 1060,
        margin: "0 auto",
        padding: 14,
        boxSizing: "border-box",
        minHeight: 640,
        alignContent: "start",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "linear-gradient(135deg, #2f9e44, #1b5e20)",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
          }}
        >
          Ш
        </div>
        <div>
          <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.02 }}>Калькулятор полок GX</div>
          <div style={{ fontSize: 14, color: "#64748b", marginTop: 2 }}>
            Введите артикулы системы хранения и количество — получите разбивку полок
          </div>
        </div>
      </div>
      <div style={{ height: 1, background: "#e2e8f0", marginBottom: 12 }} />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 116px 34px", gap: 10, marginBottom: 6 }}>
        <div style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase" }}>Артикул системы хранения</div>
        <div style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", textAlign: "center" }}>Кол-во</div>
        <div />
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((row, idx) => {
          const item = CATALOG_MAP[row.code];
          const isValid = Boolean(item);
          const isActive = activeRowId === row.id;

          return (
            <div key={row.id} style={{ display: "grid", gap: 4 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 116px 34px", gap: 10, alignItems: "center" }}>
                <div style={{ position: "relative" }}>
                  <input
                    value={row.code}
                    onChange={(e) => {
                      updateRow(row.id, { code: e.target.value });
                      setSearch(e.target.value);
                      setActiveRowId(row.id);
                    }}
                    onFocus={() => {
                      setSearch(row.code);
                      setActiveRowId(row.id);
                    }}
                    onBlur={() => setTimeout(() => setActiveRowId(0), 120)}
                    placeholder={idx === 0 ? "GXss1-900WOS  или поиск..." : "Артикул"}
                    style={{
                      width: "100%",
                      minHeight: 38,
                      border: `1.5px solid ${isValid ? "#4caf50" : "#cbd5e1"}`,
                      borderRadius: 10,
                      padding: "7px 36px 7px 34px",
                      fontFamily: "monospace",
                      fontSize: 15,
                      boxSizing: "border-box",
                    }}
                  />
                  <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 12 }}>
                    {idx + 1}
                  </span>
                  {isValid && (
                    <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#22a044", fontSize: 18 }}>
                      ✓
                    </span>
                  )}
                  {isActive && suggestions.length > 0 && (
                    <div style={{ position: "absolute", zIndex: 30, top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 10, maxHeight: 220, overflow: "auto", boxShadow: "0 8px 20px rgba(15,23,42,0.12)" }}>
                      {suggestions.map((s) => (
                        <button
                          key={s.primary.code}
                          type="button"
                          onMouseDown={() => {
                            updateRow(row.id, { code: s.primary.code });
                            setSearch("");
                            setActiveRowId(0);
                          }}
                          style={{ width: "100%", border: "none", background: "#fff", textAlign: "left", padding: "8px 10px", cursor: "pointer" }}
                        >
                          <div style={{ fontFamily: "monospace", fontSize: 13, color: "#185f2a" }}>{s.primary.code}</div>
                          <div style={{ fontSize: 12, color: "#64748b" }}>{s.primary.name}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  type="number"
                  min="1"
                  value={row.qty}
                  onChange={(e) => updateRow(row.id, { qty: e.target.value })}
                  placeholder="1"
                  style={{
                    width: "100%",
                    minHeight: 38,
                    textAlign: "center",
                    border: "1px solid #cbd5e1",
                    borderRadius: 10,
                    fontWeight: 700,
                    fontSize: 24,
                    color: "#0f172a",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  style={{
                    width: 30,
                    height: 30,
                    border: "none",
                    borderRadius: 8,
                    background: "#fbe8e8",
                    color: "#ef4444",
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
              {item && (
                <div style={{ fontSize: 13, color: "#5a975a", paddingLeft: 34, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.primary.name} ({item.pairs.map((p) => `${p.qty}x ${p.text}`).join(", ")})
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="actions" style={{ marginTop: 10 }}>
        <button type="button" className="mini" onClick={() => addRow()}>+ Добавить строку</button>
        <button type="button" className="mini secondary" onClick={() => setRows([makeRow()])}>Очистить</button>
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={() => setIsCatalogOpen((v) => !v)}
          style={{
            border: "none",
            background: "transparent",
            color: "#64748b",
            fontSize: 14,
            padding: 0,
            cursor: "pointer",
          }}
        >
          {isCatalogOpen ? "▼" : "▶"} Справочник артикулов ({CATALOG.furniture_items.length} позиций)
        </button>

        <div
          style={{
            marginTop: 8,
            border: "1px solid #dbe5d8",
            borderRadius: 10,
            height: 280,
            overflow: "hidden",
            visibility: isCatalogOpen ? "visible" : "hidden",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "210px 1fr auto", gap: 8, background: "#e9f5e9", color: "#1d6b2c", fontWeight: 700, padding: "8px 12px" }}>
            <span>Артикул</span>
            <span>Наименование</span>
            <span>Полки</span>
          </div>
          <div style={{ maxHeight: 244, overflowY: "auto" }}>
            {CATALOG.furniture_items.map((it) => (
              <button
                key={it.primary.code}
                type="button"
                onClick={() => {
                  const empty = rows.find((r) => !r.code);
                  if (empty) {
                    updateRow(empty.id, { code: it.primary.code });
                  } else {
                    addRow(it.primary.code, 1);
                  }
                }}
                style={{
                  width: "100%",
                  border: "none",
                  borderTop: "1px solid #eef3ee",
                  background: "#fff",
                  textAlign: "left",
                  padding: "8px 12px",
                  display: "grid",
                  gridTemplateColumns: "210px 1fr auto",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontFamily: "monospace", color: "#1f6b2d", fontWeight: 700 }}>{it.primary.code}</span>
                <span style={{ color: "#334155" }}>{it.primary.name}</span>
                <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
                  {it.pairs.map((p) => (
                    <ShelfBadge key={p.text} text={p.text} qty={p.qty} />
                  ))}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Итого полок:</div>
        {activeRows.length === 0 ? (
          <div className="empty">Введите артикулы и количество.</div>
        ) : (
          <div style={{ border: "2px solid #4caf50", borderRadius: 14, background: "#f8fdf8", padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 20 }}>📦</span>
              <span style={{ fontSize: 30, fontWeight: 800, color: "#1d6b2c" }}>ИТОГО ПОЛОК</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {totalEntries.map(([name, qty]) => (
                <div key={name} style={{ border: "1px solid #9bd3a5", borderRadius: 12, background: "#fff", padding: "10px 14px", minWidth: 190 }}>
                  <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1, color: "#1f6b2d" }}>{formatQty(qty)}</div>
                  <div style={{ marginTop: 4, fontFamily: "monospace", color: "#3a7a47", fontSize: 16 }}>{name}</div>
                </div>
              ))}
            </div>
            <div style={{ height: 1, background: "#cbe5ce", margin: "14px 0" }} />
            <div style={{ fontSize: 16, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Разбивка по строкам</div>
            <div style={{ display: "grid", gap: 6 }}>
              {activeRows.map((r) => {
                const item = CATALOG_MAP[r.code];
                const qty = Number(r.qty);
                return (
                  <div key={r.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, paddingBottom: 6, borderBottom: "1px dashed #dbe5d9" }}>
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", borderRadius: 8, background: "#e6f6e9", border: "1px solid #b9dfc0", padding: "2px 7px", fontFamily: "monospace", fontSize: 13, color: "#1f6b2d" }}>
                      <b>{r.code}</b> x{qty}
                    </span>
                    <span style={{ color: "#64748b" }}>→</span>
                    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
                      {item.pairs.map((p) => (
                        <ShelfBadge key={`${r.id}-${p.text}`} text={p.text} qty={p.qty * qty} />
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
