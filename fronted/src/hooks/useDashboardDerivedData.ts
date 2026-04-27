import { useMemo } from "react";
import { PipelineStage, resolvePipelineStage } from "../orderPipeline";

const TERMINAL_PIPELINE_STAGES = new Set([
  PipelineStage.ASSEMBLED,
  PipelineStage.READY_TO_SHIP,
  PipelineStage.SHIPPED,
]);

interface KpiData {
  total: number;
  work: number;
  paused: number;
  done: number;
}

interface StatsGroup {
  key: string;
  count: number;
  qty: number;
  orders: Record<string, unknown>[];
}

interface OverviewColumn {
  id: string;
  title: string;
  items: Record<string, unknown>[];
}

interface ShipmentKpi {
  totalOrders: number;
  totalQty: number;
  readyAssembly: number;
  assembled: number;
}

interface UseDashboardDerivedDataParams {
  filtered: Record<string, unknown>[];
  view: string;
  tab: string;
  statsSort: string;
  isInWork: (status: unknown) => boolean;
  statusClass: (order: Record<string, unknown>) => string;
  getCurrentStage: (order: Record<string, unknown>) => string;
  getColorGroup: (item: string) => string;
  getWeekday: (order: Record<string, unknown>) => string;
  getStageLabel: (order: Record<string, unknown>) => string;
  getOverviewLaneId: (order: Record<string, unknown>) => string;
}

interface UseDashboardDerivedDataReturn {
  kpi: KpiData;
  statsGroups: StatsGroup[];
  statsList: Record<string, unknown>[];
  overviewColumns: OverviewColumn[];
  shipmentKpi: ShipmentKpi;
}

