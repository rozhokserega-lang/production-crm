import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { OrderService } from "../services/orderService";
import { resolveFurnitureTemplateForPreview } from "../utils/furnitureUtils";

const norm = (s) => String(s ?? "").trim().toLowerCase();

function fmtQty(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 1000) / 1000);
}

// ---------------------------------------------------------------------------
// Custom nodes (blueprint style)
// ---------------------------------------------------------------------------
function SectionNode({ data }) {
  return (
    <div className="fbp-node fbp-node--sec">
      <Handle type="source" position={Position.Right} id="out" />
      <div className="fbp-node__title">Секция плана</div>
      <div className="fbp-node__name">{data.label}</div>
    </div>
  );
}

function ProductNode({ data }) {
  return (
    <div
      className="fbp-node fbp-node--product fbp-node--clickable"
      onClick={() => data.onInfo?.()}
      title="Показать информацию об изделии"
    >
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="out" />
      <div className="fbp-node__title">Изделие</div>
      <div className="fbp-node__name">{data.label || "—"}</div>
      <div className="fbp-node__meta">
        деталей: {data.detailCount} · секция: {data.sectionLabel || "—"}
        {data.templateName ? ` · шаблон «${data.templateName}»` : ""} · нажми — инфо
      </div>
    </div>
  );
}

function DetailNode({ data }) {
  const [draft, setDraft] = useState(fmtQty(data.qty));
  useEffect(() => setDraft(fmtQty(data.qty)), [data.qty]);

  const commit = () => {
    const q = Number(String(draft).replace(",", "."));
    if (!Number.isFinite(q) || q <= 0) {
      setDraft(fmtQty(data.qty));
      return;
    }
    if (q !== Number(data.qty)) data.onSaveQty?.(q);
  };

  return (
    <div className="fbp-node fbp-node--detail">
      <Handle type="target" position={Position.Left} id="in" />
      <div className="fbp-node__name">{data.name}</div>
      {Array.isArray(data.articles) && data.articles.length > 0 ? (
        <div className="fbp-arts">
          {data.articles.slice(0, 4).map((a) => (
            <span key={a} className="fbp-art">{a}</span>
          ))}
          {data.articles.length > 4 ? (
            <span className="fbp-art fbp-art--more">+{data.articles.length - 4}</span>
          ) : null}
        </div>
      ) : (
        <div className="fbp-node__sub">нет артикула</div>
      )}
      <div className="fbp-node__row">
        <span className="fbp-node__qtyLabel">на 1 шт</span>
        {data.canEdit ? (
          <input
            className="fbp-node__qty"
            value={draft}
            inputMode="decimal"
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9.,]/g, ""))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        ) : (
          <b className="fbp-node__qty fbp-node__qty--ro">{fmtQty(data.qty)}</b>
        )}
      </div>
      {data.canEdit && (
        <button className="fbp-node__del" title="Убрать деталь" onClick={() => data.onDelete?.()}>
          ×
        </button>
      )}
    </div>
  );
}

function SectionItemNode({ data }) {
  return (
    <div
      className="fbp-node fbp-node--product fbp-node--clickable"
      onClick={() => data.onOpen?.()}
      title="Открыть состав изделия"
    >
      <Handle type="target" position={Position.Left} id="in" />
      <div className="fbp-node__title">Изделие</div>
      <div className="fbp-node__name">{data.label}</div>
      <div className="fbp-node__meta">
        {data.detailCount != null ? `деталей: ${data.detailCount} · ` : ""}нажми — информация
      </div>
    </div>
  );
}

const NODE_TYPES = {
  section: SectionNode,
  product: ProductNode,
  detail: DetailNode,
  secitem: SectionItemNode,
};

