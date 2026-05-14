import { useEffect } from "react";
import { planCatalogRowSelectKey } from "../app/shipmentDialogHelpers";

function planCatalogOptionLabel(x) {
  const item = String(x?.itemName || "").trim();
  const mat = String(x?.material || "").trim();
  if (!mat) return item || "—";
  if (item.toLowerCase().includes(mat.toLowerCase())) return item;
  return `${item} — ${mat}`;
}

export function PlanDialog({
  isOpen,
  planSection,
  sectionOptions,
  planArticle,
  sectionArticles,
  selectedItemVariants,
  planMaterial,
  planWeek,
  planQty,
  planSaving,
  planPreviewing,
  onSectionChange,
  onArticleChange,
  onMaterialChange,
  onPlanWeekChange,
  onPlanQtyChange,
  onSave,
  onPreview,
  onClose,
  refreshPlanCatalogs,
}) {
  useEffect(() => {
    // Keep dropdown options in sync with DB changes (e.g. new sections/items created in FurnitureView).
    if (!isOpen) return;
    if (typeof refreshPlanCatalogs !== "function") return;
    void refreshPlanCatalogs();
  }, [isOpen, refreshPlanCatalogs]);

  if (!isOpen) return null;

  const variants = Array.isArray(selectedItemVariants) ? selectedItemVariants : [];
  const materialOptions = variants.map((v) => String(v.material || "").trim()).filter(Boolean);
  const canSelectMaterial = materialOptions.length > 1;

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card">
        <h3 style={{ marginTop: 0 }}>Добавить новый план</h3>
        <div className="line2" style={{ marginBottom: 10 }}>
          Создаёт или обновляет позицию плана в отгрузке по неделе и изделию.
        </div>
        <div className="strap-grid">
          <div className="strap-row" style={{ gridTemplateColumns: "120px 1fr" }}>
            <label>Секция</label>
            <select value={planSection} onChange={(e) => onSectionChange(e.target.value)}>
              {sectionOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="strap-row" style={{ gridTemplateColumns: "120px 1fr" }}>
            <label>Артикул</label>
            <select value={planArticle} onChange={(e) => onArticleChange(e.target.value)}>
              {sectionArticles.length === 0 ? (
                <option value="">Нет артикулов для секции</option>
              ) : (
                sectionArticles.map((x) => {
                  const v = planCatalogRowSelectKey(x);
                  return (
                    <option key={v} value={v}>
                      {planCatalogOptionLabel(x)}
                    </option>
                  );
                })
              )}
            </select>
          </div>
          <div className="strap-row" style={{ gridTemplateColumns: "120px 1fr" }}>
            <label>Материал</label>
            {canSelectMaterial ? (
              <select value={planMaterial} onChange={(e) => onMaterialChange?.(e.target.value)}>
                {materialOptions.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <input value={planMaterial} readOnly placeholder="Материал подставляется из артикула" />
            )}
          </div>
          <div className="strap-row" style={{ gridTemplateColumns: "120px 1fr" }}>
            <label>Неделя</label>
            <input value={planWeek} onChange={(e) => onPlanWeekChange(e.target.value)} placeholder="Например: 70" />
          </div>
          <div className="strap-row" style={{ gridTemplateColumns: "120px 1fr" }}>
            <label>Количество</label>
            <input inputMode="decimal" value={planQty} onChange={(e) => onPlanQtyChange(e.target.value)} placeholder="Например: 36" />
          </div>
        </div>
        <div className="actions" style={{ marginTop: 10 }}>
          <button className="mini ok" disabled={planSaving} onClick={onSave}>
            {planSaving ? "Сохраняю..." : "Сохранить план"}
          </button>
          <button className="mini" disabled={planSaving || planPreviewing} onClick={onPreview}>
            {planPreviewing ? "Открываю..." : "Предпросмотр плана"}
          </button>
          <button className="mini" disabled={planSaving} onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
