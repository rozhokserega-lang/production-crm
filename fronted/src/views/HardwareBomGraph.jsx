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

const norm = (s) => String(s ?? "").trim().toLowerCase();

function fmtQty(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 1000) / 1000);
}

// ---------------------------------------------------------------------------
// Custom nodes (blueprint style)
// ---------------------------------------------------------------------------
function ProductNode({ data }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label || "");
  useEffect(() => setDraft(data.label || ""), [data.label]);

  return (
    <div className="bp-node bp-node--product">
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="hw" />
      <div className="bp-node__title">Изделие</div>
      {editing ? (
        <input
          autoFocus
          className="bp-node__rename"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            const next = draft.trim();
            if (next && norm(next) !== norm(data.label)) data.onRename?.(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(data.label || "");
              setEditing(false);
            }
          }}
        />
      ) : (
        <div
          className="bp-node__name"
          title={data.canEdit ? "Двойной клик — переименовать" : undefined}
          onDoubleClick={() => data.canEdit && setEditing(true)}
        >
          {data.label || "—"}
        </div>
      )}
      <div className="bp-node__meta">
        фурнитуры: {data.hardwareCount} · план: {data.sectionCount}
      </div>
    </div>
  );
}

function HardwareNode({ data }) {
  const [draft, setDraft] = useState(fmtQty(data.qty));
  useEffect(() => setDraft(fmtQty(data.qty)), [data.qty]);

  const commit = () => {
    const q = Number(String(draft).replace(",", "."));
    if (!Number.isFinite(q) || q < 0) {
      setDraft(fmtQty(data.qty));
      return;
    }
    if (q !== Number(data.qty)) data.onSaveQty?.(q);
  };

  return (
    <div className="bp-node bp-node--hw">
      <Handle type="target" position={Position.Left} />
      <div className="bp-node__name">{data.name}</div>
      {data.size ? <div className="bp-node__sub">{data.size}</div> : null}
      <div className="bp-node__row">
        <span className="bp-node__qtyLabel">кол-во</span>
        {data.canEdit ? (
          <input
            className="bp-node__qty"
            value={draft}
            inputMode="decimal"
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9.,]/g, ""))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        ) : (
          <b className="bp-node__qty bp-node__qty--ro">{fmtQty(data.qty)}</b>
        )}
        <span className="bp-node__unit">{data.unit || "шт"}</span>
      </div>
      {data.canEdit && (
        <button className="bp-node__del" title="Убрать фурнитуру" onClick={() => data.onDelete?.()}>
          ×
        </button>
      )}
    </div>
  );
}

function PlanNode({ data }) {
  const title =
    data.kind === "item" ? "Изделие плана" : data.kind === "pattern" ? "Шаблон названия" : "Секция плана";
  const cls =
    data.kind === "item" ? " bp-node--item" : data.kind === "pattern" ? " bp-node--pat" : " bp-node--sec";
  return (
    <div className={`bp-node${cls}`}>
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="out" />
      <div className="bp-node__title">{title}</div>
      <div className="bp-node__name">{data.label}</div>
      {data.canEdit && typeof data.onDelete === "function" && (
        <button className="bp-node__del" title="Убрать привязку" onClick={() => data.onDelete?.()}>
          ×
        </button>
      )}
    </div>
  );
}

const NODE_TYPES = { product: ProductNode, hardware: HardwareNode, plan: PlanNode };

