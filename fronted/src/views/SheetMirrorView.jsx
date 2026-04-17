export function SheetMirrorView({
  filtered,
  loading,
  formatDateTimeRu,
}) {
  return (
    <>
      {!filtered.length && !loading && <div className="empty">Нет данных в Google Mirror</div>}
      {filtered.length > 0 && (
        <div className="sheet-table-wrap">
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Строка</th>
                <th>Артикул</th>
                <th>Изделие</th>
                <th>Материал</th>
                <th>План</th>
                <th>Кол-во</th>
                <th>Пила</th>
                <th>Кромка</th>
                <th>Присадка</th>
                <th>Сборка</th>
                <th>Общий</th>
                <th>Отправлен</th>
                <th>Синк</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={`mirror-${r.sheet_row || r.sheetRow}`}>
                  <td>{r.sheet_row || r.sheetRow || "-"}</td>
                  <td>{r.article_code || r.articleCode || "-"}</td>
                  <td>{r.item_label || r.itemLabel || "-"}</td>
                  <td>{r.material_raw || r.materialRaw || "-"}</td>
                  <td>{r.plan_value ?? r.planValue ?? "-"}</td>
                  <td>{r.qty_value ?? r.qtyValue ?? "-"}</td>
                  <td>{r.pilka_status || r.pilkaStatus || "-"}</td>
                  <td>{r.kromka_status || r.kromkaStatus || "-"}</td>
                  <td>{r.prisadka_status || r.prisadkaStatus || "-"}</td>
                  <td>{r.assembly_status || r.assemblyStatus || "-"}</td>
                  <td>{r.overall_status || r.overallStatus || "-"}</td>
                  <td>{String(r.shipped_raw || r.shippedRaw || "-")}</td>
                  <td>{formatDateTimeRu(r.source_synced_at || r.sourceSyncedAt || "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
