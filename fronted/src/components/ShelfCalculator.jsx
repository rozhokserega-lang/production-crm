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

function normalizeCatalogCode(code) {
  return String(code || "").trim().toUpperCase();
}

const CATALOG_MAP = Object.fromEntries(
  CATALOG.furniture_items.map((item) => [normalizeCatalogCode(item.primary.code), item]),
);

function getCatalogItemByCode(code) {
  return CATALOG_MAP[normalizeCatalogCode(code)] || null;
}
const SHEET_FORMATS = [
  { key: "2800x2070", label: "Лист 2800 x 2070 мм", width: 2800, height: 2070 },
  { key: "2750x1830", label: "Лист 2750 x 1830 мм", width: 2750, height: 1830 },
  { key: "2440x1830", label: "Лист 2440 x 1830 мм", width: 2440, height: 1830 },
];
const COLOR_ORDER = ["Вотан", "Сонома", "Не определен"];
const MATERIAL_OPTIONS = ["Дуб Вотан", "сонома / бардолино"];
let idCounter = 0;

function makeRow(code = "", qty = "") {
  idCounter += 1;
  return { id: idCounter, code, qty };
}

function calcTotals(rows) {
  const totals = {};
  const byColor = {};
  for (const row of rows) {
    const qty = Number(row.qty);
    if (!qty || qty <= 0) continue;
    const item = getCatalogItemByCode(row.code);
    if (!item) continue;
    const color = resolveColor(item);
    if (!byColor[color]) byColor[color] = {};
    for (const pair of item.pairs) {
      totals[pair.text] = (totals[pair.text] || 0) + pair.qty * qty;
      byColor[color][pair.text] = (byColor[color][pair.text] || 0) + pair.qty * qty;
    }
  }
  return { totals, byColor };
}

function formatQty(value) {
  return Number.isInteger(value) ? String(value) : Number(value || 0).toFixed(1);
}

function resolveColor(item) {
  const code = String(item?.primary?.code || "").toUpperCase();
  const name = String(item?.primary?.name || "").toLowerCase();
  if (code.includes("BVO") || name.includes("вотан")) return "Вотан";
  if (code.includes("WOS") || name.includes("сонома")) return "Сонома";
  return "Не определен";
}

function defaultMaterialByColor(color) {
  if (color === "Вотан") return "Дуб Вотан";
  if (color === "Сонома") return "сонома / бардолино";
  return "Дуб Бардолино";
}

function buildShelfOrderItemName(shelfName, materialName) {
  const base = String(shelfName || "").trim();
  const material = String(materialName || "").toLowerCase();
  let colorTag = "";
  if (material.includes("вотан")) colorTag = "Вотан";
  else if (material.includes("бардолино") || material.includes("соном")) colorTag = "Бардолино";
  return colorTag ? `${base} (${colorTag})` : base;
}

function parseShelfSize(text) {
  const m = String(text || "").match(/(\d+)\s*[xх]\s*(\d+)/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!(a > 0) || !(b > 0)) return null;
  return { width: Math.max(a, b), height: Math.min(a, b) };
}

function canFitInSheet(piece, sheetW, sheetH, cutGap) {
  const gw = piece.width + cutGap;
  const gh = piece.height + cutGap;
  return (gw <= sheetW && gh <= sheetH) || (gh <= sheetW && gw <= sheetH);
}

function fitToRows(piece, rows, sheetW, cutGap) {
  const variants = [
    { w: piece.width + cutGap, h: piece.height + cutGap },
    { w: piece.height + cutGap, h: piece.width + cutGap },
  ];
  for (const v of variants) {
    for (const row of rows) {
      if (v.h <= row.height && row.used + v.w <= sheetW) {
        row.used += v.w;
        return true;
      }
    }
  }
  return false;
}