const STYLE = `
.bp-wrap { position: relative; height: 72vh; min-height: 460px; border: 1px solid #1f2937; border-radius: 10px; overflow: hidden; background: #0b1220; }
.bp-wrap .react-flow__attribution { display: none; }
.bp-node { position: relative; min-width: 150px; max-width: 230px; padding: 8px 10px; border-radius: 8px; border: 1px solid #2b3a55; background: #111a2e; color: #e5edff; box-shadow: 0 2px 10px rgba(0,0,0,.35); font-size: 12px; }
.bp-node--product { border-color: #3b82f6; background: #13203b; min-width: 180px; }
.bp-node--hw { border-color: #6b7280; }
.bp-node--sec { border-color: #b45309; background: #1c1606; }
.bp-node--item { border-color: #0d9488; background: #07201d; }
.bp-node--pat { border-color: #a855f7; background: #160a22; }
.bp-node__title { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #93a4c8; margin-bottom: 2px; }
.bp-node__name { font-weight: 600; line-height: 1.2; word-break: break-word; }
.bp-node__sub { color: #9fb0d0; font-size: 11px; }
.bp-node__meta { margin-top: 4px; color: #7e8fb0; font-size: 10px; }
.bp-node__row { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.bp-node__qtyLabel { color: #9fb0d0; font-size: 10px; }
.bp-node__qty { width: 56px; padding: 2px 4px; border-radius: 5px; border: 1px solid #3b4a66; background: #0b1426; color: #e5edff; text-align: center; }
.bp-node__qty--ro { width: auto; border: none; background: transparent; }
.bp-node__unit { color: #7e8fb0; font-size: 10px; }
.bp-node__rename { width: 100%; padding: 2px 4px; border-radius: 5px; border: 1px solid #3b82f6; background: #0b1426; color: #e5edff; }
.bp-node__del { position: absolute; top: -8px; right: -8px; width: 18px; height: 18px; line-height: 16px; text-align: center; border-radius: 50%; border: 1px solid #7f1d1d; background: #b91c1c; color: #fff; cursor: pointer; padding: 0; font-size: 13px; }
.bp-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.bp-toolbar .grow { flex: 1 1 auto; }
.bp-chips { display: flex; gap: 6px; flex-wrap: wrap; max-height: 132px; overflow: auto; padding: 6px; border: 1px dashed #d1d5db; border-radius: 8px; }
.bp-chip { padding: 3px 10px; border-radius: 14px; border: 1px solid #b45309; background: #fff7ed; color: #9a3412; cursor: pointer; font-size: 12px; white-space: nowrap; }
.bp-chip:hover:not(:disabled) { background: #ffedd5; }
.bp-chip:disabled { opacity: .5; cursor: default; }
`;

