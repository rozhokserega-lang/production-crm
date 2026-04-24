import { OVERVIEW_POST_PRODUCTION_LANE_IDS, getOverviewLaneId } from "../orderPipeline";

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
  return (
    <section className="kpi-grid">
      {view === "shipment" ? (
        <>
          <div className="kpi"><span>Заказов</span><b>{shipmentKpi.totalOrders}</b></div>
          <div className="kpi"><span>Кол-во (шт)</span><b>{shipmentKpi.totalQty}</b></div>
          <div className="kpi"><span>К отправке в работу</span><b>{shipmentKpi.readyAssembly}</b></div>
          <div className="kpi"><span>Отправлено в цех</span><b>{shipmentKpi.assembled}</b></div>
        </>
      ) : view === "overview" && overviewSubView === "shipped" ? (
        <>
          <div className="kpi">
            <span>Отгружено заказов</span>
            <b>{overviewShippedOnly.length}</b>
          </div>
          <div className="kpi">
            <span>Суммарно шт</span>
            <b>{overviewShippedOnly.reduce((s, x) => s + (Number(x.qty) || 0), 0)}</b>
          </div>
        </>
      ) : view === "overview" ? (
        <>
          <div className="kpi"><span>Всего заказов</span><b>{filtered.length}</b></div>
          <div className="kpi">
            <span>В производстве</span>
            <b>
              {
                filtered.filter(
                  (x) => !OVERVIEW_POST_PRODUCTION_LANE_IDS.includes(getOverviewLaneId(x))
                ).length
              }
            </b>
          </div>
          <div className="kpi"><span>На паузе</span><b>{filtered.filter((x) => statusClass(x) === "pause").length}</b></div>
          <div className="kpi">
            <span>Отправка</span>
            <b>{filtered.filter((x) => getOverviewLaneId(x) === "ready_to_ship").length}</b>
          </div>
          <div className="kpi">
            <span>Отгружено</span>
            <b>{filtered.filter((x) => getOverviewLaneId(x) === "shipped").length}</b>
          </div>
        </>
      ) : view === "labor" ? (
        <>
          <div className="kpi"><span>Заказов</span><b>{laborKpi.totalOrders}</b></div>
          <div className="kpi"><span>Общее время (мин)</span><b>{Math.round(laborKpi.totalMinutes)}</b></div>
          <div className="kpi"><span>Всего изделий</span><b>{Math.round(laborKpi.totalQty)}</b></div>
          <div className="kpi"><span>Среднее / заказ (мин)</span><b>{Math.round(laborKpi.avgPerOrder)}</b></div>
        </>
      ) : view === "workshop" ? (
        <>
          <div className="kpi"><span>Всего</span><b>{kpi.total}</b></div>
          <div className="kpi"><span>В работе</span><b>{kpi.work}</b></div>
          <div className="kpi"><span>На паузе</span><b>{kpi.paused}</b></div>
          <div className="kpi"><span>Собрано</span><b>{kpi.done}</b></div>
        </>
      ) : (
        <>
          <div className="kpi"><span>Всего</span><b>{kpi.total}</b></div>
          <div className="kpi"><span>В работе</span><b>{kpi.work}</b></div>
          <div className="kpi"><span>На паузе</span><b>{kpi.paused}</b></div>
          <div className="kpi">
            <span>Собрано и отгрузка</span>
            <b>{kpi.done}</b>
          </div>
        </>
      )}
    </section>
  );
}
