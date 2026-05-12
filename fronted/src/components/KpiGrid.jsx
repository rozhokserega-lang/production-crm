import { useMemo } from "react";

export function KpiCard({ label, value, delta, deltaDir }) {
  return (
    <div className="kpi">
      <div className="kpi__top">
        <span className="kpi__label">{label}</span>
        <b className="kpi__value">{value}</b>
      </div>
      <div
        className={
          "kpi__delta" +
          (delta == null ? " kpi__delta--empty" : "") +
          (deltaDir === "up" ? " kpi__delta--up" : "") +
          (deltaDir === "down" ? " kpi__delta--down" : "")
        }
      >
        {delta != null ? delta : null}
      </div>
    </div>
  );
}

/** KPI только для вкладки «Статистика» (данные из statsList). */
export function StatsKpiGrid({ statsList }) {
  const { totalOrders, totalQty, avgPerOrder, plansCount } = useMemo(() => {
    const list = statsList || [];
    const n = list.length;
    const qty = list.reduce((s, o) => s + (Number(o.qty) || 0), 0);
    const weeks = new Set();
    list.forEach((o) => {
      const w = String(o.week || "").trim();
      if (w) weeks.add(w);
    });
    return {
      totalOrders: n,
      totalQty: qty,
      avgPerOrder: n > 0 ? Math.round(qty / n) : 0,
      plansCount: weeks.size,
    };
  }, [statsList]);

  if (!statsList || statsList.length === 0) return null;

  return (
    <section className="kpi-grid kpi-grid--stats" aria-label="Сводка по статистике">
      <KpiCard label="Заказов" value={totalOrders} />
      <KpiCard label="Кол-во (шт)" value={totalQty} />
      <KpiCard label="Планов (недель)" value={plansCount} />
      <KpiCard label="Среднее на заказ" value={avgPerOrder} delta="шт" />
    </section>
  );
}