export function HardwareBomGraph({ canOperateWarehouse = false }) {
  const [bomRows, setBomRows] = useState([]);
  const [mapRows, setMapRows] = useState([]);
  const [items, setItems] = useState([]);
  const [sections, setSections] = useState([]);
  const [sectionItems, setSectionItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState("");
  const [extraProducts, setExtraProducts] = useState([]);
  const [newProduct, setNewProduct] = useState("");

  const [addItemId, setAddItemId] = useState("");
  const [addItemQty, setAddItemQty] = useState("1");
  const [pickSection, setPickSection] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [addPattern, setAddPattern] = useState("");

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const loadAll = useCallback(async () => {
    const [bom, map, stock, sectionCatalog, secItems] = await Promise.all([
      OrderService.getHardwareBom().catch(() => []),
      OrderService.getHardwareProductMap().catch(() => []),
      OrderService.getHardwareStock().catch(() => []),
      OrderService.getSectionCatalog().catch(() => []),
      OrderService.getSectionArticles().catch(() => []),
    ]);
    setBomRows(Array.isArray(bom) ? bom : []);
    setMapRows(Array.isArray(map) ? map : []);
    setItems(Array.isArray(stock) ? stock : []);
    setSections(Array.isArray(sectionCatalog) ? sectionCatalog : []);
    setSectionItems(Array.isArray(secItems) ? secItems : []);
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAll()
      .catch((e) => setError(String(e?.message || e || "Ошибка загрузки")))
      .finally(() => setLoading(false));
  }, [loadAll]);

  const products = useMemo(() => {
    const set = new Map();
    for (const r of bomRows) {
      const p = String(r.bom_product || "").trim();
      if (p) set.set(norm(p), p);
    }
    for (const r of mapRows) {
      const p = String(r.bom_product || "").trim();
      if (p) set.set(norm(p), p);
    }
    for (const p of extraProducts) {
      if (p && p.trim()) set.set(norm(p), p.trim());
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b, "ru"));
  }, [bomRows, mapRows, extraProducts]);

  useEffect(() => {
    if (!selected && products.length) setSelected(products[0]);
    if (selected && !products.some((p) => norm(p) === norm(selected)) && products.length) {
      // keep selection even if not in list yet (freshly created)
    }
  }, [products, selected]);

  const linkedBom = useMemo(
    () => bomRows.filter((r) => norm(r.bom_product) === norm(selected)),
    [bomRows, selected],
  );
  const linkedMap = useMemo(
    () => mapRows.filter((r) => norm(r.bom_product) === norm(selected)),
    [mapRows, selected],
  );
  const availableItems = useMemo(() => {
    const used = new Set(linkedBom.map((r) => Number(r.hardware_item_id)));
    return items
      .filter((it) => !used.has(Number(it.id)))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "ru"));
  }, [items, linkedBom]);

  const itemsBySection = useMemo(() => {
    const map = new Map(); // norm(section) -> { name, items: Map(normItem -> itemName) }
    for (const r of sectionItems) {
      const section = String(r.section_name ?? r.sectionName ?? "").trim();
      const itemName = String(r.item_name ?? r.itemName ?? "").trim();
      if (!section) continue;
      const key = norm(section);
      if (!map.has(key)) map.set(key, { name: section, items: new Map() });
      if (itemName) map.get(key).items.set(norm(itemName), itemName);
    }
    return map;
  }, [sectionItems]);

  const itemToSection = useMemo(() => {
    const map = new Map(); // norm(itemName) -> section name
    for (const { name, items } of itemsBySection.values()) {
      for (const itemName of items.values()) {
        const key = norm(itemName);
        if (!map.has(key)) map.set(key, name);
      }
    }
    return map;
  }, [itemsBySection]);

  const sectionOptions = useMemo(() => {
    const set = new Map();
    for (const r of sections) {
      const name = String(r.section_name ?? r.sectionName ?? "").trim();
      if (name) set.set(norm(name), name);
    }
    for (const { name } of itemsBySection.values()) {
      if (name) set.set(norm(name), name);
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b, "ru"));
  }, [sections, itemsBySection]);

  const linkedSectionSet = useMemo(
    () => new Set(linkedMap.map((r) => norm(r.section_name)).filter(Boolean)),
    [linkedMap],
  );
  const linkedPatternSet = useMemo(
    () => new Set(linkedMap.map((r) => norm(r.item_name_pattern)).filter(Boolean)),
    [linkedMap],
  );

  const pickedItems = useMemo(() => {
    const entry = itemsBySection.get(norm(pickSection));
    if (!entry) return [];
    const q = norm(itemFilter);
    return [...entry.items.values()]
      .filter((n) => (q ? norm(n).includes(q) : true))
      .sort((a, b) => a.localeCompare(b, "ru"));
  }, [itemsBySection, pickSection, itemFilter]);

  const runMutation = useCallback(
    async (fn) => {
      if (!canOperateWarehouse) return;
      setBusy(true);
      setError("");
      try {
        await fn();
        await loadAll();
      } catch (e) {
        setError(String(e?.message || e || "Ошибка сохранения"));
      } finally {
        setBusy(false);
      }
    },
    [canOperateWarehouse, loadAll],
  );

  // Build nodes & edges for the focused product
  useEffect(() => {
    if (!selected) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const rowH = 96;
    const X_SECTION = 0;
    const X_ITEM = 360;
    const X_PRODUCT = 760;
    const X_HW = 1140;

    const ARROW = (color) => ({ type: MarkerType.ArrowClosed, color });

    // ── Plan side: build chain section -> plan item -> product ──
    const sectionNodes = new Map(); // normKey -> { id, name, mapRowId }
    const ensureSection = (name, mapRowId) => {
      const key = norm(name);
      if (!key) return null;
      if (!sectionNodes.has(key)) {
        sectionNodes.set(key, { id: `psec-${sectionNodes.size}`, name, mapRowId: mapRowId ?? null });
      } else if (mapRowId != null) {
        sectionNodes.get(key).mapRowId = mapRowId;
      }
      return sectionNodes.get(key);
    };

    const itemNodes = []; // { id, mapRowId, label, sectionId }
    const patternNodes = []; // { id, mapRowId, label }
    const wholeSectionIds = []; // section ids bound to the product directly

    linkedMap.forEach((r) => {
      const hasSection = !!String(r.section_name || "").trim();
      if (hasSection) {
        const sn = ensureSection(r.section_name, r.id);
        if (sn) wholeSectionIds.push(sn.id);
        return;
      }
      const pattern = String(r.item_name_pattern || "");
      if (/[%_]/.test(pattern)) {
        patternNodes.push({ id: `pat-${r.id}`, mapRowId: r.id, label: pattern });
      } else {
        const section = itemToSection.get(norm(pattern)) || "";
        const sn = section ? ensureSection(section, null) : null;
        itemNodes.push({ id: `pi-${r.id}`, mapRowId: r.id, label: pattern, sectionId: sn?.id || null });
      }
    });

    const sectionList = [...sectionNodes.values()];
    const midCount = itemNodes.length + patternNodes.length;
    const centerY =
      (Math.max(sectionList.length, midCount, linkedBom.length, 1) * rowH) / 2;

    const nextNodes = [];
    const nextEdges = [];

    // Product (center)
    nextNodes.push({
      id: "product",
      type: "product",
      position: { x: X_PRODUCT, y: centerY },
      data: {
        label: selected,
        canEdit: canOperateWarehouse,
        hardwareCount: linkedBom.length,
        sectionCount: linkedMap.length,
        onRename: (next) =>
          runMutation(async () => {
            await OrderService.renameHardwareBomProduct(selectedRef.current, next);
            setExtraProducts((prev) => prev.filter((p) => norm(p) !== norm(selectedRef.current)));
            setSelected(next);
          }),
      },
      draggable: true,
    });

    // Section nodes (leftmost column)
    sectionList.forEach((sn, i) => {
      const { mapRowId } = sn;
      nextNodes.push({
        id: sn.id,
        type: "plan",
        position: { x: X_SECTION, y: i * rowH },
        data: {
          kind: "section",
          label: sn.name,
          canEdit: canOperateWarehouse,
          onDelete:
            mapRowId != null
              ? () => runMutation(() => OrderService.deleteHardwareProductMapRow(mapRowId))
              : undefined,
        },
        draggable: true,
      });
    });

    // Plan-item nodes (middle column) with section -> item -> product chain
    let midIdx = 0;
    itemNodes.forEach((it) => {
      nextNodes.push({
        id: it.id,
        type: "plan",
        position: { x: X_ITEM, y: midIdx * rowH },
        data: {
          kind: "item",
          label: it.label,
          canEdit: canOperateWarehouse,
          onDelete: () => runMutation(() => OrderService.deleteHardwareProductMapRow(it.mapRowId)),
        },
        draggable: true,
      });
      midIdx += 1;
      if (it.sectionId) {
        nextEdges.push({
          id: `e-${it.sectionId}-${it.id}`,
          source: it.sectionId,
          sourceHandle: "out",
          target: it.id,
          targetHandle: "in",
          markerEnd: ARROW("#f59e0b"),
          style: { stroke: "#f59e0b", strokeWidth: 1.5 },
        });
      }
      nextEdges.push({
        id: `e-${it.id}-product`,
        source: it.id,
        sourceHandle: "out",
        target: "product",
        targetHandle: "in",
        markerEnd: ARROW("#14b8a6"),
        style: { stroke: "#14b8a6", strokeWidth: 1.5 },
      });
    });

    // Pattern nodes (middle column) -> product
    patternNodes.forEach((pn) => {
      nextNodes.push({
        id: pn.id,
        type: "plan",
        position: { x: X_ITEM, y: midIdx * rowH },
        data: {
          kind: "pattern",
          label: pn.label,
          canEdit: canOperateWarehouse,
          onDelete: () => runMutation(() => OrderService.deleteHardwareProductMapRow(pn.mapRowId)),
        },
        draggable: true,
      });
      midIdx += 1;
      nextEdges.push({
        id: `e-${pn.id}-product`,
        source: pn.id,
        sourceHandle: "out",
        target: "product",
        targetHandle: "in",
        markerEnd: ARROW("#a855f7"),
        style: { stroke: "#a855f7", strokeWidth: 1.5, strokeDasharray: "5 4" },
      });
    });

    // Whole-section mappings: section -> product directly
    wholeSectionIds.forEach((sid) => {
      nextEdges.push({
        id: `e-${sid}-product`,
        source: sid,
        sourceHandle: "out",
        target: "product",
        targetHandle: "in",
        markerEnd: ARROW("#f59e0b"),
        style: { stroke: "#f59e0b", strokeWidth: 1.5 },
      });
    });

    // Hardware nodes (right column): product -> hardware (qty on edge)
    linkedBom.forEach((r, i) => {
      const id = `hw-${r.id}`;
      nextNodes.push({
        id,
        type: "hardware",
        position: { x: X_HW, y: i * rowH },
        data: {
          name: r.name,
          size: r.size,
          unit: r.unit,
          qty: r.qty_per_unit,
          canEdit: canOperateWarehouse,
          onSaveQty: (q) =>
            runMutation(() =>
              OrderService.upsertHardwareBomRow({
                id: r.id,
                hardwareItemId: r.hardware_item_id,
                bomProduct: selectedRef.current,
                qty: q,
              }),
            ),
          onDelete: () => runMutation(() => OrderService.deleteHardwareBomRow(r.id)),
        },
        draggable: true,
      });
      nextEdges.push({
        id: `e-${id}`,
        source: "product",
        sourceHandle: "hw",
        target: id,
        label: `× ${fmtQty(r.qty_per_unit)}`,
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
  }, [selected, linkedBom, linkedMap, itemToSection, canOperateWarehouse, runMutation, setNodes, setEdges]);

  const addHardware = useCallback(() => {
    const itemId = Number(addItemId);
    const qty = Number(String(addItemQty).replace(",", "."));
    if (!itemId || !Number.isFinite(qty) || qty < 0 || !selected) return;
    runMutation(async () => {
      await OrderService.upsertHardwareBomRow({
        id: null,
        hardwareItemId: itemId,
        bomProduct: selected,
        qty,
      });
      setAddItemId("");
      setAddItemQty("1");
    });
  }, [addItemId, addItemQty, selected, runMutation]);

  const attachSection = useCallback(
    (sectionName) => {
      const section = String(sectionName || "").trim();
      if (!section || !selected) return;
      runMutation(() =>
        OrderService.upsertHardwareProductMapRow({
          id: null,
          bomProduct: selected,
          sectionName: section,
          itemNamePattern: null,
          sortOrder: 100,
          isActive: true,
        }),
      );
    },
    [selected, runMutation],
  );

  const attachItem = useCallback(
    (itemName) => {
      const item = String(itemName || "").trim();
      if (!item || !selected) return;
      runMutation(() =>
        OrderService.upsertHardwareProductMapRow({
          id: null,
          bomProduct: selected,
          sectionName: null,
          itemNamePattern: item,
          sortOrder: 100,
          isActive: true,
        }),
      );
    },
    [selected, runMutation],
  );

  const addPatternMapping = useCallback(() => {
    const pattern = addPattern.trim();
    if (!pattern || !selected) return;
    runMutation(async () => {
      await OrderService.upsertHardwareProductMapRow({
        id: null,
        bomProduct: selected,
        sectionName: null,
        itemNamePattern: pattern,
        sortOrder: 100,
        isActive: true,
      });
      setAddPattern("");
    });
  }, [addPattern, selected, runMutation]);

  const createProduct = useCallback(() => {
    const name = newProduct.trim();
    if (!name) return;
    setExtraProducts((prev) => (prev.some((p) => norm(p) === norm(name)) ? prev : [...prev, name]));
    setSelected(name);
    setNewProduct("");
  }, [newProduct]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <style>{STYLE}</style>

      <div className="bp-toolbar">
        <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ minWidth: 220 }}>
          <option value="">— выберите изделие —</option>
          {products.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {canOperateWarehouse && (
          <>
            <input
              value={newProduct}
              placeholder="Новое изделие…"
              onChange={(e) => setNewProduct(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createProduct()}
              style={{ minWidth: 160 }}
            />
            <button className="mini" disabled={!newProduct.trim()} onClick={createProduct}>
              + Изделие
            </button>
          </>
        )}
        <span className="grow" />
        <button className="mini" disabled={busy} onClick={() => loadAll()}>
          Обновить
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {canOperateWarehouse && selected && (
        <div style={{ display: "grid", gap: 8 }}>
          <div className="bp-toolbar" style={{ gap: 6 }}>
            <select value={addItemId} onChange={(e) => setAddItemId(e.target.value)} style={{ minWidth: 200 }}>
              <option value="">+ фурнитура…</option>
              {availableItems.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                  {it.size ? ` (${it.size})` : ""}
                </option>
              ))}
            </select>
            <input
              value={addItemQty}
              inputMode="decimal"
              onChange={(e) => setAddItemQty(e.target.value.replace(/[^0-9.,]/g, ""))}
              style={{ width: 64 }}
              title="Количество на 1 изделие"
            />
            <button className="mini ok" disabled={busy || !addItemId} onClick={addHardware}>
              Добавить
            </button>
          </div>

          <div style={{ display: "grid", gap: 4 }}>
            <div className="bp-toolbar" style={{ gap: 6 }}>
              <span style={{ color: "#6b7280", fontSize: 12 }}>Привязка к плану — секция:</span>
              <select
                value={pickSection}
                onChange={(e) => {
                  setPickSection(e.target.value);
                  setItemFilter("");
                }}
                style={{ minWidth: 200 }}
              >
                <option value="">— выберите секцию каталога —</option>
                {sectionOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {pickSection && (
                <button
                  className="mini"
                  disabled={busy || linkedSectionSet.has(norm(pickSection))}
                  title="Привязать всю секцию (все изделия)"
                  onClick={() => attachSection(pickSection)}
                >
                  {linkedSectionSet.has(norm(pickSection)) ? "✓ вся секция" : "+ вся секция"}
                </button>
              )}
              <span className="grow" />
              <input
                value={addPattern}
                placeholder="или %шаблон названия%"
                onChange={(e) => setAddPattern(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPatternMapping()}
                style={{ minWidth: 160 }}
              />
              <button className="mini" disabled={busy || !addPattern.trim()} onClick={addPatternMapping}>
                + шаблон
              </button>
            </div>

            {pickSection && (
              <div style={{ display: "grid", gap: 4 }}>
                <div className="bp-toolbar" style={{ gap: 6 }}>
                  <span style={{ color: "#6b7280", fontSize: 12 }}>Конкретные изделия секции:</span>
                  <input
                    value={itemFilter}
                    placeholder="фильтр изделий… (напр. подвесная)"
                    onChange={(e) => setItemFilter(e.target.value)}
                    style={{ minWidth: 200 }}
                  />
                </div>
                <div className="bp-chips">
                  {pickedItems.length === 0 ? (
                    <span style={{ color: "#9ca3af", fontSize: 12 }}>
                      {itemFilter ? "Изделия не найдены" : "В этой секции нет изделий в каталоге"}
                    </span>
                  ) : (
                    pickedItems.map((it) => {
                      const linked = linkedPatternSet.has(norm(it));
                      return (
                        <button
                          key={it}
                          className="bp-chip"
                          disabled={busy || linked}
                          title={linked ? "Уже привязано" : "Привязать конкретное изделие"}
                          onClick={() => attachItem(it)}
                        >
                          {linked ? "✓ " : "+ "}
                          {it}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bp-wrap">
        {loading ? (
          <div className="empty" style={{ padding: 24, color: "#9fb0d0" }}>
            Загрузка схемы…
          </div>
        ) : !selected ? (
          <div className="empty" style={{ padding: 24, color: "#9fb0d0" }}>
            Выберите изделие, чтобы увидеть его фурнитуру и привязки к плану.
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#22304d" gap={20} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable maskColor="rgba(2,6,23,0.6)" nodeColor="#1e293b" />
          </ReactFlow>
        )}
      </div>

      <div className="empty" style={{ color: "#6b7280", fontSize: 12 }}>
        Цепочка слева направо: <b>Секция плана → Изделие плана → Изделие → Фурнитура</b>.
        Оранжевые стрелки — секция→изделие плана (или вся секция→изделие), бирюзовые — изделие
        плана→изделие, фиолетовые пунктирные — шаблон названия, синие — фурнитура с количеством на 1 шт.
        {canOperateWarehouse ? " Двойной клик по изделию — переименовать." : " Режим просмотра."}
      </div>
    </div>
  );
}

export default HardwareBomGraph;
