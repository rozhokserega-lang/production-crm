import { useEffect, useMemo, useState } from "react";

function num(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function ShipmentSplitDialog({
  open,
  selection,
  weeks = [],
  loading = false,
  error = "",
  onClose,
  onConfirm,
  mode = "plan",
  keepStage = false,
}) {
  const totalQty = Number(selection?.qty || 0);
  const sourceWeek = String(selection?.week || "").trim();
  const orderId = String(selection?.orderId || "").trim();
  const isOrder = mode === "order";

  const [qtyKeep, setQtyKeep] = useState("");
  const [targetWeek, setTargetWeek] = useState("");

  const weekOptions = useMemo(() => {
    const list = (Array.isArray(weeks) ? weeks : [])
      .map((w) => String(w).trim())
      .filter(Boolean);
    return [...new Set(list)].filter((w) => w !== sourceWeek);
  }, [weeks, sourceWeek]);

  useEffect(() => {
    if (!open || totalQty <= 0) return;
    const keep = Math.floor(totalQty / 2);
    setQtyKeep(String(keep > 0 ? keep : 1));
    // По умолчанию — ближайшая неделя ПОСЛЕ текущей, а не первый пункт списка:
    // иначе остаток легко увести в давно прошедшую неделю.
    const sourceNum = Number(String(sourceWeek).replace(/\D/g, ""));
    const nextWeek = Number.isFinite(sourceNum) && sourceNum
      ? weekOptions.find((w) => Number(String(w).replace(/\D/g, "")) > sourceNum)
      : "";
    setTargetWeek(nextWeek || weekOptions[0] || "");
  }, [open, totalQty, weekOptions, sourceWeek]);

  const qtyMove = Math.max(0, totalQty - num(qtyKeep));
  const keepNum = num(qtyKeep);
  const valid =
    keepNum > 0 &&
    qtyMove > 0 &&
    keepNum + qtyMove === totalQty &&
    targetWeek &&
    targetWeek !== sourceWeek;

  if (!open || !selection) return null;

  return (
    <div className="dialog-backdrop" onClick={loading ? undefined : onClose}>
      <div className="dialog-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 8px" }}>{isOrder ? "Разделить заказ" : "Разделить позицию плана"}</h3>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
          <b>{selection.item}</b>
          <br />
          {isOrder && orderId ? (
            <>Заказ <b>{orderId}</b> · план <b>{sourceWeek}</b>, кол-во <b>{totalQty}</b> шт.</>
          ) : (
            <>Сейчас: план <b>{sourceWeek}</b>, кол-во <b>{totalQty}</b> шт.</>
          )}
        </div>

        {isOrder || keepStage ? (
          <div style={{ fontSize: 13, color: "#1e40af", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
            Отделённая часть останется <b>в работе на той же стадии</b>: в выбранной неделе
            создаётся отдельный заказ сразу за счёт этой позиции. Повторно запускать в работу
            и списывать листы не нужно.
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            {isOrder ? "Оставить в заказе (шт.)" : `Оставить в плане ${sourceWeek || "—"} (шт.)`}
            <input
              value={qtyKeep}
              inputMode="numeric"
              disabled={loading}
              onChange={(e) => setQtyKeep(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </label>

          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Перенести в план
            <select value={targetWeek} disabled={loading} onChange={(e) => setTargetWeek(e.target.value)}>
              <option value="">— выберите план —</option>
              {weekOptions.map((w) => (
                <option key={w} value={w}>
                  План {w}
                </option>
              ))}
            </select>
          </label>

          <div style={{ fontSize: 13, padding: "8px 10px", background: "#f8fafc", borderRadius: 8 }}>
            Итого: {isOrder ? <>заказ <b>{orderId || "—"}</b> → {keepNum || "…"} шт.</> : <><b>{sourceWeek || "—"}</b> → {keepNum || "…"} шт.</>} | <b>{targetWeek || "—"}</b> → {qtyMove} шт.
          </div>
        </div>

        {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

        <div className="actions" style={{ marginTop: 14 }}>
          <button className="mini ok" disabled={loading || !valid} onClick={() => onConfirm({
            qtyKeep: keepNum,
            targetWeek,
            qtyMove,
          })}
          >
            {loading ? "Делю…" : "Разделить"}
          </button>
          <button className="mini warn" disabled={loading} onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
