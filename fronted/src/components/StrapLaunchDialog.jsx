export function StrapLaunchDialog({
  open,
  meta,
  qtyInput,
  setQtyInput,
  error,
  saving,
  onClose,
  onSubmit,
}) {
  if (!open || !meta) return null;

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card strap-launch-dialog" style={{ maxWidth: 420, width: "95vw" }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Запуск планок в работу</h3>
        <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 13 }}>
          Тип: <strong>{meta.label || meta.strapType || "—"}</strong>
          {meta.color ? ` / ${meta.color}` : ""}
        </p>
        <p style={{ margin: "0 0 16px", color: "#475569", fontSize: 13 }}>
          План: <strong>обвязка</strong> (без номера недели мебели)
        </p>
        <label className="strap-launch-field">
          Сколько планок запустить
          <input
            type="number"
            min={1}
            className="strap-qty-dialog-input"
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            placeholder="Например: 600"
            autoFocus
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
          <button type="button" className="mini ok" onClick={onSubmit} disabled={saving}>
            {saving ? "Запускаю..." : "Запустить в работу"}
          </button>
        </div>
      </div>
    </div>
  );
}
