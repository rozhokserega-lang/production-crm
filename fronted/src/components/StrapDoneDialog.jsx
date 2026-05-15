export function StrapDoneDialog({
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
      <div className="dialog-card" style={{ maxWidth: 420, width: "95vw" }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>
          {meta.mode === "pause" ? "Пауза — обвязка" : "Присадка завершена — обвязка"}
        </h3>
        <p style={{ margin: "0 0 4px", color: "#475569" }}>
          Тип: <strong>{meta.item || "—"}</strong>
          {meta.material ? ` / ${meta.material}` : ""}
        </p>
        <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 13 }}>
          {meta.mode === "pause"
            ? "Сколько планок уже присажено? Они уйдут на склад, а количество заказа уменьшится на это число."
            : "Укажите количество планок обвязки, которые были присажены. Они будут зачислены на склад."}
        </p>
        <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
          Количество планок:
          <input
            type="number"
            min={1}
            className="strap-qty-dialog-input"
            style={{ display: "block", width: "100%", marginTop: 6, padding: "6px 10px", fontSize: 16, borderRadius: 6, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSubmit(String(meta.item || ""), String(meta.material || ""), qtyInput);
              }
              if (e.key === "Escape") onClose();
            }}
            autoFocus
          />
        </label>
        {error && (
          <div style={{ color: "#ef4444", marginBottom: 10, fontSize: 13 }}>{error}</div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button
            type="button"
            className="mini ghost"
            onClick={onClose}
            disabled={saving}
          >
            Пропустить
          </button>
          <button
            type="button"
            className="mini ok"
            disabled={saving || !qtyInput}
            onClick={() => onSubmit(String(meta.item || ""), String(meta.material || ""), qtyInput)}
          >
            {saving ? "Сохраняю..." : "Зачислить на склад"}
          </button>
        </div>
      </div>
    </div>
  );
}
