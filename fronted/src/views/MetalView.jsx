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
  const [commentByArticle, setCommentByArticle] = useState({});

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.available += Number(row.qty_available || 0);
        acc.reserved += Number(row.qty_reserved || 0);
        return acc;
      },
      { available: 0, reserved: 0 },
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
          </div>
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Артикул металла</th>
                <th>Название</th>
                <th>В наличии</th>
                <th>Резерв</th>
                <th>Изменение</th>
                <th>Комментарий</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const article = String(r.metal_article || "");
                const value = deltaByArticle[article] ?? "";
                const comment = commentByArticle[article] ?? "";
                const busy = savingKey === article;
                return (
                  <tr key={article}>
                    <td>{article || "-"}</td>
                    <td>{r.metal_name || "-"}</td>
                    <td><b>{Number(r.qty_available || 0)}</b></td>
                    <td>{Number(r.qty_reserved || 0)}</td>
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
                    <td style={{ minWidth: 220 }}>
                      <input
                        value={comment}
                        onChange={(e) =>
                          setCommentByArticle((prev) => ({
                            ...prev,
                            [article]: e.target.value,
                          }))
                        }
                        placeholder="Комментарий"
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
                          await onAdjustStock(article, delta, comment);
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
