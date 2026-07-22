import { memo, useMemo } from "react";
import { strapDisplayNameForCode } from "../app/workshopStrapNeeds";

export const StrapDemandOrdersDialog = memo(function StrapDemandOrdersDialog({
  open,
  meta,
  orders = [],
  onClose,
}) {
  const rows = useMemo(() => (Array.isArray(orders) ? orders : []), [orders]);
  const totalNeeded = useMemo(
    () => rows.reduce((sum, row) => sum + (Number(row.needed) || 0), 0),
    [rows],
  );

  if (!open || !meta) return null;

  const label = meta.label || strapDisplayNameForCode(meta.strapType);

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="dialog-card strap-demand-dialog">
        <h3 className="strap-demand-dialog__title">Заказы на обвязку</h3>
        <div className="strap-demand-dialog__meta">
          <span><b>{label}</b></span>
          {meta.color ? <span>Цвет: {meta.color}</span> : null}
          <span>Требуется: <b>{meta.totalNeeded ?? totalNeeded}</b> шт.</span>
        </div>
        <p className="strap-demand-dialog__hint">
          Заказы в цеху (пила, кромка, присадка, до сборки). По каждому — сколько планок этого типа нужно.
        </p>

        {rows.length === 0 ? (
          <div className="empty strap-demand-dialog__empty">Нет заказов с потребностью по этой обвязке</div>
        ) : (
          <div className="strap-demand-dialog__table-wrap">
            <table className="strap-demand-dialog__table">
              <thead>
                <tr>
                  <th>ID заказа</th>
                  <th>Изделие</th>
                  <th>Кол-во</th>
                  <th>Этап</th>
                  <th className="strap-demand-dialog__col-qty">Планок</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={`${row.orderId || "row"}-${row.item || idx}-${idx}`}>
                    <td className="strap-demand-dialog__col-id">{row.orderId || "—"}</td>
                    <td className="strap-demand-dialog__col-item" title={row.item || ""}>
                      {row.item || "—"}
                    </td>
                    <td>{row.qty > 0 ? row.qty : "—"}</td>
                    <td>{row.stageLabel || "—"}</td>
                    <td className="strap-demand-dialog__col-qty"><b>{row.needed}</b></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}><b>Итого по заказам</b></td>
                  <td className="strap-demand-dialog__col-qty"><b>{totalNeeded}</b></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="actions strap-demand-dialog__actions">
          <button type="button" className="mini" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
});
