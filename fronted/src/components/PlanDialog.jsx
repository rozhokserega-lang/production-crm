export function PlanDialog({
  isOpen,
  planSection,
  sectionOptions,
  planArticle,
  sectionArticles,
  planMaterial,
  planWeek,
  planQty,
  planSaving,
  onSectionChange,
  onArticleChange,
  onPlanWeekChange,
  onPlanQtyChange,
  onSave,
  onClose,
}) {
  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card">
        <h3 style={{ marginTop: 0 }}>Добавить новый план</h3>
        <div className="line2" style={{ marginBottom: 10 }}>
          Создаёт или обновляет позицию плана в отгрузке по неделе и изделию.
        </div>
        <div className="strap-grid">
          <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
            <label>Секция</label>
            <select value={planSection} onChange={(e) => onSectionChange(e.target.value)}>
              {sectionOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
            <label>Артикул</label>
            <select value={planArticle} onChange={(e) => onArticleChange(e.target.value)}>
              {sectionArticles.length === 0 ? (
                <option value="">Нет артикулов для секции</option>
              ) : (
                sectionArticles.map((x) => (
                  <option key={`${x.article}::${x.itemName}`} value={x.itemName}>{x.itemName}</option>
                ))
              )}
            </select>
          </div>
          <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
            <label>Материал</label>
            <input value={planMaterial} readOnly placeholder="Материал подставляется из артикула" />
          </div>
          <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
            <label>Неделя</label>
            <input value={planWeek} onChange={(e) => onPlanWeekChange(e.target.value)} placeholder="Например: 70" />
          </div>
          <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
            <label>Количество</label>
            <input inputMode="decimal" value={planQty} onChange={(e) => onPlanQtyChange(e.target.value)} placeholder="Например: 36" />
          </div>
        </div>
        <div className="actions" style={{ marginTop: 10 }}>
          <button className="mini ok" disabled={planSaving} onClick={onSave}>
            {planSaving ? "Сохраняю..." : "Сохранить план"}
          </button>
          <button className="mini" disabled={planSaving} onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
