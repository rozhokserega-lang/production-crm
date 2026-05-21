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
}) {
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
            {Array.isArray(consumeDialogData?.consumeLines) && consumeDialogData.consumeLines.length > 1 ? (
              <>
                <div className="line2" style={{ marginBottom: 6 }}>
                  <span>Списать листы по декорам:</span>
                </div>
                {consumeDialogData.consumeLines.map((line) => (
                  <div key={line.material} className="line2" style={{ marginLeft: 8 }}>
                    <span>• {line.material}:</span>
                    <b>{line.qty} лист(ов)</b>
                  </div>
                ))}
                <div className="line2" style={{ marginTop: 6 }}>
                  <span>Итого листов:</span>
                  <b>{consumeQty || "—"}</b>
                </div>
              </>
            ) : (
              <>
                <div className="line2">
                  <span>Списать количество листов материала:</span>
                  <b>{consumeMaterial || "—"}</b>
                </div>
                <div className="line2">
                  <span>Количество:</span>
                  <b>{consumeQty || "—"}</b>
                </div>
              </>
            )}
            <div className="actions">
              <button className="mini ok" disabled={consumeSaving} onClick={() => onSubmit(consumeMaterial, consumeQty)}>
                {consumeSaving ? "Списываю..." : consumeDialogData?.consumeLines?.length > 1 ? "Списать все" : "Подтвердить"}
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
