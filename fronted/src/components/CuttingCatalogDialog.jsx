import { useCallback, useEffect, useMemo, useState } from "react";
import { OrderService } from "../services/orderService";
import { useAuth } from "../contexts/AuthContext";
import {
  expandCatalogKitToCuttingItems,
  countCatalogKitPieces,
  normalizeCatalogItem,
  furnitureTemplateToCatalogItems,
} from "../app/cuttingCatalogHelpers";

const EMPTY_ITEM = { itemName: "", w: "", h: "", perUnit: 1, material: "" };

function KitEditor({ kit, furnitureTemplates, onSave, onDelete, onCancel, saving }) {
  const [name, setName] = useState(kit?.name || "");
  const [items, setItems] = useState(
    (kit?.items?.length ? kit.items : [{ ...EMPTY_ITEM }]).map((it) => ({
      itemName: it.itemName || "",
      w: it.w ?? "",
      h: it.h ?? "",
      perUnit: it.perUnit ?? 1,
      material: it.material || "",
    })),
  );
  const [importProduct, setImportProduct] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setName(kit?.name || "");
    setItems(
      (kit?.items?.length ? kit.items : [{ ...EMPTY_ITEM }]).map((it) => ({
        itemName: it.itemName || "",
        w: it.w ?? "",
        h: it.h ?? "",
        perUnit: it.perUnit ?? 1,
        material: it.material || "",
      })),
    );
    setError("");
  }, [kit]);

  const updateItem = (idx, field, value) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const handleImportFurniture = () => {
    const tpl = furnitureTemplates.find((t) => t.product_name === importProduct);
    if (!tpl) return;
    const imported = furnitureTemplateToCatalogItems(tpl);
    if (!imported.length) {
      setError("Не удалось извлечь размеры из шаблона конструктора");
      return;
    }
    if (!name.trim()) setName(tpl.product_name);
    setItems(imported.map((it) => ({
      itemName: it.itemName,
      w: it.w,
      h: it.h,
      perUnit: it.perUnit,
      material: it.material,
    })));
    setError("");
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Укажите название комплекта");
      return;
    }
    const normalized = items
      .map((it) => normalizeCatalogItem(it))
      .filter(Boolean);
    if (!normalized.length) {
      setError("Добавьте хотя бы одну деталь с размером (Ш×В)");
      return;
    }
    onSave({
      id: kit?.id || 0,
      name: trimmedName,
      items: normalized,
    });
  };

  return (
    <div className="cv-catalog-editor">
      <div className="cv-catalog-editor__row">
        <label className="cv-catalog-field cv-catalog-field--grow">
          <span>Название комплекта</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Siena 2 150" />
        </label>
      </div>

      {furnitureTemplates.length > 0 && (
        <div className="cv-catalog-editor__import">
          <select value={importProduct} onChange={(e) => setImportProduct(e.target.value)}>
            <option value="">Импорт из конструктора мебели…</option>
            {furnitureTemplates.map((t) => (
              <option key={t.product_name} value={t.product_name}>{t.product_name}</option>
            ))}
          </select>
          <button type="button" className="mini" disabled={!importProduct} onClick={handleImportFurniture}>
            Загрузить состав
          </button>
        </div>
      )}

      <div className="cv-catalog-editor__table-wrap">
        <table className="cv-catalog-editor__table">
          <thead>
            <tr>
              <th>Деталь</th>
              <th>Ш</th>
              <th>В</th>
              <th>На компл.</th>
              <th>Материал</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx}>
                <td>
                  <input
                    value={it.itemName}
                    onChange={(e) => updateItem(idx, "itemName", e.target.value)}
                    placeholder="Крышка (736×350)"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    value={it.w}
                    onChange={(e) => updateItem(idx, "w", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    value={it.h}
                    onChange={(e) => updateItem(idx, "h", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    value={it.perUnit}
                    onChange={(e) => updateItem(idx, "perUnit", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    value={it.material}
                    onChange={(e) => updateItem(idx, "material", e.target.value)}
                    placeholder="ЛДСП 16"
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="cv-catalog-editor__del"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    title="Удалить строку"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        className="mini"
        onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])}
      >
        + Деталь
      </button>

      {error ? <div className="cv-catalog-editor__error">{error}</div> : null}

      <div className="cv-catalog-editor__actions">
        <button type="button" className="mini accent" disabled={saving} onClick={handleSave}>
          {saving ? "Сохранение…" : "Сохранить комплект"}
        </button>
        {kit?.id ? (
          <button type="button" className="mini" disabled={saving} onClick={() => onDelete(kit.id)}>
            Удалить
          </button>
        ) : null}
        <button type="button" className="mini" onClick={onCancel}>Отмена</button>
      </div>
    </div>
  );
}

export function CuttingCatalogDialog({ open, onClose, onAddItems, existingMaterials = [] }) {
  const { canOperateProduction } = useAuth();
  const canManageCatalog = canOperateProduction;
  const [tab, setTab] = useState("add");
  const [kits, setKits] = useState([]);
  const [furnitureTemplates, setFurnitureTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [setsCount, setSetsCount] = useState(1);
  const [material, setMaterial] = useState("");
  const [editingKit, setEditingKit] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [kitsRows, tplRows] = await Promise.all([
        OrderService.getCuttingCatalogKits(),
        OrderService.getFurnitureCustomTemplates().catch(() => []),
      ]);
      setKits(Array.isArray(kitsRows) ? kitsRows : []);
      setFurnitureTemplates(Array.isArray(tplRows) ? tplRows : []);
    } catch (e) {
      const raw = e?.message || "Не удалось загрузить каталог";
      try {
        const parsed = JSON.parse(raw);
        setError(parsed?.message || raw);
      } catch {
        setError(raw);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setTab("add");
    setSearch("");
    setSelectedId(null);
    setSetsCount(1);
    setMaterial("");
    setEditingKit(null);
    load();
  }, [open, load]);

  const filteredKits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return kits;
    return kits.filter((k) => String(k.name || "").toLowerCase().includes(q));
  }, [kits, search]);

  const selectedKit = useMemo(
    () => kits.find((k) => k.id === selectedId) || null,
    [kits, selectedId],
  );

  const previewCount = selectedKit ? countCatalogKitPieces(selectedKit, setsCount) : 0;

  const handleAddToCutting = () => {
    if (!selectedKit) {
      setError("Выберите комплект из каталога");
      return;
    }
    const items = expandCatalogKitToCuttingItems(selectedKit, setsCount, material);
    if (!items.length) {
      setError("В комплекте нет деталей с размерами");
      return;
    }
    onAddItems(items, {
      kitName: selectedKit.name,
      setsCount,
    });
    onClose();
  };

  const handleSaveKit = async (payload) => {
    setSaving(true);
    setError("");
    try {
      const saved = await OrderService.upsertCuttingCatalogKit(payload);
      await load();
      setEditingKit(null);
      setTab("add");
      if (saved?.id) setSelectedId(saved.id);
    } catch (e) {
      setError(e?.message || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKit = async (id) => {
    if (!window.confirm("Удалить комплект из каталога?")) return;
    setSaving(true);
    setError("");
    try {
      await OrderService.deleteCuttingCatalogKit(id);
      if (selectedId === id) setSelectedId(null);
      setEditingKit(null);
      await load();
      setTab("add");
    } catch (e) {
      setError(e?.message || "Ошибка удаления");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const datalistId = "cv-catalog-materials";

  return (
    <div className="cv-catalog-overlay" onMouseDown={onClose}>
      <div className="cv-catalog-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cv-catalog-dialog__head">
          <b>Каталог раскроя</b>
          <button type="button" className="cv-catalog-dialog__close" onClick={onClose}>✕</button>
        </div>

        <div className="cv-catalog-dialog__tabs">
          <button
            type="button"
            className={`cv-catalog-tab${tab === "add" ? " cv-catalog-tab--active" : ""}`}
            onClick={() => { setTab("add"); setEditingKit(null); }}
          >
            Добавить в раскрой
          </button>
          {canManageCatalog && (
            <button
              type="button"
              className={`cv-catalog-tab${tab === "manage" ? " cv-catalog-tab--active" : ""}`}
              onClick={() => { setTab("manage"); setEditingKit(null); }}
            >
              Каталог комплектов
            </button>
          )}
        </div>

        {error ? <div className="cv-catalog-dialog__error">{error}</div> : null}

        {loading ? (
          <div className="cv-catalog-dialog__loading">Загрузка…</div>
        ) : tab === "add" ? (
          <div className="cv-catalog-add">
            <input
              className="cv-catalog-search"
              placeholder="Поиск: Siena, тумба…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className="cv-catalog-list">
              {filteredKits.length === 0 ? (
                <div className="cv-catalog-list__empty">
                  {canManageCatalog
                    ? "Каталог пуст. Перейдите на вкладку «Каталог комплектов» и создайте комплект или импортируйте из конструктора мебели."
                    : "Каталог пуст. Попросите оператора или администратора добавить комплекты."}
                </div>
              ) : (
                filteredKits.map((kit) => {
                  const parts = Array.isArray(kit.items) ? kit.items.length : 0;
                  return (
                    <button
                      key={kit.id}
                      type="button"
                      className={`cv-catalog-list__item${selectedId === kit.id ? " cv-catalog-list__item--active" : ""}`}
                      onClick={() => setSelectedId(kit.id)}
                    >
                      <span className="cv-catalog-list__name">{kit.name}</span>
                      <span className="cv-catalog-list__meta">{parts} дет. в комплекте</span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="cv-catalog-add__form">
              <label className="cv-catalog-field">
                <span>Комплектов</span>
                <input
                  type="number"
                  min="1"
                  value={setsCount}
                  onChange={(e) => setSetsCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
              </label>
              <label className="cv-catalog-field cv-catalog-field--grow">
                <span>Материал (для всех, если не указан в детали)</span>
                <input
                  list={datalistId}
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  placeholder="сонома / бардолино"
                />
              </label>
            </div>
            <datalist id={datalistId}>
              {existingMaterials.map((m) => <option key={m} value={m} />)}
            </datalist>

            {selectedKit && previewCount > 0 && (
              <div className="cv-catalog-add__preview">
                Будет добавлено: <b>{previewCount}</b> дет. ({selectedKit.name} × {setsCount})
              </div>
            )}

            <div className="cv-catalog-dialog__actions">
              <button
                type="button"
                className="mini accent"
                disabled={!selectedKit}
                onClick={handleAddToCutting}
              >
                Добавить в раскрой
              </button>
              <button type="button" className="mini" onClick={onClose}>Отмена</button>
            </div>
          </div>
        ) : editingKit !== null ? (
          <KitEditor
            kit={editingKit}
            furnitureTemplates={furnitureTemplates}
            saving={saving}
            onSave={handleSaveKit}
            onDelete={handleDeleteKit}
            onCancel={() => setEditingKit(null)}
          />
        ) : (
          <div className="cv-catalog-manage">
            <button
              type="button"
              className="mini accent"
              onClick={() => setEditingKit({ id: 0, name: "", items: [] })}
            >
              + Новый комплект
            </button>
            <div className="cv-catalog-list cv-catalog-list--manage">
              {kits.map((kit) => (
                <div key={kit.id} className="cv-catalog-manage__row">
                  <div>
                    <div className="cv-catalog-list__name">{kit.name}</div>
                    <div className="cv-catalog-list__meta">
                      {(kit.items || []).length} дет. в комплекте
                    </div>
                  </div>
                  <div className="cv-catalog-manage__btns">
                    <button type="button" className="mini" onClick={() => setEditingKit(kit)}>Изменить</button>
                    <button type="button" className="mini" onClick={() => handleDeleteKit(kit.id)}>✕</button>
                  </div>
                </div>
              ))}
              {kits.length === 0 && (
                <div className="cv-catalog-list__empty">Нет сохранённых комплектов</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
