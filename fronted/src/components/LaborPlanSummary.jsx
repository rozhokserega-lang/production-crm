import { memo, useEffect, useMemo, useState } from "react";
import {
  SHOP_KROMKA_POOL,
  SHOP_PRAS_POOL,
  buildRatesByGroup,
  calcTotalProductionPlan,
} from "../app/laborKitPlanner";
import {
  calcMonthlyPlanLoad,
  defaultMonthWorkingDays,
} from "../app/laborMonthlyPlanHelpers";

const MONTH_DAYS_STORAGE_KEY = "labor_planner_month_days_v1";

const LOAD_STATUS_LABELS = {
  ok: "Норма",
  warn: "Высокая",
  over: "Перегруз",
};

export const LaborPlanSummary = memo(function LaborPlanSummary({
  laborPlannerRows = [],
  laborPlannerQtyByGroup = {},
  savedKits = [],
  kitQtyByKey = {},
  workSchedule = null,
}) {
  const [monthWorkingDays, setMonthWorkingDays] = useState(() => defaultMonthWorkingDays(workSchedule));

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(MONTH_DAYS_STORAGE_KEY);
      const stored = Number(raw);
      if (Number.isFinite(stored) && stored > 0) {
        setMonthWorkingDays(stored);
        return;
      }
    } catch (_) {
      // ignore
    }
    setMonthWorkingDays(defaultMonthWorkingDays(workSchedule));
  }, [workSchedule]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(MONTH_DAYS_STORAGE_KEY, String(Math.max(1, Number(monthWorkingDays || 1))));
    } catch (_) {
      // ignore
    }
  }, [monthWorkingDays]);

  const ratesByGroup = useMemo(() => buildRatesByGroup(laborPlannerRows), [laborPlannerRows]);

  const plan = useMemo(() => {
    const groupPlans = laborPlannerRows
      .map((row) => ({
        group: row.group,
        qty: Number(String(laborPlannerQtyByGroup[row.group] ?? "").replace(",", ".")) || 0,
        pilkaPerQtyMin: row.pilkaPerQtyMin,
        kromkaPerQtyMin: row.kromkaPerQtyMin,
        prasPerQtyMin: row.prasPerQtyMin,
        assemblyPerQtyMin: row.assemblyPerQtyMin ?? 0,
        kromkaMachines: 1,
        prasMachines: 1,
      }))
      .filter((row) => row.qty > 0);

    const kitPlans = (Array.isArray(savedKits) ? savedKits : [])
      .map((kit) => ({
        name: kit.name,
        qty: Number(String(kitQtyByKey[kit.id] ?? "").replace(",", ".")) || 0,
        items: kit.items,
      }))
      .filter((row) => row.qty > 0 && row.items?.length);

    return calcTotalProductionPlan({ groupPlans, kitPlans, ratesByGroup });
  }, [laborPlannerRows, laborPlannerQtyByGroup, savedKits, kitQtyByKey, ratesByGroup]);

  const monthlyLoad = useMemo(
    () => calcMonthlyPlanLoad(plan, workSchedule, { workingDaysPerMonth: monthWorkingDays }),
    [plan, workSchedule, monthWorkingDays],
  );

  if (!plan.hasPlan) return null;

  return (
    <div className="labor-plan-summary">
      <section className="labor-plan-summary__card labor-plan-summary__card--month">
        <div className="labor-plan-summary__title">Загрузка месяца</div>
        <div className="labor-plan-summary__toolbar">
          <label className="labor-plan-summary__days">
            <span>Дней</span>
            <input
              type="number"
              min="1"
              step="1"
              value={monthWorkingDays}
              onChange={(e) => setMonthWorkingDays(Math.max(1, Number(e.target.value || 1)))}
            />
          </label>
          <span className="labor-plan-summary__fund">
            {monthlyLoad.formulaText} · ×1 / ×{SHOP_KROMKA_POOL} / ×{SHOP_PRAS_POOL}
          </span>
        </div>
        <div className="labor-plan-summary__stages">
          {monthlyLoad.stages.map((stage) => (
            <div
              key={stage.key}
              className={`labor-plan-summary__stage${stage.key === monthlyLoad.bottleneck?.key ? " is-bottleneck" : ""}`}
            >
              <div className="labor-plan-summary__stage-head">
                <span>
                  <b>{stage.label}</b>
                  {stage.key === monthlyLoad.bottleneck?.key ? <em>узкое</em> : null}
                </span>
                <b>{stage.loadPct}%</b>
              </div>
              <div className="labor-plan-summary__bar">
                <span
                  className={`labor-plan-summary__bar-fill labor-plan-summary__bar-fill--${stage.status}`}
                  style={{ width: `${Math.min(100, stage.loadPct)}%` }}
                />
              </div>
              <div className="labor-plan-summary__stage-meta">
                {stage.usedHhmm} / {stage.capacityHhmm}
                {stage.over > 0 ? <span className="over">+{stage.overHhmm}</span> : null}
              </div>
            </div>
          ))}
        </div>
        <div className="labor-plan-summary__result">
          <b>{LOAD_STATUS_LABELS[monthlyLoad.status] || monthlyLoad.status}</b>
          {monthlyLoad.bottleneck ? (
            <span> · {monthlyLoad.bottleneck.label} {monthlyLoad.maxLoadPct}%</span>
          ) : null}
        </div>
      </section>

      <section className="labor-plan-summary__card labor-plan-summary__card--queue">
        <div className="labor-plan-summary__title">Очередь 2+2</div>
        <div className="labor-plan-summary__queue-lines">
          <span>Кромка {plan.kromkaSeq}→{plan.kromkaParallel} мин</span>
          <span>Присадка {plan.prasSeq}→{plan.prasParallel} мин</span>
          <span><b>{plan.hhmmSeq}</b> seq · <b>{plan.hhmmParallel}</b> 2+2</span>
        </div>
      </section>
    </div>
  );
});
