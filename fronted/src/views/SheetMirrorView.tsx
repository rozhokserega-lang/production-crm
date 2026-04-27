interface SheetMirrorViewProps {
  filtered: Record<string, unknown>[];
  loading: boolean;
  formatDateTimeRu: (v: string) => string;
}

export function SheetMirrorView({ filtered, loading, formatDateTimeRu }: SheetMirrorViewProps) {
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
                <tr key={`mirror-${(r.sheet_row || r.sheetRow) as string}`}>
                  <td>{(r.sheet_row || r.sheetRow || "-") as string}</td>
                  <td>{(r.article_code || r.articleCode || "-") as string}</td>
                  <td>{(r.item_label || r.itemLabel || "-") as string}</td>
                  <td>{(r.material_raw || r.materialRaw || "-") as string}</td>
                  <td>{(r.plan_value ?? r.planValue ?? "-") as string}</td>
                  <td>{(r.qty_value ?? r.qtyValue ?? "-") as string}</td>
                  <td>{(r.pilka_status || r.pilkaStatus || "-") as string}</td>
                  <td>{(r.kromka_status || r.kromkaStatus || "-") as string}</td>
                  <td>{(r.prisadka_status || r.prisadkaStatus || "-") as string}</td>
                  <td>{(r.assembly_status || r.assemblyStatus || "-") as string}</td>
                  <td>{(r.overall_status || r.overallStatus || "-") as string}</td>
                  <td>{String(r.shipped_raw || r.shippedRaw || "-")}</td>
                  <td>{formatDateTimeRu(String(r.source_synced_at || r.sourceSyncedAt || ""))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
