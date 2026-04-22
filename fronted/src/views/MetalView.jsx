import { useMemo, useState } from "react";

function num(value) {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function MetalView({
  metalSubView,
  rows,
  loading,
  canOperateProduction,
  savingKey,
  onAdjustStock,
  queueRows,
  queueLoading,
  queueUpdatingId,
  onQueueStatusChange,
}) {
  const [deltaByArticle, setDeltaByArticle] = useState({});

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const avail = Number(row.qty_available || 0);
        const requiredRaw = row.qty_required;
        const required = Number(
          requiredRaw !== undefined && requiredRaw !== null && requiredRaw !== ""
            ? requiredRaw
            : row.qty_reserved || 0,
        );
        const canCover = required > 0 && avail >= required;
        const deficit = required > 0 ? Math.max(0, required - avail) : 0;

        acc.available += avail;
        acc.reserved += canCover ? required : 0;
        acc.required += !canCover ? deficit : 0;
        return acc;
      },
      { available: 0, reserved: 0, required: 0 },
    );
  }, [rows]);

  if (metalSubView === "stock" && !loading && rows.length === 0) {
    return <div className="empty">Нет данных по металлическим компонентам</div>;
  }
  if (metalSubView === "queue" && !queueLoading && queueRows.length === 0) {
    return <div className="empty">Очередь металла пуста</div>;
  }

  return (
    <div className="sheet-table-wrap">
      {metalSubView === "stock" && (
        <>
          <div className="empty" style={{ marginBottom: 10 }}>
            Компонентов: <b>{rows.length}</b> | В наличии: <b>{totals.available}</b> | Резерв: <b>{totals.reserved}</b>
            {totals.required > 0 && (
              <>
                {" "}
                | Не хватает: <b style={{ color: "#be123c" }}>{totals.required}</b>
              </>
            )}
          </div>
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Артикул металла</th>
                <th>Название</th>
                <th style={{ textAlign: "center" }}>В наличии</th>
                <th style={{ textAlign: "center" }}>Резерв</th>
                <th style={{ textAlign: "center" }}>Требуется</th>
                <th>Изменение</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const article = String(r.metal_article || "");
                const value = deltaByArticle[article] ?? "";
                const busy = savingKey === article;
                const avail = Number(r.qty_available || 0);
                const requiredRaw = r.qty_required;
                const required = Number(
                  requiredRaw !== undefined && requiredRaw !== null && requiredRaw !== ""
                    ? requiredRaw
                    : r.qty_reserved || 0,
                );
                const hasOrder = required > 0;
                const canCover = hasOrder && avail >= required;
                const deficit = hasOrder ? Math.max(0, required - avail) : 0;
                const reserveDisplay = canCover ? required : 0;
                const requiredDisplay = !canCover && hasOrder ? deficit : 0;
                const rowStyle = requiredDisplay > 0 ? { background: "#fff5f5" } : canCover ? { background: "#f5fff5" } : {};
                return (
                  <tr key={article} style={rowStyle}>
                    <td>{article || "-"}</td>
                    <td>{r.metal_name || "-"}</td>
                    <td style={{ textAlign: "center" }}>
                      <b style={{ color: avail === 0 ? "#9ca3af" : undefined }}>{avail}</b>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {reserveDisplay > 0 ? (
                        <span style={{ background: "#e8f5e9", color: "#2e7d32", borderRadius: 5, padding: "1px 8px", fontWeight: 700, fontSize: 13 }}>
                          {reserveDisplay}
                        </span>
                      ) : (
                        <span style={{ color: "#d1d5db" }}>-</span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {requiredDisplay > 0 ? (
                        <span style={{ background: "#ffebee", color: "#be123c", borderRadius: 5, padding: "1px 8px", fontWeight: 700, fontSize: 13 }}>
                          -{requiredDisplay}
                        </span>
                      ) : (
                        <span style={{ color: "#d1d5db" }}>-</span>
                      )}
                    </td>
                    <td style={{ minWidth: 120 }}>
                      <input
                        value={value}
                        inputMode="decimal"
                        onChange={(e) =>
                          setDeltaByArticle((prev) => ({
                            ...prev,
                            [article]: e.target.value.replace(/[^0-9,.-]/g, ""),
                          }))
                        }
                        placeholder="+10 / -3"
                        disabled={!canOperateProduction || busy}
                      />
                    </td>
                    <td>
                      <button
                        className="mini ok"
                        disabled={!canOperateProduction || busy || !(Math.abs(num(value)) > 0)}
                        onClick={async () => {
                          const delta = num(value);
                          if (!(Math.abs(delta) > 0)) return;
                          await onAdjustStock(article, delta, "");
                          setDeltaByArticle((prev) => ({ ...prev, [article]: "" }));
                        }}
                      >
                        {busy ? "Сохраняю..." : "Применить"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      {metalSubView === "queue" && (
        <>
        {queueLoading && <div className="empty" style={{ marginTop: 8 }}>Загружаю очередь...</div>}
        {!queueLoading && (
        <table className="sheet-table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Статус</th>
              <th>Изделие</th>
              <th>Неделя</th>
              <th>Кол-во</th>
              <th>Нехватка</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {queueRows.map((q) => {
              const busy = queueUpdatingId === q.id;
              const shortageText = (Array.isArray(q.shortage) ? q.shortage : [])
                .map((x) => `${x.metalArticle || "-"}: -${x.deficitQty || 0}`)
                .join(", ");
              return (
                <tr key={`q-${q.id}`}>
                  <td>{q.status || "-"}</td>
                  <td>{q.item || "-"}</td>
                  <td>{q.week || "-"}</td>
                  <td>{q.qty || 0}</td>
                  <td>{shortageText || "-"}</td>
                  <td>
                    <button
                      className="mini"
                      disabled={!canOperateProduction || busy || q.status === "in_progress"}
                      onClick={() => onQueueStatusChange(q.id, "in_progress")}
                    >
                      В работу
                    </button>
                    <button
                      className="mini ok"
                      style={{ marginLeft: 6 }}
                      disabled={!canOperateProduction || busy || q.status === "done"}
                      onClick={() => onQueueStatusChange(q.id, "done")}
                    >
                      Готово
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
        </>
      )}
    </div>
  );
}
