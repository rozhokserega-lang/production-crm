import { memo, useEffect, useMemo, useState } from "react";
import {
  SHOP_KROMKA_POOL,
  SHOP_PRAS_POOL,
  LABOR_PARALLEL_MODE_LABEL,
  LABOR_PARALLEL_MODE_DETAIL,
  LABOR_SEQUENTIAL_MODE_LABEL,
  buildRatesByGroup,
  calcTotalProductionPlan,
  formatLaborDuration,
} from "../app/laborKitPlanner";
import {
  calcMonthlyPlanLoad,
  defaultMonthWorkingDays,
} from "../app/laborMonthlyPlanHelpers";

const CAPACITY_STORAGE_KEY = "labor_planner_capacity_v2";

const LOAD_STATUS_LABELS = {
  ok: "Норма",
  warn: "Высокая",
  over: "Перегруз",
};

function positiveInt(value, fallback = 1, max = 99) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(max, Math.max(1, n));
}

function positiveHours(value, fallback = 8) {
  const n = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(24, Math.max(1, Math.round(n * 2) / 2));
}

function defaultCapacitySettings(workSchedule) {
  const hours = Number(workSchedule?.hoursPerDay ?? workSchedule?.hours_per_day);
  return {
    monthWorkingDays: defaultMonthWorkingDays(workSchedule),
    hoursPerDay: Number.isFinite(hours) && hours > 0 ? hours : 8,
    pilkaStations: 1,
    kromkaStations: SHOP_KROMKA_POOL,
    prasStations: SHOP_PRAS_POOL,
  };
}

function readCapacitySettings(workSchedule) {
  const defaults = defaultCapacitySettings(workSchedule);
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(CAPACITY_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      monthWorkingDays: positiveInt(parsed?.monthWorkingDays, defaults.monthWorkingDays, 31),
      hoursPerDay: positiveHours(parsed?.hoursPerDay, defaults.hoursPerDay),
      pilkaStations: positiveInt(parsed?.pilkaStations, defaults.pilkaStations, 8),
      kromkaStations: positiveInt(parsed?.kromkaStations, defaults.kromkaStations, 8),
      prasStations: positiveInt(parsed?.prasStations, defaults.prasStations, 8),
    };
  } catch (_) {
    return defaults;
  }
}

export const LaborPlanSummary = memo(function LaborPlanSummary({
  laborPlannerRows = [],
  laborPlannerQtyByGroup = {},
  savedKits = [],
  kitQtyByKey = {},
  workSchedule = null,
}) {
  const [capacitySettings, setCapacitySettings] = useState(() => readCapacitySettings(workSchedule));

  useEffect(() => {
    setCapacitySettings((prev) => ({
      ...prev,
      monthWorkingDays: prev.monthWorkingDays || defaultMonthWorkingDays(workSchedule),
      hoursPerDay: prev.hoursPerDay || defaultCapacitySettings(workSchedule).hoursPerDay,
    }));
  }, [workSchedule]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(CAPACITY_STORAGE_KEY, JSON.stringify(capacitySettings));
    } catch (_) {
      // ignore
    }
  }, [capacitySettings]);

  const patchCapacity = (patch) => {
    setCapacitySettings((prev) => ({ ...prev, ...patch }));
  };

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
    () => calcMonthlyPlanLoad(plan, workSchedule, {
      workingDaysPerMonth: capacitySettings.monthWorkingDays,
      hoursPerDay: capacitySettings.hoursPerDay,
      pilkaStations: capacitySettings.pilkaStations,
      kromkaStations: capacitySettings.kromkaStations,
      prasStations: capacitySettings.prasStations,
    }),
    [plan, workSchedule, capacitySettings],
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
              max="31"
              step="1"
              value={capacitySettings.monthWorkingDays}
              onChange={(e) => patchCapacity({ monthWorkingDays: positiveInt(e.target.value, 1, 31) })}
            />
          </label>
          <label className="labor-plan-summary__days">
            <span>Часов/день</span>
            <input
              type="number"
              min="1"
              max="24"
              step="0.5"
              value={capacitySettings.hoursPerDay}
              onChange={(e) => patchCapacity({ hoursPerDay: positiveHours(e.target.value, 8) })}
            />
          </label>
          <label className="labor-plan-summary__days">
            <span>Пила ×</span>
            <input
              type="number"
              min="1"
              max="8"
              step="1"
              value={capacitySettings.pilkaStations}
              onChange={(e) => patchCapacity({ pilkaStations: positiveInt(e.target.value, 1, 8) })}
            />
          </label>
          <label className="labor-plan-summary__days">
            <span>Кромка ×</span>
            <input
              type="number"
              min="1"
              max="8"
              step="1"
              value={capacitySettings.kromkaStations}
              onChange={(e) => patchCapacity({ kromkaStations: positiveInt(e.target.value, 2, 8) })}
            />
          </label>
          <label className="labor-plan-summary__days">
            <span>Присадка ×</span>
            <input
              type="number"
              min="1"
              max="8"
              step="1"
              value={capacitySettings.prasStations}
              onChange={(e) => patchCapacity({ prasStations: positiveInt(e.target.value, 2, 8) })}
            />
          </label>
        </div>
        <div className="labor-plan-summary__fund">
          {monthlyLoad.formulaText}
          {" · "}
          ×{capacitySettings.pilkaStations} / ×{capacitySettings.kromkaStations} / ×{capacitySettings.prasStations}
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
        <div className="labor-plan-summary__title">
          {LABOR_PARALLEL_MODE_LABEL}
          <span className="labor-plan-summary__title-detail">{LABOR_PARALLEL_MODE_DETAIL}</span>
        </div>
        <div className="labor-plan-summary__queue-lines">
          <span>
            Кромка: {formatLaborDuration(plan.kromkaSeq)} {LABOR_SEQUENTIAL_MODE_LABEL.toLowerCase()}
            {" → "}
            {formatLaborDuration(plan.kromkaParallel)} {LABOR_PARALLEL_MODE_LABEL.toLowerCase()}
          </span>
          <span>
            Присадка: {formatLaborDuration(plan.prasSeq)} {LABOR_SEQUENTIAL_MODE_LABEL.toLowerCase()}
            {" → "}
            {formatLaborDuration(plan.prasParallel)} {LABOR_PARALLEL_MODE_LABEL.toLowerCase()}
          </span>
          <span>
            Итого: <b>{plan.hhmmSeq}</b> {LABOR_SEQUENTIAL_MODE_LABEL.toLowerCase()}
            {" · "}
            <b>{plan.hhmmParallel}</b> {LABOR_PARALLEL_MODE_LABEL.toLowerCase()}
          </span>
        </div>
      </section>
    </div>
  );
});
