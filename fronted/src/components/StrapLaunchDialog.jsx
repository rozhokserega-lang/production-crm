export function StrapLaunchDialog({
  open,
  meta,
  qtyInput,
  setQtyInput,
  materialInput = "",
  setMaterialInput,
  productInput = "",
  setProductInput,
  productOptions = [],
  materialOptions = [],
  error,
  saving,
  onClose,
  onSubmit,
  onPrintPreview,
}) {
  if (!open || !meta) return null;

  const showColorSelect = materialOptions.length > 0;
  const showProductSelect = productOptions.length > 1;
  const singleProduct = productOptions.length === 1 ? productOptions[0] : "";

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card strap-launch-dialog" style={{ maxWidth: 420, width: "95vw" }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Добавить обвязку в план</h3>
        <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 13 }}>
          Тип: <strong>{meta.label || meta.strapType || "—"}</strong>
          {!showColorSelect && meta.color ? ` / ${meta.color}` : ""}
        </p>
        <p style={{ margin: "0 0 16px", color: "#475569", fontSize: 13 }}>
          План: <strong>обвязка</strong>. Позиция появится на вкладке «Отгрузка» в статусе <strong>«Ожидаю заказ»</strong>.
        </p>
        {singleProduct ? (
          <p style={{ margin: "0 0 16px", color: "#475569", fontSize: 13 }}>
            Изделие: <strong>{singleProduct}</strong>
          </p>
        ) : null}
        {showProductSelect ? (
          <label className="strap-launch-field">
            Изделие
            <select
              className="strap-qty-dialog-input"
              value={productInput}
              onChange={(e) => setProductInput(e.target.value)}
              autoFocus
            >
              <option value="">Выберите изделие</option>
              {productOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {showColorSelect ? (
          <label className="strap-launch-field">
            Цвет
            <select
              className="strap-qty-dialog-input"
              value={materialInput}
              onChange={(e) => setMaterialInput(e.target.value)}
              autoFocus
            >
              <option value="">Выберите цвет</option>
              {materialOptions.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="strap-launch-field">
          Сколько планок добавить
          <input
            type="number"
            min={1}
            className="strap-qty-dialog-input"
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            placeholder="Например: 600"
            autoFocus={!showColorSelect}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
              if (e.key === "Escape") onClose();
            }}
          />
        </label>
        {error ? <div className="strap-stock-error">{error}</div> : null}
        <div className="actions" style={{ marginTop: 16, justifyContent: "flex-end" }}>
          <button type="button" className="mini ghost" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          {typeof onPrintPreview === "function" ? (
            <button type="button" className="mini" onClick={onPrintPreview} disabled={saving}>
              Лист для печати
            </button>
          ) : null}
          <button type="button" className="mini ok" onClick={onSubmit} disabled={saving}>
            {saving ? "Добавляю..." : "Добавить в план"}
          </button>
        </div>
      </div>
    </div>
  );
}
