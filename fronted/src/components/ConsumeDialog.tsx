interface ConsumeDialogData {
  orderId?: string;
  item?: string;
  materials?: string[];
}

interface ConsumeDialogProps {
  isOpen: boolean;
  consumeDialogData: ConsumeDialogData | null;
  consumeLoading: boolean;
  consumeEditMode: boolean;
  consumeMaterial: string;
  consumeQty: string;
  consumeSaving: boolean;
  consumeError: string;
  onSubmit: (material: string, qty: string) => void;
  onSetEditMode: (edit: boolean) => void;
  onClose: () => void;
  onMaterialChange: (value: string) => void;
  onQtyChange: (value: string) => void;
}

export function ConsumeDialog({
  isOpen,
  consumeDialogData,
  consumeLoading,
  consumeEditMode,
  consumeMaterial,
  consumeQty,
  consumeSaving,
  consumeError,
  onSubmit,
  onSetEditMode,
  onClose,
  onMaterialChange,
  onQtyChange,
}: ConsumeDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card">
        <h3 style={{ marginTop: 0 }}>Списание листов</h3>
        <div className="line2" style={{ marginBottom: 8 }}>
          <span>{consumeDialogData?.item || "Заказ"}</span>
          <span>ID: {consumeDialogData?.orderId || "-"}</span>
        </div>
        {consumeLoading && <div className="line2" style={{ marginBottom: 8 }}>Загружаю подсказки по материалу...</div>}
        {!consumeEditMode ? (
          <>
            <div className="line2">
              <span>Списать количество листов материала:</span>
              <b>{consumeMaterial || "—"}</b>
            </div>
            <div className="line2">
              <span>Количество:</span>
              <b>{consumeQty || "—"}</b>
            </div>
            <div className="actions">
              <button className="mini ok" disabled={consumeSaving} onClick={() => onSubmit(consumeMaterial, consumeQty)}>
                {consumeSaving ? "Списываю..." : "Подтвердить"}
              </button>
              <button className="mini" disabled={consumeSaving} onClick={() => onSetEditMode(true)}>
                Изменить
              </button>
              <button className="mini warn" disabled={consumeSaving} onClick={onClose}>
                Нет
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="actions" style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 8 }}>
              <input
                list="consumeMaterialsList"
                value={consumeMaterial}
                onChange={(e) => onMaterialChange(e.target.value)}
                placeholder="Материал"
              />
              <input
                value={consumeQty}
                onChange={(e) => onQtyChange(e.target.value)}
                placeholder="Листов"
              />
            </div>
            <datalist id="consumeMaterialsList">
              {(consumeDialogData?.materials || []).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <div className="actions">
              <button className="mini ok" disabled={consumeSaving} onClick={() => onSubmit(consumeMaterial, consumeQty)}>
                {consumeSaving ? "Списываю..." : "Сохранить и списать"}
              </button>
              <button className="mini" disabled={consumeSaving} onClick={() => onSetEditMode(false)}>
                Назад
              </button>
              <button className="mini warn" disabled={consumeSaving} onClick={onClose}>
                Нет
              </button>
            </div>
          </>
        )}
        {consumeError && <div className="error" style={{ marginTop: 8 }}>{consumeError}</div>}
      </div>
    </div>
  );
}