const STYLE = `
.fbp-wrap { position: relative; height: 72vh; min-height: 460px; border: 1px solid #1f2937; border-radius: 10px; overflow: hidden; background: #0b1220; }
.fbp-wrap .react-flow__attribution { display: none; }
.fbp-node { position: relative; min-width: 150px; max-width: 240px; padding: 8px 10px; border-radius: 8px; border: 1px solid #2b3a55; background: #111a2e; color: #e5edff; box-shadow: 0 2px 10px rgba(0,0,0,.35); font-size: 12px; }
.fbp-node--product { border-color: #3b82f6; background: #13203b; min-width: 180px; }
.fbp-node--detail { border-color: #6b7280; }
.fbp-node--sec { border-color: #b45309; background: #1c1606; }
.fbp-node--clickable { cursor: pointer; }
.fbp-node--clickable:hover { border-color: #60a5fa; box-shadow: 0 0 0 2px rgba(96,165,250,.35); }
.fbp-modes { display: inline-flex; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
.fbp-modes button { border: none; background: #fff; color: #0f172a; padding: 7px 12px; cursor: pointer; font-weight: 700; font-size: 13px; }
.fbp-modes button.active { background: #1976d2; color: #fff; }
.fbp-node__title { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #93a4c8; margin-bottom: 2px; }
.fbp-node__name { font-weight: 600; line-height: 1.2; word-break: break-word; }
.fbp-node__sub { color: #9fb0d0; font-size: 11px; margin-top: 2px; }
.fbp-node__meta { margin-top: 4px; color: #7e8fb0; font-size: 10px; }
.fbp-node__row { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.fbp-node__qtyLabel { color: #9fb0d0; font-size: 10px; }
.fbp-node__qty { width: 64px; padding: 2px 4px; border-radius: 5px; border: 1px solid #3b4a66; background: #0b1426; color: #e5edff; text-align: center; }
.fbp-node__qty--ro { width: auto; border: none; background: transparent; }
.fbp-node__del { position: absolute; top: -8px; right: -8px; width: 18px; height: 18px; line-height: 16px; text-align: center; border-radius: 50%; border: 1px solid #7f1d1d; background: #b91c1c; color: #fff; cursor: pointer; padding: 0; font-size: 13px; }
.fbp-arts { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 3px; }
.fbp-art { font-family: monospace; font-size: 10px; color: #bfdbfe; background: #0b2547; border: 1px solid #1d4ed8; border-radius: 4px; padding: 0 5px; }
.fbp-art--more { color: #93a4c8; background: transparent; border-color: #334155; }
.fbp-toolbar { display: flex; gap: 8px; align-items: end; flex-wrap: wrap; }
.fbp-field { display: flex; flex-direction: column; gap: 4px; }
.fbp-field > span { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
.fbp-input, .fbp-select { min-height: 34px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 5px 8px; font-size: 14px; background: #fff; color: #0f172a; }
.fbp-btn { min-height: 34px; border-radius: 8px; border: 1px solid #1976d2; background: #1976d2; color: #fff; font-weight: 800; padding: 0 12px; cursor: pointer; }
.fbp-btn--ghost { border-color: #cbd5e1; background: #fff; color: #0f172a; }
.fbp-btn:disabled { opacity: .5; cursor: default; }
.fbp-info { position: absolute; top: 12px; right: 12px; width: 320px; max-height: calc(100% - 24px); overflow: auto; z-index: 20; background: #0f1b34; border: 1px solid #2b3a55; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.45); color: #e5edff; padding: 14px; font-size: 13px; }
.fbp-info__close { position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; border-radius: 6px; border: 1px solid #334155; background: #1e293b; color: #cbd5e1; cursor: pointer; font-size: 15px; line-height: 1; }
.fbp-info__title { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #93a4c8; }
.fbp-info__name { font-size: 15px; font-weight: 800; line-height: 1.25; margin: 2px 0 10px; padding-right: 22px; word-break: break-word; }
.fbp-info__sect { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin: 12px 0 6px; }
.fbp-info__chips { display: flex; flex-wrap: wrap; gap: 5px; }
.fbp-info__chip { font-size: 12px; background: #14233f; border: 1px solid #2b3a55; border-radius: 6px; padding: 2px 8px; }
.fbp-info__art { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 0; border-bottom: 1px solid #1c2942; }
.fbp-info__art:last-child { border-bottom: none; }
.fbp-info__artcode { font-family: monospace; font-size: 12px; color: #bfdbfe; }
.fbp-info__artcolor { font-size: 11px; color: #9fb0d0; text-align: right; }
.fbp-info__det { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 3px 0; }
.fbp-info__detqty { font-weight: 800; color: #93c5fd; }
.fbp-info__btn { margin-top: 12px; width: 100%; min-height: 34px; border-radius: 8px; border: 1px solid #2563eb; background: #1d4ed8; color: #fff; font-weight: 800; cursor: pointer; }
.fbp-info__btn--danger { margin-top: 8px; border-color: #b91c1c; background: #7f1d1d; }
.fbp-info__btn:disabled { opacity: .5; cursor: default; }
.fbp-info__muted { color: #7e8fb0; }
`;

