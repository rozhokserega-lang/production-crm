import { OVERVIEW_POST_PRODUCTION_LANE_IDS, getOverviewLaneId } from "../orderPipeline";

function KpiCard({ label, value, delta, deltaDir }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <b>{value}</b>
      {delta != null && (
        <div className={`kpi__delta${deltaDir === "up" ? " kpi__delta--up" : deltaDir === "down" ? " kpi__delta--down" : ""}`}>
          {delta}
        </div>
      )}
    </div>
  );
}

export function KpiGrid({
  view,
  shipmentKpi,
  overviewSubView,
  overviewShippedOnly,
  filtered,
  statusClass,
  laborKpi,
  kpi,
}) {
  if (view === "shipment") {
    const readyPct = shipmentKpi.totalOrders > 0
      ? Math.round((shipmentKpi.readyAssembly / shipmentKpi.totalOrders) * 100) : 0;
    const inWorkPct = shipmentKpi.totalOrders > 0
      ? Math.round((shipmentKpi.assembled / shipmentKpi.totalOrders) * 100) : 0;
    return (
      <section className="kpi-grid">
        <KpiCard label="Заказов" value={shipmentKpi.totalOrders} />
        <KpiCard label="Кол-во (шт)" value={shipmentKpi.totalQty} />
        <KpiCard label="К отправке в работу" value={shipmentKpi.readyAssembly}
          delta={shipmentKpi.totalOrders > 0 ? `${readyPct}% от всех` : null}
          deltaDir={readyPct > 50 ? "up" : null} />
        <KpiCard label="Отправлено в цех" value={shipmentKpi.assembled}
          delta={shipmentKpi.totalOrders > 0 ? `${inWorkPct}% в работе` : null}
          deltaDir={inWorkPct > 0 ? "up" : null} />
      </section>
    );
  }

  if (view === "overview" && overviewSubView === "shipped") {
    const totalQty = overviewShippedOnly.reduce((s, x) => s + (Number(x.qty) || 0), 0);
    return (
      <section className="kpi-grid">
        <KpiCard label="Отгружено заказов" value={overviewShippedOnly.length} />
        <KpiCard label="Суммарно шт" value={totalQty}
          delta={overviewShippedOnly.length > 0 ? `~${Math.round(totalQty / overviewShippedOnly.length)} шт/заказ` : null} />
      </section>
    );
  }

  if (view === "overview") {
    const inProduction = filtered.filter(
      (x) => !OVERVIEW_POST_PRODUCTION_LANE_IDS.includes(getOverviewLaneId(x))
    ).length;
    const paused = filtered.filter((x) => statusClass(x) === "pause").length;
    const readyToShip = filtered.filter((x) => getOverviewLaneId(x) === "ready_to_ship").length;
    const shipped = filtered.filter((x) => getOverviewLaneId(x) === "shipped").length;
    const pausedPct = inProduction > 0 ? Math.round((paused / inProduction) * 100) : 0;
    return (
      <section className="kpi-grid">
        <KpiCard label="Всего заказов" value={filtered.length} />
        <KpiCard label="В производстве" value={inProduction}
          delta={filtered.length > 0 ? `${Math.round((inProduction / filtered.length) * 100)}% от всех` : null} />
        <KpiCard label="На паузе" value={paused}
          delta={paused > 0 ? `${pausedPct}% в цехе` : "всё в работе"}
          deltaDir={paused > 0 ? "down" : "up"} />
        <KpiCard label="Отправка" value={readyToShip} />
        <KpiCard label="Отгружено" value={shipped} />
      </section>
    );
  }

  if (view === "labor") {
    return (
      <section className="kpi-grid">
        <KpiCard label="Заказов" value={laborKpi.totalOrders} />
        <KpiCard label="Общее время" value={Math.round(laborKpi.totalMinutes)}
          delta={`~${Math.round(laborKpi.totalMinutes / 60)} ч`} />
        <KpiCard label="Всего изделий" value={Math.round(laborKpi.totalQty)} />
        <KpiCard label="Среднее / заказ" value={Math.round(laborKpi.avgPerOrder)} delta="мин/заказ" />
      </section>
    );
  }

  if (view === "workshop") {
    const donePct = kpi.total > 0 ? Math.round((kpi.done / kpi.total) * 100) : 0;
    return (
      <section className="kpi-grid">
        <KpiCard label="Всего" value={kpi.total} />
        <KpiCard label="В работе" value={kpi.work}
          delta={kpi.total > 0 ? `${Math.round((kpi.work / kpi.total) * 100)}% загрузка` : null}
          deltaDir={kpi.work > 0 ? "up" : null} />
        <KpiCard label="На паузе" value={kpi.paused}
          delta={kpi.paused > 0 ? "нужно внимания" : "всё ОК"}
          deltaDir={kpi.paused > 0 ? "down" : "up"} />
        <KpiCard label="Собрано" value={kpi.done}
          delta={kpi.total > 0 ? `${donePct}% готово` : null}
          deltaDir={donePct >= 50 ? "up" : null} />
      </section>
    );
  }

  const donePct = kpi.total > 0 ? Math.round((kpi.done / kpi.total) * 100) : 0;
  return (
    <section className="kpi-grid">
      <KpiCard label="Всего" value={kpi.total} />
      <KpiCard label="В работе" value={kpi.work}
        delta={kpi.total > 0 ? `${Math.round((kpi.work / kpi.total) * 100)}%` : null}
        deltaDir={kpi.work > 0 ? "up" : null} />
      <KpiCard label="На паузе" value={kpi.paused}
        delta={kpi.paused > 0 ? "нужно внимания" : "всё ОК"}
        deltaDir={kpi.paused > 0 ? "down" : "up"} />
      <KpiCard label="Собрано и отгрузка" value={kpi.done}
        delta={kpi.total > 0 ? `${donePct}% готово` : null}
        deltaDir={donePct >= 50 ? "up" : null} />
    </section>
  );
}
