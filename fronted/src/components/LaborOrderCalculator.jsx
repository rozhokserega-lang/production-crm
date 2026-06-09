import { memo, useMemo, useState } from "react";
import { LABOR_GROUP_ORDER } from "../app/laborGroupHelpers";
import { estimateLaborForLines } from "../app/laborNormCalculator";

function parseQty(value) {
  const n = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export const LaborOrderCalculator = memo(function LaborOrderCalculator({
  laborTableRows = [],
  laborNormsRows = [],
  laborOrdersRows = [],
}) {
  const [lines, setLines] = useState([{ id: "1", item: "", qty: "1" }]);

  const itemOptions = useMemo(() => {
    const set = new Set(LABOR_GROUP_ORDER);
    (laborTableRows || []).forEach((row) => {
      const item = String(row?.item || "").trim();
      if (item) set.add(item);
    });
    (laborOrdersRows || []).forEach((row) => {
      if (row?.group) set.add(row.group);
    });
    return [...set].sort((a, b) => {
      const aIsGroup = LABOR_GROUP_ORDER.includes(a);
      const bIsGroup = LABOR_GROUP_ORDER.includes(b);
      if (aIsGroup && !bIsGroup) return -1;
      if (!aIsGroup && bIsGroup) return 1;
      return String(a).localeCompare(String(b), "ru");
    });
  }, [laborOrdersRows, laborTableRows]);

  const estimate = useMemo(() => {
    const payload = lines
      .map((line) => ({
        item: String(line.item || "").trim(),
        qty: parseQty(line.qty),
      }))
      .filter((line) => line.item && line.qty > 0);
    return estimateLaborForLines(payload, laborOrdersRows);
  }, [lines, laborOrdersRows]);

  const updateLine = (id, patch) => {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const addLine = () => {
    setLines((prev) => [...prev, { id: String(Date.now()), item: "", qty: "1" }]);
  };

  const removeLine = (id) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.id !== id)));
  };

  return (
    <div className="labor-calculator">
      <p style={{ margin: "0 0 12px", color: "#6b7280", fontSize: 14 }}>
        Расчёт нормо-часов по этапам на основе нормативов (приоритет) или среднего факта.
      </p>

      <div className="sheet-table-wrap" style={{ marginBottom: 16 }}>
        <table className="sheet-table">
          <thead>
            <tr>
              <th>Изделие / группа</th>
              <th>Кол-во</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>
                  <input
                    list="labor-calculator-items"
                    value={line.item}
                    onChange={(e) => updateLine(line.id, { item: e.target.value })}
                    placeholder="Stabile. Дуб или Stabile"
                    style={{ width: "100%", maxWidth: 420 }}
                  />
                </td>
                <td>
                  <input
                    inputMode="numeric"
                    value={line.qty}
                    onChange={(e) => updateLine(line.id, { qty: e.target.value })}
                    style={{ width: 90 }}
                  />
                </td>
                <td>
                  <button type="button" className="mini warn" onClick={() => removeLine(line.id)}>
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="labor-calculator-items">
          {itemOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        <div style={{ marginTop: 10 }}>
          <button type="button" className="mini" onClick={addLine}>
            + Добавить позицию
          </button>
        </div>
      </div>

      {estimate.lines.length === 0 ? (
        <div className="empty">Укажите изделие и количество для расчёта</div>
      ) : (
        <>
          <div className="sheet-table-wrap" style={{ marginBottom: 16 }}>
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Позиция</th>
                  <th>Группа</th>
                  <th>Источник</th>
                  <th>Кол-во</th>
                  <th>Пила</th>
                  <th>Кромка</th>
                  <th>Присадка</th>
                  <th>Сборка</th>
                  <th>Итого</th>
                  <th>ч:мм</th>
                </tr>
              </thead>
              <tbody>
                {estimate.lines.map((row, idx) => (
                  <tr key={`${row.group}-${row.item}-${idx}`} className={row.missing ? "row-warn" : ""}>
                    <td>{row.item || row.group}</td>
                    <td>{row.group || "—"}</td>
                    <td>{row.sourceLabel}</td>
                    <td>{row.qty}</td>
                    <td>{row.missing ? "—" : Math.round(row.pilkaMin)}</td>
                    <td>{row.missing ? "—" : Math.round(row.kromkaMin)}</td>
                    <td>{row.missing ? "—" : Math.round(row.prasMin)}</td>
                    <td>{row.missing ? "—" : Math.round(row.assemblyMin)}</td>
                    <td><b>{row.missing ? "—" : Math.round(row.totalMin)}</b></td>
                    <td>{row.missing ? "—" : row.hhmm}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}><b>Итого по заказу</b></td>
                  <td><b>{Math.round(estimate.totals.pilkaMin)}</b></td>
                  <td><b>{Math.round(estimate.totals.kromkaMin)}</b></td>
                  <td><b>{Math.round(estimate.totals.prasMin)}</b></td>
                  <td><b>{Math.round(estimate.totals.assemblyMin)}</b></td>
                  <td><b>{Math.round(estimate.totals.totalMin)}</b></td>
                  <td><b>{estimate.totals.hhmm}</b></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {estimate.totals.missingCount > 0 ? (
            <div style={{ color: "#9a3412", fontSize: 13 }}>
              Для {estimate.totals.missingCount} позиций нет норматива и факта — задайте норматив во вкладке «Нормативы».
            </div>
          ) : null}
        </>
      )}
    </div>
  );
});