function estimateSheets(details, sheetW, sheetH, cutGap = 3) {
  const pieces = [];
  for (const d of details) {
    const size = parseShelfSize(d.name);
    if (!size) continue;
    const qty = Number(d.qty || 0);
    if (!(qty > 0)) continue;
    if (!canFitInSheet(size, sheetW, sheetH, cutGap)) {
      return { ok: false, reason: `Деталь ${d.name} не помещается в выбранный лист.` };
    }
    for (let i = 0; i < qty; i += 1) {
      pieces.push(size);
    }
  }
  if (!pieces.length) return { ok: true, sheets: 0, utilization: 0 };

  pieces.sort((a, b) => b.width * b.height - a.width * a.height);

  const sheets = [];
  for (const piece of pieces) {
    let placed = false;
    for (const sheet of sheets) {
      if (fitToRows(piece, sheet.rows, sheetW, cutGap)) {
        placed = true;
        break;
      }
      const variants = [
        { w: piece.width + cutGap, h: piece.height + cutGap },
        { w: piece.height + cutGap, h: piece.width + cutGap },
      ];
      for (const v of variants) {
        if (sheet.usedHeight + v.h <= sheetH && v.w <= sheetW) {
          sheet.rows.push({ height: v.h, used: v.w });
          sheet.usedHeight += v.h;
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) {
      const variants = [
        { w: piece.width + cutGap, h: piece.height + cutGap },
        { w: piece.height + cutGap, h: piece.width + cutGap },
      ];
      const first = variants.find((v) => v.w <= sheetW && v.h <= sheetH);
      if (!first) return { ok: false, reason: "Некоторые детали не помещаются в лист." };
      sheets.push({
        rows: [{ height: first.h, used: first.w }],
        usedHeight: first.h,
      });
    }
  }

  const detailsArea = pieces.reduce((s, p) => s + p.width * p.height, 0);
  const totalArea = sheets.length * sheetW * sheetH;
  const utilization = totalArea > 0 ? (detailsArea / totalArea) * 100 : 0;
  return { ok: true, sheets: sheets.length, utilization };
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

export default function ShelfCalculator({ canOperateProduction = false, onCreatePlanOrder }) {
  const [rows, setRows] = useState([makeRow()]);
  const [activeRowId, setActiveRowId] = useState(0);
  const [search, setSearch] = useState("");
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [sheetFormatKey, setSheetFormatKey] = useState(SHEET_FORMATS[0].key);
  const [cutGap, setCutGap] = useState("3");
  const [cutColor, setCutColor] = useState("all");
  const [cutResult, setCutResult] = useState(null);
  const [selectedShelves, setSelectedShelves] = useState([]);
  const [planWeek, setPlanWeek] = useState("");
  const [planLoading, setPlanLoading] = useState(false);

  const suggestions = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return [];
    return CATALOG.furniture_items.filter((it) =>
      it.primary.code.toLowerCase().includes(q) || it.primary.name.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [search]);

  const totalsData = useMemo(() => calcTotals(rows), [rows]);
  const totalEntries = Object.entries(totalsData.totals).sort((a, b) => a[0].localeCompare(b[0], "ru"));
  const totalDisplayCards = useMemo(() => {
    const cards = [];
    totalEntries.forEach(([name, qty]) => {
      const parts = COLOR_ORDER
        .map((colorName) => ({
          colorName,
          colorQty: Number(totalsData.byColor[colorName]?.[name] || 0),
        }))
        .filter((x) => x.colorQty > 0);
      if (parts.length > 1) {
        parts.forEach((p) => {
          cards.push({
            key: `${name}-${p.colorName}`,
            name,
            qty: p.colorQty,
            color: p.colorName,
          });
        });
        return;
      }
      cards.push({
        key: `${name}-all`,
        name,
        qty: Number(qty || 0),
        color: parts[0]?.colorName || "all",
      });
    });
    return cards;
  }, [totalEntries, totalsData.byColor]);
  const activeRows = rows.filter((r) => Number(r.qty) > 0 && getCatalogItemByCode(r.code));
  const defaultArticleByCardKey = useMemo(() => {
    const byCard = new Map();
    const byCardArticleSystems = new Map();
    activeRows.forEach((r) => {
      const item = getCatalogItemByCode(r.code);
      if (!item) return;
      const article = String(item?.primary?.code || "").trim();
      if (!article) return;
      const rowQty = Number(r.qty || 0);
      if (!(rowQty > 0)) return;
      const color = resolveColor(item);
      item.pairs.forEach((pair) => {
        const pairQty = Number(pair?.qty || 0);
        if (!(pairQty > 0)) return;
        const name = String(pair?.text || "").trim();
        if (!name) return;
        const cardKey = `${name}-${color}`;
        const score = rowQty * pairQty;
        const prev = byCard.get(cardKey);
        if (!prev || score > prev.score) byCard.set(cardKey, { article, score });
        const articleSystems = byCardArticleSystems.get(cardKey) || new Map();
        articleSystems.set(article, Number(articleSystems.get(article) || 0) + rowQty);
        byCardArticleSystems.set(cardKey, articleSystems);
      });
    });
    const map = new Map();
    const qrQtyMap = new Map();
    byCard.forEach((v, k) => {
      const article = String(v.article || "").trim();
      map.set(k, article);
      const articleSystems = byCardArticleSystems.get(k) || new Map();
      qrQtyMap.set(k, Number(articleSystems.get(article) || 0));
    });
    return { articleByCard: map, qrQtyByCard: qrQtyMap };
  }, [activeRows]);

  function updateRow(id, patch) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow(code = "", qty = "") {
    setRows((prev) => [...prev, makeRow(code, qty)]);
  }

  function removeRow(id) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }

  function runCutEstimate() {
    const format = SHEET_FORMATS.find((x) => x.key === sheetFormatKey) || SHEET_FORMATS[0];
    const sourceTotals =
      cutColor === "all"
        ? totalsData.totals
        : totalsData.byColor[cutColor] || {};
    const details = Object.entries(sourceTotals).map(([name, qty]) => ({ name, qty }));
    const gap = Math.max(0, Number(String(cutGap).replace(",", ".")) || 0);
    const result = estimateSheets(details, format.width, format.height, gap);
    setCutResult({ ...result, format, gap, color: cutColor });
  }

  function toggleShelfCard(card) {
    setSelectedShelves((prev) => {
      const exists = prev.some((x) => x.id === card.key);
      if (exists) return prev.filter((x) => x.id !== card.key);
      return [
        ...prev,
        {
          id: card.key,
          color: card.color,
          name: card.name,
          qty: String(Number(card.qty || 0)),
          material: defaultMaterialByColor(card.color),
          article: String(defaultArticleByCardKey.articleByCard.get(card.key) || ""),
          qrQty: String(Number(defaultArticleByCardKey.qrQtyByCard.get(card.key) || 0) || ""),
        },
      ];
    });
    setCutColor(card.color === "Не определен" ? "all" : card.color);
  }

  function updateSelectedShelf(id, patch) {
    setSelectedShelves((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function createShelfOrder() {
    if (!selectedShelves.length || typeof onCreatePlanOrder !== "function") return;
    const week = String(planWeek || "").trim();
    if (!week) return;
    const rowsToCreate = selectedShelves
      .map((s) => ({
        ...s,
        qtyNum: Number(String(s.qty || "").replace(",", ".")),
      }))
      .filter((s) => s.qtyNum > 0 && String(s.material || "").trim() && String(s.name || "").trim());
    if (!rowsToCreate.length) return;
    setPlanLoading(true);
    try {
      for (const s of rowsToCreate) {
        const inferred =
          activeRows
            .map((r) => {
              const catalogItem = getCatalogItemByCode(r.code);
              if (!catalogItem) return null;
              const color = resolveColor(catalogItem);
              if (String(s.color || "") !== String(color || "")) return null;
              const pair = (catalogItem.pairs || []).find((p) => String(p?.text || "").trim() === String(s.name || "").trim());
              if (!pair) return null;
              return {
                article: String(catalogItem.primary?.code || "").trim(),
                systemsQty: Number(r.qty || 0),
                pairQty: Number(pair.qty || 0),
              };
            })
            .filter(Boolean)
            .sort((a, b) => (b.systemsQty * b.pairQty) - (a.systemsQty * a.pairQty))[0] || null;
        const article = String(s.article || inferred?.article || "").trim();
        const qrQty = Number(String(s.qrQty || "").replace(",", ".")) || Number(inferred?.systemsQty || 0) || 0;
        await onCreatePlanOrder({
          item: buildShelfOrderItemName(s.name, s.material),
          article,
          material: String(s.material || "").trim(),
          week,
          qty: s.qtyNum,
          qrQty,
        });
      }
      setSelectedShelves([]);
      setPlanWeek("");
    } catch {
      // Error message is handled by parent screen.
    } finally {
      setPlanLoading(false);
    }
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
          const item = getCatalogItemByCode(row.code);
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
              {totalDisplayCards.map((card) => (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => toggleShelfCard(card)}
                  style={{
                    border: selectedShelves.some((s) => s.id === card.key) ? "2px solid #2f9e44" : "1px solid #9bd3a5",
                    borderRadius: 12,
                    background: "#fff",
                    padding: "10px 14px",
                    minWidth: 210,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1, color: "#1f6b2d" }}>{formatQty(card.qty)}</div>
                  <div style={{ marginTop: 4, fontFamily: "monospace", color: "#3a7a47", fontSize: 16 }}>{card.name}</div>
                  <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                    <span
                      style={{
                        fontSize: 12,
                        borderRadius: 999,
                        padding: "2px 8px",
                        border: "1px solid #cfe7d3",
                        background: "#f3fbf4",
                        color: "#1f6b2d",
                      }}
                    >
                      {card.color === "all" ? "Все цвета" : card.color}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            {selectedShelves.length > 0 && (
              <div style={{ margin: "14px 0", border: "1px solid #94c8a1", borderRadius: 12, background: "#f3fbf4", padding: 12 }}>
                <div style={{ fontWeight: 700, color: "#1f6b2d", marginBottom: 8 }}>
                  Заказ в работу: выбрано позиций {selectedShelves.length}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
                  <div style={{ width: 160 }}>
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>План (неделя)</div>
                    <input value={planWeek} onChange={(e) => setPlanWeek(e.target.value.replace(/[^\d]/g, ""))} placeholder="72" />
                  </div>
                  <button
                    type="button"
                    className="mini ok"
                    disabled={
                      !canOperateProduction ||
                      planLoading ||
                      !String(planWeek).trim() ||
                      !selectedShelves.some((s) => Number(String(s.qty || "").replace(",", ".")) > 0)
                    }
                    onClick={createShelfOrder}
                  >
                    {planLoading ? "Отправляю..." : `Отправить в работу (${selectedShelves.length})`}
                  </button>
                </div>
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {selectedShelves.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        alignItems: "end",
                      }}
                    >
                      <div style={{ flex: "1 1 220px", minWidth: 180 }}>
                        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Позиция</div>
                        <input value={`${s.name} (${s.color === "all" ? "Все цвета" : s.color})`} readOnly />
                      </div>
                      <div style={{ width: 100 }}>
                        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Кол-во</div>
                        <input
                          value={s.qty}
                          onChange={(e) => updateSelectedShelf(s.id, { qty: e.target.value.replace(/[^0-9.,]/g, "") })}
                        />
                      </div>
                      <div style={{ flex: "1 1 190px", minWidth: 160 }}>
                        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Материал</div>
                        <select value={s.material} onChange={(e) => updateSelectedShelf(s.id, { material: e.target.value })}>
                          {MATERIAL_OPTIONS.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ flex: "1 1 220px", minWidth: 180 }}>
                        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Артикул заказа</div>
                        <input value={s.article} onChange={(e) => updateSelectedShelf(s.id, { article: e.target.value })} />
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedShelves((prev) => prev.filter((x) => x.id !== s.id))}
                        title="Убрать позицию"
                        style={{
                          height: 36,
                          border: "1px solid #f3b3b3",
                          borderRadius: 8,
                          background: "#fff1f1",
                          color: "#b42318",
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ height: 1, background: "#cbe5ce", margin: "14px 0" }} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end", marginBottom: 12 }}>
              <div style={{ minWidth: 150 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Цвет</div>
                <select value={cutColor} onChange={(e) => setCutColor(e.target.value)}>
                  <option value="all">Все цвета</option>
                  <option value="Вотан">Вотан</option>
                  <option value="Сонома">Сонома</option>
                </select>
              </div>
              <div style={{ minWidth: 220 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Размер листа</div>
                <select value={sheetFormatKey} onChange={(e) => setSheetFormatKey(e.target.value)}>
                  {SHEET_FORMATS.map((f) => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ width: 130 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Пропил, мм</div>
                <input
                  inputMode="decimal"
                  value={cutGap}
                  onChange={(e) => setCutGap(e.target.value.replace(/[^0-9.,]/g, ""))}
                  placeholder="3"
                />
              </div>
              <button type="button" className="mini" onClick={runCutEstimate}>
                Раскроить
              </button>
            </div>
            {cutResult && (
              <div
                style={{
                  border: `1px solid ${cutResult.ok ? "#9bd3a5" : "#f8b4b4"}`,
                  borderRadius: 12,
                  background: cutResult.ok ? "#edf9ef" : "#fff1f1",
                  color: cutResult.ok ? "#1f6b2d" : "#b91c1c",
                  padding: "10px 12px",
                  marginBottom: 12,
                }}
              >
                {cutResult.ok ? (
                  <>
                    <b>Нужно листов: {cutResult.sheets}</b>
                    <span style={{ marginLeft: 10 }}>
                      ({cutResult.color === "all" ? "все цвета" : cutResult.color}, {cutResult.format.width}x{cutResult.format.height}, пропил {cutResult.gap} мм, заполнение {cutResult.utilization.toFixed(1)}%)
                    </span>
                  </>
                ) : (
                  <b>{cutResult.reason}</b>
                )}
              </div>
            )}
            <div style={{ fontSize: 16, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Разбивка по строкам</div>
            <div style={{ display: "grid", gap: 6 }}>
              {activeRows.map((r) => {
                const item = getCatalogItemByCode(r.code);
                const qty = Number(r.qty);
                return (
                  <div key={r.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, paddingBottom: 6, borderBottom: "1px dashed #dbe5d9" }}>
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", borderRadius: 8, background: "#e6f6e9", border: "1px solid #b9dfc0", padding: "2px 7px", fontFamily: "monospace", fontSize: 13, color: "#1f6b2d" }}>
                      <b>{r.code}</b> x{qty}
                    </span>
                    <span style={{ fontSize: 12, color: "#64748b" }}>
                      [{resolveColor(item)}]
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