export function useDashboardDerivedData({
  filtered,
  view,
  tab,
  statsSort,
  isInWork,
  statusClass,
  getCurrentStage,
  getColorGroup,
  getWeekday,
  getStageLabel,
  getOverviewLaneId,
}: UseDashboardDerivedDataParams): UseDashboardDerivedDataReturn {
  const kpi = useMemo((): KpiData => {
    const total = filtered.length;
    const stageWork = (o: Record<string, unknown>): boolean => {
      if (view !== "workshop") return statusClass(o) === "work";
      if (tab === "pilka") return isInWork(o.pilkaStatus);
      if (tab === "kromka") return isInWork(o.kromkaStatus);
      if (tab === "pras") return isInWork(o.prasStatus);
      if (tab === "assembly") return isInWork(o.assemblyStatus);
      if (tab === "done") return false;
      return isInWork(o.pilkaStatus) || isInWork(o.kromkaStatus) || isInWork(o.prasStatus);
    };
    const onPause = (s: unknown): boolean => String(s || "").toLowerCase().includes("пауза");
    const stagePause = (o: Record<string, unknown>): boolean => {
      if (view !== "workshop") return statusClass(o) === "pause";
      if (tab === "pilka") return onPause(o.pilkaStatus);
      if (tab === "kromka") return onPause(o.kromkaStatus);
      if (tab === "pras") return onPause(o.prasStatus);
      if (tab === "assembly") return onPause(o.assemblyStatus);
      if (tab === "done") return false;
      return onPause(o.pilkaStatus) || onPause(o.kromkaStatus) || onPause(o.prasStatus);
    };
    const work = filtered.filter(stageWork).length;
    const paused = filtered.filter(stagePause).length;
    const done =
      view === "workshop"
        ? filtered.filter((x) => resolvePipelineStage(x) === PipelineStage.ASSEMBLED).length
        : filtered.filter((x) => TERMINAL_PIPELINE_STAGES.has(resolvePipelineStage(x))).length;
    return { total, work, paused, done };
  }, [filtered, view, tab, isInWork, statusClass]);

  const statsGroups = useMemo((): StatsGroup[] => {
    if (view !== "stats") return [];
    const map: Record<string, StatsGroup> = {};
    filtered.forEach((o) => {
      let key = "";
      if (statsSort === "stage") key = getCurrentStage(o);
      else if (statsSort === "readiness") {
        const cls = statusClass(o);
        key = cls === "done" ? "Готово" : cls === "work" ? "В работе" : cls === "pause" ? "Пауза" : "Ожидание";
      } else if (statsSort === "color") key = getColorGroup(String(o.item || ""));
      else key = getWeekday(o);
      if (!map[key]) map[key] = { key, count: 0, qty: 0, orders: [] };
      map[key].count += 1;
      map[key].qty += Number(o.qty || 0);
      map[key].orders.push(o);
    });
    return Object.values(map).sort((a, b) => String(a.key).localeCompare(String(b.key), "ru"));
  }, [filtered, view, statsSort, getCurrentStage, statusClass, getColorGroup, getWeekday]);

  const statsList = useMemo((): Record<string, unknown>[] => {
    if (view !== "stats") return [];
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (statsSort === "stage") {
        const sa = getStageLabel(a);
        const sb = getStageLabel(b);
        if (sa !== sb) return sa.localeCompare(sb, "ru");
      } else if (statsSort === "readiness") {
        const ra = statusClass(a);
        const rb = statusClass(b);
        if (ra !== rb) return ra.localeCompare(rb, "ru");
      } else if (statsSort === "color") {
        const ca = getColorGroup(String(a.item || ""));
        const cb = getColorGroup(String(b.item || ""));
        if (ca !== cb) return ca.localeCompare(cb, "ru");
      } else if (statsSort === "weekday") {
        const wa = getWeekday(a);
        const wb = getWeekday(b);
        if (wa !== wb) return wa.localeCompare(wb, "ru");
      }
      return String(a.item || "").localeCompare(String(b.item || ""), "ru");
    });
    return arr;
  }, [filtered, view, statsSort, getStageLabel, statusClass, getColorGroup, getWeekday]);

  const overviewColumns = useMemo((): OverviewColumn[] => {
    if (view !== "overview") return [];
    const defs = [
      { id: "pilka", title: "Пила" },
      { id: "kromka", title: "Кромка" },
      { id: "pras", title: "Присадка" },
      { id: "workshop_complete", title: "Сборка" },
      { id: "ready_to_ship", title: "Отправка" },
    ];
    const grouped: Record<string, Record<string, unknown>[]> = Object.fromEntries(defs.map((x) => [x.id, []]));
    (filtered || []).forEach((o) => {
      const laneRaw = getOverviewLaneId(o);
      const lane = laneRaw === "assembled" ? "ready_to_ship" : laneRaw;
      if (!grouped[lane]) grouped[lane] = [];
      grouped[lane].push(o);
    });
    defs.forEach((d) => {
      grouped[d.id].sort((a, b) => String(a.item || "").localeCompare(String(b.item || ""), "ru"));
    });
    return defs.map((d) => ({ ...d, items: grouped[d.id] || [] }));
  }, [filtered, view, getOverviewLaneId]);

  const shipmentKpi = useMemo((): ShipmentKpi => {
    if (view !== "shipment") return { totalOrders: 0, totalQty: 0, readyAssembly: 0, assembled: 0 };
    let totalOrders = 0;
    let totalQty = 0;
    let readyAssembly = 0;
    let assembled = 0;
    (filtered || []).forEach((s) => {
      const items = (s.items || []) as Record<string, unknown>[];
      items.forEach((it) => {
        const cells = (it.cells || []) as Record<string, unknown>[];
        cells.forEach((c) => {
          totalOrders += 1;
          totalQty += Number(c.qty) || 0;
          if (c.canSendToWork) readyAssembly += 1;
          if (c.inWork) assembled += 1;
        });
      });
    });
    return { totalOrders, totalQty, readyAssembly, assembled };
  }, [filtered, view]);

  return { kpi, statsGroups, statsList, overviewColumns, shipmentKpi };
}