function detailArticles(rows, productName, detailName) {
  const pk = norm(productName);
  const dn = norm(detailName);
  if (!pk || !dn) return [];
  const set = new Set();
  for (const r of rows) {
    if (norm(r.productName) !== pk) continue;
    const dp = norm(r.detailPattern || "");
    if (!dp || dn.includes(dp) || dp.includes(dn)) {
      const a = String(r.article || "").trim();
      if (a) set.add(a);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ru"));
}

export function FurnitureBomGraph({
  canOperate = false,
  furnitureTemplates = [],
  furnitureCustomTemplates = [],
  furnitureArticleSearchRows = [],
  furnitureProductLabel = (s) => s,
  reload,
}) {
  const [sectionArticles, setSectionArticles] = useState([]);
  const [adminRows, setAdminRows] = useState([]);
  const [adminEditable, setAdminEditable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [focusMode, setFocusMode] = useState("section");
  const [selectedSection, setSelectedSection] = useState("");
  const [infoItem, setInfoItem] = useState("");
  const [selected, setSelected] = useState("");
  const [targetSection, setTargetSection] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [newQty, setNewQty] = useState("1");

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const loadCatalog = useCallback(async () => {
    const [secItems, admin] = await Promise.all([
      OrderService.getSectionArticles().catch(() => []),
      OrderService.getItemArticleMapAdmin().catch(() => null),
    ]);
    setSectionArticles(Array.isArray(secItems) ? secItems : []);
    if (Array.isArray(admin)) {
      setAdminRows(admin);
      setAdminEditable(true);
    } else {
      setAdminRows([]);
      setAdminEditable(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadCatalog()
      .catch((e) => setError(String(e?.message || e || "Ошибка загрузки")))
      .finally(() => setLoading(false));
  }, [loadCatalog]);

  const products = useMemo(() => {
    const set = new Map();
    for (const t of furnitureTemplates) {
      const p = String(t?.productName || "").trim();
      if (p) set.set(norm(p), p);
    }
    for (const r of sectionArticles) {
      const p = String(r.item_name ?? r.itemName ?? "").trim();
      if (p) set.set(norm(p), p);
    }
    for (const r of adminRows) {
      const p = String(r.item_name ?? r.itemName ?? "").trim();
      if (p) set.set(norm(p), p);
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b, "ru"));
  }, [furnitureTemplates, sectionArticles, adminRows]);

  // section (norm) -> { name, items: [itemName, ...] }
  const itemsBySection = useMemo(() => {
    const map = new Map();
    const add = (sectionRaw, itemRaw) => {
      const section = String(sectionRaw ?? "").trim();
      const itemName = String(itemRaw ?? "").trim();
      if (!section || !itemName) return;
      const key = norm(section);
      if (!map.has(key)) map.set(key, { name: section, items: new Map() });
      map.get(key).items.set(norm(itemName), itemName);
    };
    for (const r of sectionArticles) add(r.section_name ?? r.sectionName, r.item_name ?? r.itemName);
    for (const r of adminRows) add(r.section_name ?? r.sectionName, r.item_name ?? r.itemName);
    return map;
  }, [sectionArticles, adminRows]);

  const sectionItemList = useMemo(() => {
    const entry = itemsBySection.get(norm(selectedSection));
    if (!entry) return [];
    return [...entry.items.values()].sort((a, b) => a.localeCompare(b, "ru"));
  }, [itemsBySection, selectedSection]);

  useEffect(() => {
    if (!selected && products.length) setSelected(products[0]);
  }, [products, selected]);

  // Resolve composition by the same alias logic the app uses (Cremona ↔ Кремона, etc.),
  // not by exact name — иначе у каталожных изделий состав не находится.
  const resolveTpl = useCallback(
    (name) => {
      const raw = String(name || "").trim();
      if (!raw) return null;
      const exact = furnitureTemplates.find((t) => norm(t?.productName) === norm(raw));
      if (exact) return exact;
      return resolveFurnitureTemplateForPreview(
        { firstName: raw, detailedName: raw },
        furnitureTemplates,
      );
    },
    [furnitureTemplates],
  );

  const selectedTemplate = useMemo(() => resolveTpl(selected), [resolveTpl, selected]);

  // Канонічное имя шаблона состава (под ним и сохраняем правки), напр. «Кремона».
  const templateName = useMemo(
    () => String(selectedTemplate?.productName || selected || "").trim(),
    [selectedTemplate, selected],
  );
  const templateNameRef = useRef(templateName);
  templateNameRef.current = templateName;

  const selectedDetails = useMemo(() => {
    const list = Array.isArray(selectedTemplate?.details) ? selectedTemplate.details : [];
    return list
      .map((d) => ({
        detailName: String(d?.detailName || d?.detail_name || "").trim(),
        perUnit: Number(d?.perUnit ?? d?.per_unit ?? 0) || 0,
      }))
      .filter((d) => d.detailName && d.perUnit > 0);
  }, [selectedTemplate]);

  // Catalog rows (admin) matched to the selected product (for section reassign).
  const matchedAdminRows = useMemo(() => {
    const key = norm(selected);
    if (!key) return [];
    const strict = adminRows.filter((r) => norm(r.item_name ?? r.itemName) === key);
    if (strict.length) return strict;
    return adminRows.filter((r) => {
      const n = norm(r.item_name ?? r.itemName);
      return n === key || n.startsWith(`${key} `) || n.startsWith(`${key}.`);
    });
  }, [adminRows, selected]);

  // Section(s) the product belongs to.
  const productSections = useMemo(() => {
    const set = new Map();
    for (const r of matchedAdminRows) {
      const s = String(r.section_name ?? r.sectionName ?? "").trim();
      if (s) set.set(norm(s), s);
    }
    if (set.size === 0) {
      const key = norm(selected);
      for (const r of sectionArticles) {
        if (norm(r.item_name ?? r.itemName) === key) {
          const s = String(r.section_name ?? r.sectionName ?? "").trim();
          if (s) set.set(norm(s), s);
        }
      }
    }
    return [...set.values()];
  }, [matchedAdminRows, sectionArticles, selected]);

  const sectionOptions = useMemo(() => {
    const set = new Map();
    for (const r of sectionArticles) {
      const s = String(r.section_name ?? r.sectionName ?? "").trim();
      if (s) set.set(norm(s), s);
    }
    for (const r of adminRows) {
      const s = String(r.section_name ?? r.sectionName ?? "").trim();
      if (s) set.set(norm(s), s);
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b, "ru"));
  }, [sectionArticles, adminRows]);

  useEffect(() => {
    if (!selectedSection && sectionOptions.length) setSelectedSection(sectionOptions[0]);
  }, [sectionOptions, selectedSection]);

  const showInfo = useCallback((itemName) => {
    const name = String(itemName || "").trim();
    if (name) setInfoItem(name);
  }, []);

  const drillItem = useCallback((itemName) => {
    const name = String(itemName || "").trim();
    if (!name) return;
    setSelected(name);
    setFocusMode("product");
    setInfoItem("");
  }, []);

  // Catalog info (articles, colors, section, source) for the item shown in the info panel.
  const infoArticleRows = useMemo(() => {
    const key = norm(infoItem);
    if (!key) return [];
    const map = new Map();
    for (const r of sectionArticles) {
      if (norm(r.item_name ?? r.itemName) !== key) continue;
      const article = String(r.article || "").trim();
      if (!article) continue;
      if (!map.has(article)) {
        map.set(article, {
          article,
          color: String(r.material ?? r.table_color ?? "").trim(),
          section: String(r.section_name ?? r.sectionName ?? "").trim(),
          source: "",
        });
      }
    }
    for (const r of adminRows) {
      if (norm(r.item_name ?? r.itemName) !== key) continue;
      const article = String(r.article || "").trim();
      if (!article) continue;
      const ex = map.get(article) || { article, color: "", section: "", source: "" };
      ex.color = ex.color || String(r.table_color ?? r.tableColor ?? "").trim();
      ex.section = ex.section || String(r.section_name ?? r.sectionName ?? "").trim();
      ex.source = String(r.source || "").trim();
      map.set(article, ex);
    }
    return [...map.values()].sort((a, b) => a.article.localeCompare(b.article, "ru"));
  }, [infoItem, sectionArticles, adminRows]);

  const infoData = useMemo(() => {
    if (!infoItem) return null;
    const tpl = resolveTpl(infoItem);
    const tplName = String(tpl?.productName || "").trim();
    const details = Array.isArray(tpl?.details)
      ? tpl.details
          .map((d) => ({
            detailName: String(d?.detailName || d?.detail_name || "").trim(),
            perUnit: Number(d?.perUnit ?? d?.per_unit ?? 0) || 0,
          }))
          .filter((d) => d.detailName && d.perUnit > 0)
      : [];
    const sectionSet = new Set(infoArticleRows.map((r) => r.section).filter(Boolean));
    const colorSet = new Set(infoArticleRows.map((r) => r.color).filter(Boolean));
    const realArticles = infoArticleRows.filter((r) => !/^ITEM-/i.test(r.article));
    const isCustom = (Array.isArray(furnitureCustomTemplates) ? furnitureCustomTemplates : []).some(
      (t) => norm(t?.product_name || t?.productName) === norm(infoItem),
    );
    const deletable = isCustom || (adminEditable && realArticles.length > 0);
    return {
      name: infoItem,
      templateName: tplName,
      templateFromAlias: !!tplName && norm(tplName) !== norm(infoItem),
      sections: [...sectionSet],
      colors: [...colorSet],
      articleRows: infoArticleRows,
      realArticles,
      realArticleCount: realArticles.length,
      details,
      isCustom,
      deletable,
    };
  }, [infoItem, resolveTpl, furnitureCustomTemplates, infoArticleRows, adminEditable]);

  const runMutation = useCallback(
    async (fn) => {
      if (!canOperate) return;
      setBusy(true);
      setError("");
      try {
        await fn();
        await loadCatalog();
        if (typeof reload === "function") {
          try {
            await reload();
          } catch (_) {
            /* ignore */
          }
        }
      } catch (e) {
        setError(String(e?.message || e || "Ошибка сохранения"));
      } finally {
        setBusy(false);
      }
    },
    [canOperate, loadCatalog, reload],
  );

  // Save the whole composition for the selected product (preserving sheet yields).
  // Пишем под каноничным именем шаблона (напр. «Кремона»), а не под именем
  // каталожной строки, чтобы не плодить отдельный состав на каждый цвет.
  const saveDetails = useCallback(
    (nextDetails) => {
      const name = String(templateNameRef.current || selectedRef.current || "").trim();
      if (!name) return Promise.resolve();
      const custom = (Array.isArray(furnitureCustomTemplates) ? furnitureCustomTemplates : []).find(
        (t) => norm(t?.product_name || t?.productName) === norm(name),
      );
      const kits = Number(custom?.kits_per_sheet ?? custom?.kitsPerSheet ?? 0) || 0;
      const yields = Array.isArray(custom?.material_yields)
        ? custom.material_yields
        : Array.isArray(custom?.materialYields)
          ? custom.materialYields
          : [];
      const payload = (nextDetails || [])
        .map((d) => ({
          detailName: String(d.detailName || "").trim(),
          perUnit: Math.round((Number(d.perUnit) || 0) * 1000) / 1000,
        }))
        .filter((d) => d.detailName && d.perUnit > 0);
      return OrderService.upsertFurnitureCustomTemplate(name, payload, kits, yields);
    },
    [furnitureCustomTemplates],
  );

  const onSaveDetailQty = useCallback(
    (detailName, qty) =>
      runMutation(() =>
        saveDetails(
          selectedDetails.map((d) =>
            norm(d.detailName) === norm(detailName) ? { ...d, perUnit: qty } : d,
          ),
        ),
      ),
    [runMutation, saveDetails, selectedDetails],
  );

  const onDeleteDetail = useCallback(
    (detailName) =>
      runMutation(() =>
        saveDetails(selectedDetails.filter((d) => norm(d.detailName) !== norm(detailName))),
      ),
    [runMutation, saveDetails, selectedDetails],
  );

  const onAddDetail = useCallback(() => {
    const name = String(newDetail || "").trim();
    const q = Number(String(newQty).replace(",", "."));
    if (!name || !Number.isFinite(q) || q <= 0) return;
    if (selectedDetails.some((d) => norm(d.detailName) === norm(name))) {
      setError(`Деталь «${name}» уже есть в составе.`);
      return;
    }
    runMutation(async () => {
      await saveDetails([...selectedDetails, { detailName: name, perUnit: q }]);
      setNewDetail("");
      setNewQty("1");
    });
  }, [newDetail, newQty, selectedDetails, runMutation, saveDetails]);

  const onReassignSection = useCallback(() => {
    const section = String(targetSection || "").trim();
    if (!section || !matchedAdminRows.length) return;
    runMutation(async () => {
      for (const r of matchedAdminRows) {
        await OrderService.adminUpsertItemArticleMapRow({
          prevArticle: String(r.article || "").trim(),
          article: String(r.article || "").trim(),
          itemName: String(r.item_name ?? r.itemName ?? "").trim(),
          source: String(r.source || "manual").trim() || "manual",
          sectionName: section,
          tableColor: String(r.table_color ?? r.tableColor ?? "").trim(),
          sortOrder: Number(r.sort_order ?? r.sortOrder ?? 999) || 999,
        });
      }
    });
  }, [targetSection, matchedAdminRows, runMutation]);

  const onDeleteItem = useCallback(() => {
    if (!canOperate || !infoData || !infoData.deletable) return;
    const name = infoData.name;
    const realRows = infoData.realArticles || [];
    const parts = [];
    if (infoData.isCustom) parts.push("• удалить сохранённый состав изделия");
    if (adminEditable && realRows.length) parts.push(`• удалить ${realRows.length} строк(и) каталога (артикулы)`);
    const ok = window.confirm(
      `Удалить изделие «${name}»?\n${parts.join("\n")}\n\nДействие необратимо.`,
    );
    if (!ok) return;
    runMutation(async () => {
      if (infoData.isCustom) {
        try {
          await OrderService.deleteFurnitureCustomTemplate(name);
        } catch (_) {
          /* ignore */
        }
      }
      if (adminEditable) {
        for (const r of realRows) {
          try {
            await OrderService.adminDeleteItemArticleMapRow(r.article);
          } catch (_) {
            /* ignore */
          }
        }
      }
      setInfoItem("");
      if (norm(selectedRef.current) === norm(name)) setSelected("");
    });
  }, [canOperate, infoData, adminEditable, runMutation]);

  // Build nodes & edges for the SECTION focus: Section -> its items
  useEffect(() => {
    if (focusMode !== "section") return;
    const rowH = 72;
    const X_SECTION = 0;
    const X_ITEM = 460;
    const ARROW = (color) => ({ type: MarkerType.ArrowClosed, color });

    if (!selectedSection) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const centerY = (Math.max(sectionItemList.length, 1) * rowH) / 2;
    const nextNodes = [];
    const nextEdges = [];

    nextNodes.push({
      id: "section",
      type: "section",
      position: { x: X_SECTION, y: centerY },
      data: { label: selectedSection },
      draggable: true,
    });

    sectionItemList.forEach((itemName, i) => {
      const id = `item-${i}`;
      const tpl = resolveTpl(itemName);
      const cnt = tpl
        ? (Array.isArray(tpl.details)
            ? tpl.details.filter((d) => (Number(d?.perUnit ?? d?.per_unit ?? 0) || 0) > 0).length
            : 0)
        : null;
      nextNodes.push({
        id,
        type: "secitem",
        position: { x: X_ITEM, y: i * rowH },
        data: {
          label: furnitureProductLabel(itemName),
          detailCount: cnt,
          onOpen: () => showInfo(itemName),
        },
        draggable: true,
      });
      nextEdges.push({
        id: `e-section-${id}`,
        source: "section",
        sourceHandle: "out",
        target: id,
        targetHandle: "in",
        markerEnd: ARROW("#f59e0b"),
        style: { stroke: "#f59e0b", strokeWidth: 1.5 },
      });
    });

    setNodes(nextNodes);
    setEdges(nextEdges);
  }, [
    focusMode,
    selectedSection,
    sectionItemList,
    resolveTpl,
    furnitureProductLabel,
    showInfo,
    setNodes,
    setEdges,
  ]);

  // Build nodes & edges for the PRODUCT focus: Section -> Product -> Details
  useEffect(() => {
    if (focusMode !== "product") return;
    if (!selected) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const rowH = 86;
    const X_SECTION = 0;
    const X_PRODUCT = 420;
    const X_DETAIL = 820;
    const ARROW = (color) => ({ type: MarkerType.ArrowClosed, color });

    const centerY = (Math.max(productSections.length, selectedDetails.length, 1) * rowH) / 2;

    const nextNodes = [];
    const nextEdges = [];

    nextNodes.push({
      id: "product",
      type: "product",
      position: { x: X_PRODUCT, y: centerY },
      data: {
        label: furnitureProductLabel(selected),
        detailCount: selectedDetails.length,
        sectionLabel: productSections.join(", "),
        templateName: norm(templateName) !== norm(selected) ? templateName : "",
        onInfo: () => showInfo(selected),
      },
      draggable: true,
    });

    productSections.forEach((s, i) => {
      const id = `sec-${i}`;
      nextNodes.push({
        id,
        type: "section",
        position: { x: X_SECTION, y: i * rowH },
        data: { label: s },
        draggable: true,
      });
      nextEdges.push({
        id: `e-${id}-product`,
        source: id,
        sourceHandle: "out",
        target: "product",
        targetHandle: "in",
        markerEnd: ARROW("#f59e0b"),
        style: { stroke: "#f59e0b", strokeWidth: 1.5 },
      });
    });

    selectedDetails.forEach((d, i) => {
      const id = `det-${i}`;
      const articles = detailArticles(furnitureArticleSearchRows, templateName || selected, d.detailName);
      nextNodes.push({
        id,
        type: "detail",
        position: { x: X_DETAIL, y: i * rowH },
        data: {
          name: d.detailName,
          qty: d.perUnit,
          articles,
          canEdit: canOperate,
          onSaveQty: (q) => onSaveDetailQty(d.detailName, q),
          onDelete: () => onDeleteDetail(d.detailName),
        },
        draggable: true,
      });
      nextEdges.push({
        id: `e-product-${id}`,
        source: "product",
        sourceHandle: "out",
        target: id,
        label: `× ${fmtQty(d.perUnit)}`,
        animated: true,
        markerEnd: ARROW("#60a5fa"),
        style: { stroke: "#60a5fa", strokeWidth: 1.5 },
        labelStyle: { fill: "#dbeafe", fontWeight: 700 },
        labelBgStyle: { fill: "#1e293b" },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
      });
    });

    setNodes(nextNodes);
    setEdges(nextEdges);
  }, [
    focusMode,
    selected,
    selectedDetails,
    productSections,
    templateName,
    furnitureArticleSearchRows,
    furnitureProductLabel,
    canOperate,
    onSaveDetailQty,
    onDeleteDetail,
    showInfo,
    setNodes,
    setEdges,
  ]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <style>{STYLE}</style>

      <div className="fbp-toolbar">
        <div className="fbp-field">
          <span>Режим</span>
          <div className="fbp-modes">
            <button
              type="button"
              className={focusMode === "section" ? "active" : ""}
              onClick={() => setFocusMode("section")}
            >
              По секции
            </button>
            <button
              type="button"
              className={focusMode === "product" ? "active" : ""}
              onClick={() => setFocusMode("product")}
            >
              По изделию
            </button>
          </div>
        </div>

        {focusMode === "section" ? (
          <div className="fbp-field" style={{ minWidth: 280, flex: "1 1 280px" }}>
            <span>Секция</span>
            <select
              className="fbp-select"
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
            >
              {sectionOptions.length === 0 && <option value="">— нет секций —</option>}
              {sectionOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="fbp-field" style={{ minWidth: 280, flex: "1 1 280px" }}>
            <span>Изделие</span>
            <select
              className="fbp-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {products.map((p) => (
                <option key={p} value={p}>
                  {furnitureProductLabel(p)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {focusMode === "product" && canOperate && (
        <div className="fbp-toolbar">
          <div className="fbp-field" style={{ minWidth: 220 }}>
            <span>Перенести в секцию</span>
            <select
              className="fbp-select"
              value={targetSection}
              onChange={(e) => setTargetSection(e.target.value)}
              disabled={!adminEditable || !matchedAdminRows.length}
            >
              <option value="">— выбрать секцию —</option>
              {sectionOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="fbp-btn fbp-btn--ghost"
            onClick={onReassignSection}
            disabled={busy || !targetSection || !matchedAdminRows.length}
            title={
              matchedAdminRows.length
                ? `Перепривяжет ${matchedAdminRows.length} артикул(ов) изделия к выбранной секции`
                : "У изделия нет артикулов в каталоге — перенос недоступен"
            }
          >
            Перенести
          </button>
          <div className="fbp-field" style={{ minWidth: 220, flex: "1 1 220px" }}>
            <span>Новая деталь</span>
            <input
              className="fbp-input"
              value={newDetail}
              onChange={(e) => setNewDetail(e.target.value)}
              placeholder="Например: Столешка (500_900)"
            />
          </div>
          <div className="fbp-field" style={{ width: 110 }}>
            <span>Кол-во / шт</span>
            <input
              className="fbp-input"
              value={newQty}
              inputMode="decimal"
              onChange={(e) => setNewQty(e.target.value.replace(/[^0-9.,]/g, ""))}
              placeholder="1"
              style={{ textAlign: "center", fontWeight: 700 }}
            />
          </div>
          <button
            type="button"
            className="fbp-btn"
            onClick={onAddDetail}
            disabled={busy || !selected || !String(newDetail).trim()}
          >
            + Деталь
          </button>
        </div>
      )}

      {error && <div className="error">{error}</div>}
      {loading && <div className="empty">Загружаю каталог…</div>}

      <div className="fbp-wrap">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#1e293b" gap={20} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor="#334155" maskColor="rgba(2,6,23,0.7)" />
        </ReactFlow>

        {infoData && (
          <div className="fbp-info">
            <button
              type="button"
              className="fbp-info__close"
              onClick={() => setInfoItem("")}
              title="Закрыть"
            >
              ×
            </button>
            <div className="fbp-info__title">Изделие</div>
            <div className="fbp-info__name">{furnitureProductLabel(infoData.name)}</div>

            <div className="fbp-info__sect">Секция</div>
            <div className="fbp-info__chips">
              {infoData.sections.length ? (
                infoData.sections.map((s) => (
                  <span key={s} className="fbp-info__chip">{s}</span>
                ))
              ) : (
                <span className="fbp-info__muted">не указана</span>
              )}
            </div>

            <div className="fbp-info__sect">
              Артикулы{infoData.realArticleCount ? ` · ${infoData.realArticleCount}` : ""}
            </div>
            {infoData.articleRows.length ? (
              <div>
                {infoData.articleRows.map((r) => (
                  <div key={r.article} className="fbp-info__art">
                    <span className="fbp-info__artcode">{r.article}</span>
                    <span className="fbp-info__artcolor">
                      {r.color || "—"}
                      {r.source && r.source !== "manual" ? ` · ${r.source}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="fbp-info__muted">нет артикулов в каталоге</div>
            )}

            {infoData.colors.length > 0 && (
              <>
                <div className="fbp-info__sect">Цвета / материалы</div>
                <div className="fbp-info__chips">
                  {infoData.colors.map((c) => (
                    <span key={c} className="fbp-info__chip">{c}</span>
                  ))}
                </div>
              </>
            )}

            <div className="fbp-info__sect">
              Состав ({infoData.details.length})
              {infoData.templateFromAlias ? ` · шаблон «${infoData.templateName}»` : ""}
            </div>
            {infoData.details.length ? (
              <div>
                {infoData.details.map((d) => (
                  <div key={d.detailName} className="fbp-info__det">
                    <span>{d.detailName}</span>
                    <span className="fbp-info__detqty">× {fmtQty(d.perUnit)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="fbp-info__muted">состав не задан</div>
            )}

            <button
              type="button"
              className="fbp-info__btn"
              onClick={() => drillItem(infoData.name)}
            >
              Открыть состав / редактировать →
            </button>

            {canOperate && (
              <button
                type="button"
                className="fbp-info__btn fbp-info__btn--danger"
                onClick={onDeleteItem}
                disabled={busy || !infoData.deletable}
                title={
                  infoData.deletable
                    ? "Удалить состав и строки каталога этого изделия"
                    : "Встроенное изделие из файла — удаление недоступно (нет состава и артикулов в БД)"
                }
              >
                Удалить изделие
              </button>
            )}
          </div>
        )}
      </div>

      <div className="empty" style={{ color: "#6b7280", fontSize: 12 }}>
        {focusMode === "section" ? (
          <>
            <b>По секции:</b> слева секция, справа — все её изделия. Клик по изделию открывает его
            состав (режим «По изделию»).
          </>
        ) : (
          <>
            Цепочка слева направо: <b>Секция → Изделие → Деталь</b>. Оранжевые стрелки — к какой
            секции относится изделие; синие — детали состава с кол-вом на 1 изделие и привязанными
            артикулами.
            {canOperate
              ? " Кол-во детали меняется в узле, × — убрать деталь, «+ Деталь» — добавить. «Перенести» меняет секцию изделия в каталоге."
              : " Режим просмотра."}
          </>
        )}
      </div>
    </div>
  );
}

export default FurnitureBomGraph;
