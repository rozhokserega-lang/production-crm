import { useCallback, useEffect, useMemo, useState } from "react";
import { OrderService } from "../services/orderService";
import { buildLaborOrdersRows } from "../app/laborNormCalculator";
import { computeWorkshopLoad } from "../app/workshopLoadCalculator";
import { extractErrorMessage } from "../app/errorCatalogHelpers";

const DEFAULT_SCHEDULE = {
  hoursPerDay: 8,
  workingDayCount: 5,
};

function normalizeWorkSchedule(raw) {
  const src = Array.isArray(raw) && raw[0] ? raw[0] : raw && typeof raw === "object" ? raw : {};
  const hoursPerDay = Math.max(0.1, Number(src.hours_per_day ?? src.hoursPerDay ?? 8) || 8);
  const days = Array.isArray(src.working_days ?? src.workingDays)
    ? (src.working_days ?? src.workingDays)
    : ["mon", "tue", "wed", "thu", "fri"];
  return {
    hoursPerDay,
    workingDayCount: Math.max(1, days.length || 5),
  };
}

/**
 * Загружает данные для экрана «Загрузка цеха»: очередь заказов (web_get_workshop_queue),
 * таблицу труда и нормы (для resolveLaborGroup + estimateLaborForItem), расписание работы.
 * Прогоняет всё через computeWorkshopLoad и отдаёт готовую сводку.
 *
 * @param {object} args
 * @param {string} args.view           — текущий экран (загрузка при labor + subView workshopLoad).
 * @param {string} args.laborSubView   — подвкладка «Трудоёмкость».
 * @param {function} [args.setError]   — колбэк для ошибок (как в других хуках).
 * @param {function} [args.toUserError]
 */
export function useWorkshopLoad({ view, laborSubView, setError, toUserError, executorsPerStage = {} }) {
  const [loading, setLoading] = useState(false);
  const [queueRows, setQueueRows] = useState([]);
  const [laborOrdersRows, setLaborOrdersRows] = useState([]);
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [loadedAt, setLoadedAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    if (typeof setError === "function") setError("");
    try {
      const [queue, laborTable, laborNorms, workSchedule] = await Promise.all([
        OrderService.getWorkshopQueue(),
        OrderService.getLaborTable().catch(() => []),
        OrderService.getLaborNorms().catch(() => []),
        OrderService.getWorkSchedule().catch(() => DEFAULT_SCHEDULE),
      ]);
      const rows = buildLaborOrdersRows(
        Array.isArray(laborTable) ? laborTable : [],
        Array.isArray(laborNorms) ? laborNorms : [],
      );
      setQueueRows(Array.isArray(queue) ? queue : []);
      setLaborOrdersRows(rows);
      setSchedule(normalizeWorkSchedule(workSchedule));
      setLoadedAt(new Date().toISOString());
    } catch (e) {
      const msg = typeof toUserError === "function" ? toUserError(e) : extractErrorMessage(e);
      if (typeof setError === "function") setError(msg);
    } finally {
      setLoading(false);
    }
  }, [setError, toUserError]);

  useEffect(() => {
    if (view !== "labor" || laborSubView !== "workshopLoad") return undefined;
    load();
    return undefined;
  }, [view, laborSubView, load]);

  const summary = useMemo(
    () => computeWorkshopLoad({
      queueRows,
      laborOrdersRows,
      hoursPerDay: schedule.hoursPerDay,
      workingDayCount: schedule.workingDayCount,
      executorsPerStage,
    }),
    [queueRows, laborOrdersRows, schedule.hoursPerDay, schedule.workingDayCount, executorsPerStage],
  );

  return {
    loading,
    load,
    loadedAt,
    schedule,
    summary,
  };
}
