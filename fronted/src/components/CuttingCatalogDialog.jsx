import { useCallback, useEffect, useMemo, useState } from "react";
import { OrderService } from "../services/orderService";
import { useAuth } from "../contexts/AuthContext";
import {
  expandCatalogKitToCuttingItems,
  countCatalogKitPieces,
  normalizeCatalogItem,
  furnitureTemplateToCatalogItems,
  catalogItemsToEditorRows,
  catalogKitSizesChanged,
} from "../app/cuttingCatalogHelpers";

const EMPTY_ITEM = { itemName: "", w: "", h: "", perUnit: 1, material: "", pairByTexture: false };

function parseApiError(e, fallback) {
  const raw = e?.message || fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.message || raw;
  } catch {
    return raw;
  }
}

function KitPartsTable({
  items,
  onChange,
  readOnly = false,
  showPerUnit = true,
  showMaterial = true,
  showTexturePair = true,
  compact = false,
}) {
  const updateItem = (idx, field, value) => {
    onChange(items.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, [field]: value };
      if (field === "perUnit" && Number(value) !== 2) next.pairByTexture = false;
      return next;
    }));
  };

  return (
    <div className={`cv-catalog-editor__table-wrap${compact ? " cv-catalog-editor__table-wrap--compact" : ""}`}>
      <table className="cv-catalog-editor__table">
        <thead>
          <tr>
            <th>Деталь</th>
            <th title="Размер для раскроя (мм)">Ш раскр.</th>
            <th title="Размер для раскроя (мм)">В раскр.</th>
            {showPerUnit ? <th>На компл.</th> : null}
            {showTexturePair ? (
              <th title="2 детали в комплекте — пилить рядом по текстуре">По текст.</th>
            ) : null}
            {showMaterial ? <th>Материал</th> : null}
            {!readOnly ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={idx}>
              <td>
                {readOnly ? (
                  <span className="cv-catalog-editor__readonly-name" title={it.itemName}>{it.itemName}</span>
                ) : (
                  <input
                    value={it.itemName}
                    onChange={(e) => updateItem(idx, "itemName", e.target.value)}
                    placeholder="Крышка (736×350)"
                  />
                )}
              </td>
                <td>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={it.w}
                    disabled={readOnly}
                    onChange={(e) => updateItem(idx, "w", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={it.h}
                    disabled={readOnly}
                    onChange={(e) => updateItem(idx, "h", e.target.value)}
                  />
                </td>
              {showPerUnit ? (
                <td>
                  <input
                    type="number"
                    min="1"
                    value={it.perUnit}
                    disabled={readOnly}
                    onChange={(e) => updateItem(idx, "perUnit", e.target.value)}
                  />
                </td>
              ) : null}
              {showTexturePair ? (
                <td className="cv-catalog-editor__check-cell">
                  <input
                    type="checkbox"
                    checked={!!it.pairByTexture}
                    disabled={readOnly || Number(it.perUnit) !== 2}
                    title={Number(it.perUnit) === 2
                      ? "Пилить 2 детали рядом по одной текстуре"
                      : "Доступно при «На компл.» = 2"}
                    onChange={(e) => updateItem(idx, "pairByTexture", e.target.checked)}
                  />
                </td>
              ) : null}
              {showMaterial ? (
                <td>
                  <input
                    value={it.material}
                    disabled={readOnly}
                    onChange={(e) => updateItem(idx, "material", e.target.value)}
                    placeholder="ЛДСП 16"
                  />
                </td>
              ) : null}
              {!readOnly ? (
                <td>
                  <button
                    type="button"
                    className="cv-catalog-editor__del"
                    onClick={() => onChange(items.filter((_, i) => i !== idx))}
                    title="Удалить строку"
                  >
                    ✕
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KitEditor({ kit, furnitureTemplates, onSave, onDelete, onCancel, saving }) {
  const [name, setName] = useState(kit?.name || "");
  const [items, setItems] = useState(catalogItemsToEditorRows(kit?.items));
  const [importProduct, setImportProduct] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setName(kit?.name || "");
    setItems(catalogItemsToEditorRows(kit?.items));
    setError("");
    setSuccess("");
  }, [kit]);

  const handleImportFurniture = () => {
    const tpl = furnitureTemplates.find((t) => t.product_name === importProduct);
    if (!tpl) return;
    const imported = furnitureTemplateToCatalogItems(tpl);
    if (!imported.length) {
      setError("Не удалось извлечь размеры из шаблона конструктора");
      return;
    }
    if (!name.trim()) setName(tpl.product_name);
    setItems(catalogItemsToEditorRows(imported));
    setSuccess("Состав загружен из конструктора — отредактируйте размеры для раскроя и сохраните");
    setError("");
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Укажите название комплекта");
      setSuccess("");
      return;
    }
    const normalized = items.map((it) => normalizeCatalogItem(it)).filter(Boolean);
    if (!normalized.length) {
      setError("Добавьте хотя бы одну деталь с размером (Ш×В)");
      setSuccess("");
      return;
    }
    setError("");
    try {
      const saved = await onSave({
        id: kit?.id || 0,
        name: trimmedName,
        items: normalized,
      }, { keepEditing: true });
      if (saved) {
        setItems(catalogItemsToEditorRows(saved.items));
        setSuccess("Размеры для раскроя сохранены в каталоге");
      }
    } catch {
      setSuccess("");
    }
  };

  return (
    <div className="cv-catalog-editor">
      <p className="cv-catalog-editor__hint">
        Размеры «Ш раскр.» и «В раскр.» сохраняются только в каталоге раскроя и не меняют конструктор мебели.
      </p>

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

      <KitPartsTable items={items} onChange={setItems} />

      <button
        type="button"
        className="mini"
        onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])}
      >
        + Деталь
      </button>

      {error ? <div className="cv-catalog-editor__error">{error}</div> : null}
      {success ? <div className="cv-catalog-editor__success">{success}</div> : null}

      <div className="cv-catalog-editor__actions">
        <button type="button" className="mini accent" disabled={saving} onClick={handleSave}>
          {saving ? "Сохранение…" : "Сохранить размеры для раскроя"}
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
  const [addRows, setAddRows] = useState([]);

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
      setError(parseApiError(e, "Не удалось загрузить каталог"));
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
    setAddRows([]);
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

  useEffect(() => {
    if (!selectedKit) {
      setAddRows([]);
      return;
    }
    setAddRows(catalogItemsToEditorRows(selectedKit.items));
  }, [selectedKit]);

  const previewCount = selectedKit ? countCatalogKitPieces(selectedKit, setsCount, addRows) : 0;
  const addSizesChanged = selectedKit ? catalogKitSizesChanged(selectedKit.items, addRows) : false;

  const handleAddToCutting = () => {
    if (!selectedKit) {
      setError("Выберите комплект из каталога");
      return;
    }
    const items = expandCatalogKitToCuttingItems(selectedKit, setsCount, material, addRows);
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

  const handleSaveKit = async (payload, { keepEditing = false } = {}) => {
    setSaving(true);
    setError("");
    try {
      const saved = await OrderService.upsertCuttingCatalogKit(payload);
      await load();
      if (keepEditing && saved) {
        setEditingKit(saved);
        if (saved.id) setSelectedId(saved.id);
        return saved;
      }
      setEditingKit(null);
      setTab("add");
      if (saved?.id) setSelectedId(saved.id);
      return saved;
    } catch (e) {
      setError(parseApiError(e, "Ошибка сохранения"));
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveKitFromEditor = (payload, options) => handleSaveKit(payload, options);

  const handleSaveAddTabSizes = async () => {
    if (!selectedKit || !canManageCatalog) return;
    const normalized = addRows.map((it) => normalizeCatalogItem(it)).filter(Boolean);
    if (!normalized.length) {
      setError("Укажите размеры деталей");
      return;
    }
    try {
      await handleSaveKit({
        id: selectedKit.id,
        name: selectedKit.name,
        items: normalized,
        sort_order: selectedKit.sort_order ?? 0,
      });
      setError("");
    } catch {
      // shown above
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
      setError(parseApiError(e, "Ошибка удаления"));
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

            {selectedKit && addRows.length > 0 && (
              <div className="cv-catalog-add__sizes">
                <div className="cv-catalog-add__sizes-head">
                  <span>Размеры для раскроя</span>
                  <span className="cv-catalog-add__sizes-note">можно изменить только для этого раскроя</span>
                </div>
                <KitPartsTable
                  items={addRows}
                  onChange={setAddRows}
                  showPerUnit={false}
                  showMaterial={false}
                  showTexturePair
                  compact
                />
                {canManageCatalog && addSizesChanged && (
                  <button
                    type="button"
                    className="mini"
                    disabled={saving}
                    onClick={handleSaveAddTabSizes}
                  >
                    {saving ? "Сохранение…" : "Сохранить размеры в каталоге"}
                  </button>
                )}
              </div>
            )}

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
            onSave={handleSaveKitFromEditor}
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
