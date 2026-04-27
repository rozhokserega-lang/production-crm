interface StrapDialogProps {
  isOpen: boolean;
  strapTargetProduct: string;
  strapProductNames: string[];
  strapPlanWeek: string;
  strapOptionsForSelectedProduct: string[];
  strapDraft: Record<string, string>;
  isSaving: boolean;
  onTargetProductChange: (value: string) => void;
  onPlanWeekChange: (value: string) => void;
  onDraftValueChange: (name: string, value: string) => void;
  onSave: () => void;
  onClose: () => void;
  onClear: () => void;
}

export function StrapDialog({
  isOpen,
  strapTargetProduct,
  strapProductNames,
  strapPlanWeek,
  strapOptionsForSelectedProduct,
  strapDraft,
  isSaving,
  onTargetProductChange,
  onPlanWeekChange,
  onDraftValueChange,
  onSave,
  onClose,
  onClear,
}: StrapDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card strap-dialog-card">
        <h3 style={{ marginTop: 0 }}>Конструктор планок (обвязка)</h3>
        <div className="line2" style={{ marginBottom: 10 }}>
          Укажите количество для нужных позиций. Пусто или 0 — не добавлять.
        </div>
        <div className="strap-row strap-row--product" style={{ marginBottom: 10 }}>
          <label>Изделие</label>
          <select value={strapTargetProduct} onChange={(e) => onTargetProductChange(e.target.value)}>
            {strapProductNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="strap-row" style={{ marginBottom: 10 }}>
          <label>Неделя плана</label>
          <input value={strapPlanWeek} onChange={(e) => onPlanWeekChange(e.target.value)} placeholder="Например: 71" />
        </div>
        <div className="strap-grid">
          {strapOptionsForSelectedProduct.map((name) => (
            <div key={name} className="strap-row">
              <label>{name}</label>
              <input
                inputMode="numeric"
                value={strapDraft[name] ?? ""}
                onChange={(e) => onDraftValueChange(name, e.target.value)}
                placeholder="0"
              />
            </div>
          ))}
        </div>
        <div className="actions" style={{ marginTop: 10 }}>
          <button className="mini ok" disabled={isSaving} onClick={onSave}>
            {isSaving ? "Сохраняю..." : "Готово"}
          </button>
          <button className="mini" disabled={isSaving} onClick={onClose}>
            Отмена
          </button>
          <button className="mini warn" disabled={isSaving} onClick={onClear}>
            Очистить
          </button>
        </div>
      </div>
    </div>
  );
}
