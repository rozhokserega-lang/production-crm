import { useEffect, useMemo, useState } from "react";
import ShelfCalculator from "../components/ShelfCalculator";

export function FurnitureView({
  furnitureLoading,
  furnitureError,
  furnitureSheetData,
  furnitureSelectedProduct,
  setFurnitureSelectedProduct,
  furnitureTemplates,
  furnitureProductLabel,
  furnitureSelectedQty,
  setFurnitureSelectedQty,
  furnitureGeneratedDetails,
  furnitureSelectedTemplate,
  furnitureQtyNumber,
  canOperateProduction,
  createShelfPlanOrder,
  createFurniturePlanOrder,
  furnitureArticleSearchRows,
  furnitureCustomTemplates,
  callBackend,
  load,
  refreshPlanCatalogs,
}) {
  const [furnitureSubTab, setFurnitureSubTab] = useState("main");
  const [planWeek, setPlanWeek] = useState("");
  const [planSaving, setPlanSaving] = useState(false);
  const [articleQuery, setArticleQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createSection, setCreateSection] = useState("Прочее");
  const [createName, setCreateName] = useState("");
  const [createVariants, setCreateVariants] = useState([]);
  const [createKitsPerSheet, setCreateKitsPerSheet] = useState("");
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createOk, setCreateOk] = useState("");
  const [createDetails, setCreateDetails] = useState([]);
  const [createDetailsNonce, setCreateDetailsNonce] = useState(0);
  const [editingExisting, setEditingExisting] = useState(false);

  function makeVariantRow(article = "", color = "") {
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      article,
      color,
    };
  }

  function makeDetailRow(detailName = "", perUnit = "") {
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      detailName,
      perUnit,
    };
  }

  function parseNumInput(v) {
    const n = Number(String(v ?? "").replace(",", ".").trim());
    return Number.isFinite(n) ? n : 0;
  }

  function buildPerUnitDetailsFromCurrentCalculation() {
    const denom = Number(furnitureQtyNumber || 0) || 0;
    if (!(denom > 0)) return [];
    return (Array.isArray(furnitureGeneratedDetails) ? furnitureGeneratedDetails : [])
      .map((d) => {
        const name = String(d?.detailName || "").trim();
        const rawQty = Number(d?.qty || 0) || 0;
        const perUnit = denom > 0 ? rawQty / denom : 0;
        const rounded = Math.round(perUnit * 1000) / 1000;
        if (!name || !(rounded > 0)) return null;
        return makeDetailRow(name, String(rounded));
      })
      .filter(Boolean);
  }

  function buildPerUnitDetailsFromCustomTemplate(productName) {
    const name = String(productName || "").trim();
    if (!name) return null;
    const list = Array.isArray(furnitureCustomTemplates) ? furnitureCustomTemplates : [];
    const row = list.find((t) => String(t?.product_name || t?.productName || "").trim() === name) || null;
    const details = row?.details;
    if (!Array.isArray(details) || details.length === 0) return null;
    return details
      .map((d) => {
        const detailName = String(d?.detailName || d?.detail_name || "").trim();
        const perUnit = parseNumInput(d?.perUnit ?? d?.per_unit ?? 0);
        if (!detailName || !(perUnit > 0)) return null;
        return makeDetailRow(detailName, String(Math.round(perUnit * 1000) / 1000));
      })
      .filter(Boolean);
  }

  useEffect(() => {
    if (!createOpen) return;
    // Initialize composition editor from either selected custom template (edit) or current calculated details.
    if (editingExisting) {
      const fromCustom = buildPerUnitDetailsFromCustomTemplate(createName);
      setCreateDetails(fromCustom || buildPerUnitDetailsFromCurrentCalculation());
    } else {
      setCreateDetails(buildPerUnitDetailsFromCurrentCalculation());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen, createDetailsNonce, editingExisting]);

  useEffect(() => {
    if (!createOpen) return;
    if (!editingExisting) return;
    if (typeof callBackend !== "function") return;
    const itemName = String(createName || "").trim();
    if (!itemName) return;
    let cancelled = false;
    (async () => {
      try {
        const all = await callBackend("webGetManualItemArticleVariants", { p_item_name: itemName });
        const rows = Array.isArray(all) ? all : [];
        const matched = rows
          .map((r) => ({
            sectionName: String(r.section_name || r.sectionName || "").trim(),
            article: String(r.article || "").trim(),
            color: String(r.material || r.table_color || r.tableColor || "").trim(),
          }))
          .filter((x) => x.article && x.color);
        if (cancelled) return;
        const inferredSection = matched[0]?.sectionName || "";
        if (inferredSection) setCreateSection(inferredSection);
        setCreateVariants(matched.length ? matched.map((v) => makeVariantRow(v.article, v.color)) : [makeVariantRow("", "")]);

        const list = Array.isArray(furnitureCustomTemplates) ? furnitureCustomTemplates : [];
        const tpl = list.find((t) => String(t?.product_name || t?.productName || "").trim() === itemName) || null;
        const kits = Number(tpl?.kits_per_sheet ?? tpl?.kitsPerSheet ?? 0) || 0;
        setCreateKitsPerSheet(kits > 0 ? String(kits) : "");
      } catch (_) {
        if (cancelled) return;
        setCreateVariants([makeVariantRow("", "")]);
        setCreateKitsPerSheet("");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen, editingExisting]);

  const isSelectedCustom = useMemo(() => {
    const name = String(furnitureSelectedTemplate?.productName || furnitureSelectedProduct || "").trim();
    if (!name) return false;
    const list = Array.isArray(furnitureCustomTemplates) ? furnitureCustomTemplates : [];
    return list.some((t) => String(t?.product_name || t?.productName || "").trim() === name);
  }, [furnitureCustomTemplates, furnitureSelectedProduct, furnitureSelectedTemplate]);

  const articleMatches = useMemo(() => {
    const q = String(articleQuery || "").trim().toLowerCase();
    if (!q) return [];
    const rows = Array.isArray(furnitureArticleSearchRows) ? furnitureArticleSearchRows : [];
    const filtered = rows.filter((r) => String(r.article || "").toLowerCase().includes(q));
    const map = new Map();
    filtered.forEach((r) => {
      const key = String(r.productName || "").trim();
      if (!key) return;
      if (!map.has(key)) map.set(key, new Set());
      const s = map.get(key);
      if (r.detailPattern) s.add(String(r.detailPattern));
    });
    return [...map.entries()]
      .map(([productName, patterns]) => ({
        productName,
        patterns: [...patterns].sort((a, b) => a.localeCompare(b, "ru")),
      }))
      .sort((a, b) => a.productName.localeCompare(b.productName, "ru"))
      .slice(0, 30);
  }, [articleQuery, furnitureArticleSearchRows]);

  async function createMainFurnitureOrder() {
    if (!canOperateProduction || typeof createFurniturePlanOrder !== "function") return;
    if (!furnitureSelectedTemplate || !(furnitureQtyNumber > 0)) return;
    const week = String(planWeek || "").trim();
    if (!week) return;
    setPlanSaving(true);
    try {
      await createFurniturePlanOrder({
        item: furnitureProductLabel(furnitureSelectedTemplate.productName || ""),
        article: "",
        material: String(furnitureSelectedTemplate.productColor || "").trim() || "Не указан",
        week,
        qty: furnitureQtyNumber,
        qrQty: furnitureQtyNumber,
      });
      setPlanWeek("");
    } finally {
      setPlanSaving(false);
    }
  }

  async function saveNewFurnitureToCatalog() {
    if (!canOperateProduction || typeof callBackend !== "function") return;
    const section = String(createSection || "").trim() || "Прочее";
    const name = String(createName || "").trim();
    const variants = (Array.isArray(createVariants) ? createVariants : [])
      .map((v) => ({
        article: String(v?.article || "").trim(),
        color: String(v?.color || "").trim(),
      }))
      .filter((v) => v.article && v.color);

    if (!name) {
      setCreateError("Укажите название.");
      return;
    }
    if (!variants.length) {
      setCreateError("Добавьте варианты: артикул + цвет/материал (1 артикул = 1 цвет).");
      return;
    }
    const kitsPerSheet = parseNumInput(createKitsPerSheet);
    const detailsRows = Array.isArray(createDetails) ? createDetails : [];
    const normalizedDetails = detailsRows
      .map((r) => {
        const detailName = String(r?.detailName || "").trim();
        const perUnit = parseNumInput(r?.perUnit);
        if (!detailName || !(perUnit > 0)) return null;
        return { detailName, perUnit: Math.round(perUnit * 1000) / 1000 };
      })
      .filter(Boolean);

    if (!normalizedDetails.length) {
      setCreateError("Добавьте детали в состав (кол-во на 1 изделие).");
      return;
    }
    setCreateSaving(true);
    setCreateError("");
    setCreateOk("");
    try {
      // 1) Add to plan catalog (so it appears in 'Добавить новый план')
      await callBackend("webUpsertItemArticleMapVariants", {
        p_section_name: section,
        p_item_name: name,
        p_variants: variants,
        p_sort_order: 999,
      });

      // 2) Save composition as a custom template (so it can be used inside furniture constructor / previews)
      await callBackend("webUpsertFurnitureCustomTemplate", {
        p_product_name: name,
        p_details: normalizedDetails,
        p_kits_per_sheet: kitsPerSheet,
      });

      setCreateOk("Готово: изделие сохранено и появится в 'Добавить новый план'.");
      setCreateOpen(false);
      setCreateName("");
      setCreateVariants([]);
      setCreateKitsPerSheet("");
      setCreateDetails([]);
      if (typeof load === "function") {
        try { await load(); } catch (_) {}
      }
      if (typeof refreshPlanCatalogs === "function") {
        try { await refreshPlanCatalogs(); } catch (_) {}
      }
    } catch (e) {
      setCreateError(String(e?.message || e || "Ошибка сохранения"));
    } finally {
      setCreateSaving(false);
    }
  }

  return (
    <>
      {furnitureLoading && <div className="empty">Загружаю таблицу Мебель.xlsx...</div>}
      {!furnitureLoading && furnitureError && <div className="error">{furnitureError}</div>}
      {!furnitureLoading && !furnitureError && furnitureSheetData.headers.length === 0 && (
        <div className="empty">В файле нет данных для отображения.</div>
      )}
      {!furnitureLoading && !furnitureError && furnitureSheetData.headers.length > 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          <div className="tabs tabs--overview-sub">
            <button
              type="button"
              className={furnitureSubTab === "main" ? "tab active" : "tab"}
              onClick={() => setFurnitureSubTab("main")}
            >
              Основная мебель
            </button>
            <button
              type="button"
              className={furnitureSubTab === "storage" ? "tab active" : "tab"}
              onClick={() => setFurnitureSubTab("storage")}
            >
              Система хранения
            </button>
          </div>
          {furnitureSubTab === "main" && (
            <div
              className="sheet-table-wrap"
              style={{
                maxWidth: 1060,
                margin: "0 auto",
                padding: 14,
                boxSizing: "border-box",
                minHeight: 640,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: "linear-gradient(135deg, #1565c0, #0d3b8e)",
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 700,
                    fontSize: 16,
                  }}
                >
                  М
                </div>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>Состав изделия GX</div>
                  <div style={{ fontSize: 14, color: "#64748b", marginTop: 2 }}>
                    Выберите изделие и количество — получите список деталей с артикулами
                  </div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateError("");
                      setCreateOk("");
                      setCreateSection("Прочее");
                      setCreateName(furnitureProductLabel(furnitureSelectedTemplate?.productName || ""));
                      setCreateVariants([makeVariantRow("", "")]);
                      setCreateKitsPerSheet("");
                      setCreateDetails([]);
                      setCreateDetailsNonce((x) => x + 1);
                      setEditingExisting(false);
                      setCreateOpen(true);
                    }}
                    style={{
                      minHeight: 36,
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                      background: "#fff",
                      color: "#0f172a",
                      padding: "6px 12px",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    + Новое изделие в план
                  </button>
                  {isSelectedCustom && (
                    <button
                      type="button"
                      onClick={() => {
                        const selectedName = String(
                          furnitureSelectedTemplate?.productName || furnitureSelectedProduct || "",
                        ).trim();
                        setCreateError("");
                        setCreateOk("");
                        setCreateSection("Прочее");
                        setCreateName(selectedName);
                        setCreateVariants([]);
                        setCreateKitsPerSheet("");
                        setCreateDetails([]);
                        setCreateDetailsNonce((x) => x + 1);
                        setEditingExisting(true);
                        setCreateOpen(true);
                      }}
                      style={{
                        minHeight: 36,
                        borderRadius: 10,
                        border: "1px solid #93c5fd",
                        background: "#eff6ff",
                        padding: "6px 12px",
                        fontWeight: 900,
                        cursor: "pointer",
                        color: "#1e40af",
                      }}
                    >
                      Редактировать
                    </button>
                  )}
                </div>
              </div>

              <div style={{ height: 1, background: "#e2e8f0", marginBottom: 16 }} />

              {createOpen && (
                <div
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 14,
                    padding: 12,
                    background: "#fff",
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>
                    {editingExisting ? "Редактирование изделия" : "Новое изделие для плана"}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
                        Название (как в плане)
                      </div>
                      <input
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        placeholder="Например: Donini 806 белый"
                        style={{
                          width: "100%",
                          minHeight: 38,
                          border: "1.5px solid #cbd5e1",
                          borderRadius: 10,
                          padding: "7px 10px",
                          fontSize: 15,
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
                        Секция
                      </div>
                      <input
                        value={createSection}
                        onChange={(e) => setCreateSection(e.target.value)}
                        placeholder="Прочее"
                        style={{
                          width: "100%",
                          minHeight: 38,
                          border: "1.5px solid #cbd5e1",
                          borderRadius: 10,
                          padding: "7px 10px",
                          fontSize: 15,
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 12, marginTop: 12 }}>
                    <div />
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#64748b",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          marginBottom: 5,
                        }}
                      >
                        Комплектов на лист
                      </div>
                      <input
                        inputMode="decimal"
                        value={createKitsPerSheet}
                        onChange={(e) => setCreateKitsPerSheet(e.target.value.replace(/[^0-9.,]/g, ""))}
                        placeholder="Например: 6"
                        style={{
                          width: "100%",
                          minHeight: 38,
                          border: "1.5px solid #cbd5e1",
                          borderRadius: 10,
                          padding: "7px 10px",
                          fontSize: 16,
                          fontWeight: 800,
                          textAlign: "center",
                          boxSizing: "border-box",
                        }}
                      />
                      <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                        Сколько комплектов помещается на 1 лист (для будущего списания листов).
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
                        Варианты (артикул → цвет/материал)
                      </div>
                      <div
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 12,
                          overflow: "hidden",
                          background: "#fff",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "220px 1fr 36px",
                            gap: 8,
                            padding: "8px 10px",
                            background: "#f8fafc",
                            borderBottom: "1px solid #e2e8f0",
                            fontSize: 12,
                            color: "#475569",
                            fontWeight: 800,
                          }}
                        >
                          <div>Артикул</div>
                          <div>Цвет/материал</div>
                          <div />
                        </div>
                        {(createVariants || []).map((v, idx) => (
                          <div
                            key={v.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "220px 1fr 36px",
                              gap: 8,
                              padding: "8px 10px",
                              borderTop: idx === 0 ? "none" : "1px solid #eef2f7",
                              background: idx % 2 === 0 ? "#fff" : "#fbfdff",
                              alignItems: "center",
                            }}
                          >
                            <input
                              value={String(v.article || "")}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCreateVariants((prev) =>
                                  (prev || []).map((x) => (x.id === v.id ? { ...x, article: val } : x)),
                                );
                              }}
                              placeholder="GX..."
                              style={{
                                width: "100%",
                                minHeight: 34,
                                border: "1px solid #cbd5e1",
                                borderRadius: 10,
                                padding: "6px 10px",
                                fontSize: 14,
                                boxSizing: "border-box",
                                fontFamily: "monospace",
                              }}
                            />
                            <input
                              value={String(v.color || "")}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCreateVariants((prev) =>
                                  (prev || []).map((x) => (x.id === v.id ? { ...x, color: val } : x)),
                                );
                              }}
                              placeholder="Например: Дуб вотан"
                              style={{
                                width: "100%",
                                minHeight: 34,
                                border: "1px solid #cbd5e1",
                                borderRadius: 10,
                                padding: "6px 10px",
                                fontSize: 14,
                                boxSizing: "border-box",
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setCreateVariants((prev) => (prev || []).filter((x) => x.id !== v.id))}
                              title="Удалить"
                              style={{
                                width: 36,
                                height: 34,
                                borderRadius: 10,
                                border: "1px solid #e2e8f0",
                                background: "#fff",
                                cursor: "pointer",
                                fontWeight: 900,
                                color: "#ef4444",
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <div style={{ padding: 10, borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
                          <button
                            type="button"
                            onClick={() => setCreateVariants((prev) => [...(prev || []), makeVariantRow("", "")])}
                            style={{
                              minHeight: 34,
                              borderRadius: 10,
                              border: "1px solid #cbd5e1",
                              background: "#fff",
                              color: "#0f172a",
                              padding: "0 12px",
                              fontWeight: 900,
                              cursor: "pointer",
                            }}
                          >
                            + Вариант
                          </button>
                          <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                            1 артикул = 1 цвет/материал. Если цветов несколько — делайте несколько артикулов.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: 6,
                      }}
                    >
                      Состав (на 1 изделие)
                    </div>

                    <div
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        overflow: "hidden",
                        background: "#fff",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 140px 36px",
                          gap: 8,
                          padding: "8px 10px",
                          background: "#f8fafc",
                          borderBottom: "1px solid #e2e8f0",
                          fontSize: 12,
                          color: "#475569",
                          fontWeight: 800,
                        }}
                      >
                        <div>Деталь</div>
                        <div style={{ textAlign: "center" }}>Кол-во</div>
                        <div />
                      </div>

                      {(createDetails || []).map((r, idx) => (
                        <div
                          key={r.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 140px 36px",
                            gap: 8,
                            padding: "8px 10px",
                            borderTop: idx === 0 ? "none" : "1px solid #eef2f7",
                            background: idx % 2 === 0 ? "#fff" : "#fbfdff",
                            alignItems: "center",
                          }}
                        >
                          <input
                            value={String(r.detailName || "")}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCreateDetails((prev) =>
                                (prev || []).map((x) => (x.id === r.id ? { ...x, detailName: v } : x)),
                              );
                            }}
                            placeholder="Например: Столешка (500_900)"
                            style={{
                              width: "100%",
                              minHeight: 34,
                              border: "1px solid #cbd5e1",
                              borderRadius: 10,
                              padding: "6px 10px",
                              fontSize: 14,
                              boxSizing: "border-box",
                            }}
                          />
                          <input
                            inputMode="decimal"
                            value={String(r.perUnit || "")}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^0-9.,]/g, "");
                              setCreateDetails((prev) =>
                                (prev || []).map((x) => (x.id === r.id ? { ...x, perUnit: v } : x)),
                              );
                            }}
                            placeholder="1"
                            style={{
                              width: "100%",
                              minHeight: 34,
                              border: "1px solid #cbd5e1",
                              borderRadius: 10,
                              padding: "6px 10px",
                              fontSize: 16,
                              fontWeight: 800,
                              textAlign: "center",
                              boxSizing: "border-box",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setCreateDetails((prev) => (prev || []).filter((x) => x.id !== r.id))}
                            title="Удалить"
                            style={{
                              width: 36,
                              height: 34,
                              borderRadius: 10,
                              border: "1px solid #e2e8f0",
                              background: "#fff",
                              cursor: "pointer",
                              fontWeight: 900,
                              color: "#ef4444",
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      <div style={{ padding: "10px", borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => setCreateDetails((prev) => [...(prev || []), makeDetailRow("", "")])}
                            style={{
                              minHeight: 34,
                              borderRadius: 10,
                              border: "1px solid #cbd5e1",
                              background: "#fff",
                              color: "#0f172a",
                              padding: "0 12px",
                              fontWeight: 900,
                              cursor: "pointer",
                            }}
                          >
                            + Деталь
                          </button>
                          <button
                            type="button"
                            onClick={() => setCreateDetails(buildPerUnitDetailsFromCurrentCalculation())}
                            style={{
                              minHeight: 34,
                              borderRadius: 10,
                              border: "1px solid #cbd5e1",
                              background: "#fff",
                              color: "#0f172a",
                              padding: "0 12px",
                              fontWeight: 900,
                              cursor: "pointer",
                            }}
                          >
                            Подставить из текущего расчёта
                          </button>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                          Кол-во — это на 1 изделие (не на выбранное количество).
                        </div>
                      </div>
                    </div>
                  </div>

                  {createError && <div className="error" style={{ marginTop: 10 }}>{createError}</div>}
                  {createOk && <div className="empty" style={{ marginTop: 10 }}>{createOk}</div>}

                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={saveNewFurnitureToCatalog}
                      disabled={createSaving}
                      style={{
                        minHeight: 38,
                        borderRadius: 10,
                        border: "1.5px solid #1976d2",
                        background: "#1976d2",
                        color: "#fff",
                        fontWeight: 900,
                        padding: "0 14px",
                        cursor: "pointer",
                      }}
                    >
                      {createSaving ? "Сохраняю..." : "Сохранить"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateOpen(false)}
                      disabled={createSaving}
                      style={{
                        minHeight: 38,
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                        background: "#fff",
                        color: "#0f172a",
                        fontWeight: 800,
                        padding: "0 14px",
                        cursor: "pointer",
                      }}
                    >
                      Отмена
                    </button>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
                    Секция/артикул/цвета попадут в каталог плана, а состав сохранится как шаблон изделия.
                  </div>
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) 140px",
                  gap: 12,
                  marginBottom: 16,
                  alignItems: "end",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 5,
                    }}
                  >
                    Изделие
                  </div>
                  <select
                    value={furnitureSelectedProduct}
                    onChange={(e) => setFurnitureSelectedProduct(e.target.value)}
                    style={{
                      width: "100%",
                      minHeight: 38,
                      border: "1.5px solid #cbd5e1",
                      borderRadius: 10,
                      padding: "7px 10px",
                      fontSize: 15,
                      boxSizing: "border-box",
                    }}
                  >
                    {furnitureTemplates.map((t) => (
                      <option key={t.productName} value={t.productName}>
                        {furnitureProductLabel(t.productName)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 5,
                    }}
                  >
                    Кол-во
                  </div>
                  <input
                    inputMode="decimal"
                    value={furnitureSelectedQty}
                    onChange={(e) => setFurnitureSelectedQty(e.target.value.replace(/[^0-9.,]/g, ""))}
                    placeholder="1"
                    style={{
                      width: "100%",
                      minHeight: 38,
                      border: "1.5px solid #cbd5e1",
                      borderRadius: 10,
                      padding: "7px 10px",
                      fontSize: 22,
                      fontWeight: 700,
                      textAlign: "center",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 140px",
                  gap: 12,
                  marginBottom: 16,
                  alignItems: "end",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 5,
                    }}
                  >
                    План (неделя)
                  </div>
                  <input
                    value={planWeek}
                    onChange={(e) => setPlanWeek(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="72"
                    style={{
                      width: "100%",
                      minHeight: 38,
                      border: "1.5px solid #cbd5e1",
                      borderRadius: 10,
                      padding: "7px 10px",
                      fontSize: 16,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={createMainFurnitureOrder}
                  disabled={
                    !canOperateProduction ||
                    planSaving ||
                    !String(planWeek || "").trim() ||
                    !furnitureSelectedTemplate ||
                    !(furnitureQtyNumber > 0)
                  }
                  style={{
                    minHeight: 38,
                    borderRadius: 10,
                    border: "1.5px solid #1976d2",
                    background: canOperateProduction ? "#1976d2" : "#cbd5e1",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: canOperateProduction ? "pointer" : "not-allowed",
                  }}
                >
                  {planSaving ? "Создаю..." : "Создать заказ в производство"}
                </button>
              </div>

              <div style={{ height: 1, background: "#e2e8f0", marginBottom: 16 }} />

              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 5,
                  }}
                >
                  Поиск: артикул → изделия
                </div>
                <input
                  value={articleQuery}
                  onChange={(e) => setArticleQuery(e.target.value)}
                  placeholder="Введите артикул (например GXkT...)"
                  style={{
                    width: "100%",
                    minHeight: 38,
                    border: "1.5px solid #cbd5e1",
                    borderRadius: 10,
                    padding: "7px 10px",
                    fontSize: 15,
                    boxSizing: "border-box",
                    fontFamily: "monospace",
                  }}
                />
                {String(articleQuery || "").trim() && (
                  <div style={{ marginTop: 8 }}>
                    {articleMatches.length === 0 ? (
                      <div className="empty">Ничего не найдено.</div>
                    ) : (
                      <div
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 12,
                          overflow: "hidden",
                          background: "#fff",
                        }}
                      >
                        <div
                          style={{
                            padding: "10px 12px",
                            background: "#f1f5f9",
                            fontSize: 13,
                            color: "#334155",
                            fontWeight: 700,
                          }}
                        >
                          Найдено изделий: {articleMatches.length}
                        </div>
                        {articleMatches.map((m, idx) => (
                          <div
                            key={`${m.productName}-${idx}`}
                            style={{
                              padding: "10px 12px",
                              borderTop: idx === 0 ? "none" : "1px solid #e2e8f0",
                            }}
                          >
                            <div style={{ fontWeight: 800, color: "#0f172a" }}>
                              {furnitureProductLabel(m.productName)}
                            </div>
                            {m.patterns.length > 0 && (
                              <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {m.patterns.slice(0, 12).map((p) => (
                                  <span
                                    key={p}
                                    style={{
                                      fontSize: 12,
                                      color: "#1e293b",
                                      background: "#f8fafc",
                                      border: "1px solid #e2e8f0",
                                      borderRadius: 999,
                                      padding: "2px 8px",
                                    }}
                                  >
                                    {p}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {furnitureGeneratedDetails.length === 0 ? (
                <div className="empty">Выберите изделие и укажите количество.</div>
              ) : (
                <div
                  style={{
                    border: "2px solid #1976d2",
                    borderRadius: 14,
                    background: "#f5f9ff",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 16px",
                      background: "#1976d2",
                      color: "#fff",
                    }}
                  >
                    <span style={{ fontSize: 20 }}>📋</span>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>
                      {furnitureProductLabel(furnitureSelectedTemplate?.productName || "—")}
                    </span>
                    <span
                      style={{
                        marginLeft: "auto",
                        background: "rgba(255,255,255,0.2)",
                        borderRadius: 20,
                        padding: "2px 12px",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      × {furnitureQtyNumber}
                    </span>
                  </div>

                  <div style={{ padding: "8px 0" }}>
                    {furnitureGeneratedDetails.map((d, idx) => {
                      const articles = d.linkedArticles || [];
                      const hasArticles = articles.length > 0;
                      return (
                        <div
                          key={`fg-${idx}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 52px",
                            gap: 0,
                            padding: "9px 16px",
                            borderBottom:
                              idx < furnitureGeneratedDetails.length - 1 ? "1px solid #dbeafe" : "none",
                            background: idx % 2 === 0 ? "#fff" : "#f5f9ff",
                            alignItems: "start",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "baseline",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{ fontSize: 15, color: "#0f172a", fontWeight: 500 }}>
                                {d.detailName}
                              </span>
                              {hasArticles && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "#1565c0",
                                    background: "#dbeafe",
                                    border: "1px solid #93c5fd",
                                    borderRadius: 6,
                                    padding: "1px 7px",
                                    fontFamily: "monospace",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {articles.length === 1 ? articles[0] : `${articles.length} артикула`}
                                </span>
                              )}
                              {!hasArticles && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "#94a3b8",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: 6,
                                    padding: "1px 7px",
                                  }}
                                >
                                  нет артикула
                                </span>
                              )}
                            </div>
                            {articles.length > 1 && (
                              <div
                                style={{
                                  marginTop: 4,
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 4,
                                }}
                              >
                                {articles.map((a) => (
                                  <span
                                    key={a}
                                    style={{
                                      fontSize: 11,
                                      fontFamily: "monospace",
                                      color: "#1e40af",
                                      background: "#eff6ff",
                                      border: "1px solid #bfdbfe",
                                      borderRadius: 5,
                                      padding: "1px 6px",
                                    }}
                                  >
                                    {a}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div
                            style={{
                              textAlign: "center",
                              fontSize: 22,
                              fontWeight: 800,
                              color: "#1565c0",
                              lineHeight: 1.1,
                              paddingTop: 2,
                            }}
                          >
                            {Number.isInteger(d.qty) ? d.qty : d.qty.toFixed(3)}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 16px",
                      background: "#dbeafe",
                      borderTop: "1px solid #93c5fd",
                      fontSize: 13,
                      color: "#1e40af",
                      fontWeight: 600,
                    }}
                  >
                    <span>Итого позиций: {furnitureGeneratedDetails.length}</span>
                    <span style={{ marginLeft: 12 }}>
                      С артикулами:{" "}
                      {furnitureGeneratedDetails.filter((x) => (x.linkedArticles || []).length > 0).length}
                    </span>
                    <span>
                      / Без артикулов:{" "}
                      {furnitureGeneratedDetails.filter((x) => (x.linkedArticles || []).length === 0).length}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
          {furnitureSubTab === "storage" && (
            <ShelfCalculator
              canOperateProduction={canOperateProduction}
              onCreatePlanOrder={createShelfPlanOrder}
            />
          )}
        </div>
      )}
    </>
  );
}
