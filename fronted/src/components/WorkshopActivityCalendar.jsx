import { memo, useMemo, useState } from "react";
import {
  WORKSHOP_ACTIVITY_STAGES,
  WEEKDAY_LABELS,
  buildMonthCalendarCells,
  buildWorkshopActivityByDay,
  formatDayActivityTooltip,
  getCalendarMonthLabel,
  stageWorkedOnDay,
} from "../app/workshopActivityCalendar";

function todayMoscowParts() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  const year = get("year");
  const month = get("month") - 1;
  const day = get("day");
  return {
    year,
    month,
    day,
    dateKey: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

export const WorkshopActivityCalendar = memo(function WorkshopActivityCalendar({ orders = [] }) {
  const initial = todayMoscowParts();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [hoveredKey, setHoveredKey] = useState("");
  const todayKey = initial.dateKey;

  const activityByDay = useMemo(() => buildWorkshopActivityByDay(orders), [orders]);

  const cells = useMemo(
    () => buildMonthCalendarCells(year, month, activityByDay),
    [year, month, activityByDay],
  );

  const hoveredTooltip = useMemo(() => {
    if (!hoveredKey) return "";
    return formatDayActivityTooltip(hoveredKey, activityByDay.get(hoveredKey));
  }, [hoveredKey, activityByDay]);

  const shiftMonth = (delta) => {
    const dt = new Date(year, month + delta, 1);
    setYear(dt.getFullYear());
    setMonth(dt.getMonth());
    setHoveredKey("");
  };

  if (!Array.isArray(orders) || orders.length === 0) return null;

  return (
    <section className="workshop-activity-calendar">
      <div className="workshop-activity-calendar__head">
        <h3 className="workshop-activity-calendar__title">Календарь цеха</h3>
        <div className="workshop-activity-calendar__nav">
          <button type="button" className="workshop-activity-calendar__nav-btn" onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц">
            ‹
          </button>
          <span className="workshop-activity-calendar__month">{getCalendarMonthLabel(year, month)}</span>
          <button type="button" className="workshop-activity-calendar__nav-btn" onClick={() => shiftMonth(1)} aria-label="Следующий месяц">
            ›
          </button>
        </div>
      </div>

      <div className="workshop-activity-calendar__body">
        <div className="workshop-activity-calendar__weekdays">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="workshop-activity-calendar__weekday">
              {label}
            </span>
          ))}
        </div>

        <div className="workshop-activity-calendar__grid">
          {cells.map((cell, idx) => {
            if (cell.empty) {
              return <div key={`empty-${idx}`} className="workshop-activity-calendar__cell workshop-activity-calendar__cell--empty" />;
            }
            const isHovered = hoveredKey === cell.dateKey;
            const isToday = cell.dateKey === todayKey;
            return (
              <button
                key={cell.dateKey}
                type="button"
                title={formatDayActivityTooltip(cell.dateKey, cell.activity)}
                className={[
                  "workshop-activity-calendar__cell",
                  cell.worked ? "is-active" : "",
                  isToday ? "is-today" : "",
                  isHovered ? "is-hovered" : "",
                ].filter(Boolean).join(" ")}
                onMouseEnter={() => setHoveredKey(cell.dateKey)}
                onMouseLeave={() => setHoveredKey("")}
                onFocus={() => setHoveredKey(cell.dateKey)}
                onBlur={() => setHoveredKey("")}
              >
                <span className="workshop-activity-calendar__day">{cell.day}</span>
                <span className="workshop-activity-calendar__dots" aria-hidden="true">
                  {WORKSHOP_ACTIVITY_STAGES.map((stage) => (
                    <span
                      key={stage.id}
                      className={[
                        "workshop-activity-calendar__dot",
                        `workshop-activity-calendar__dot--${stage.id}`,
                        stageWorkedOnDay(cell.activity.stages[stage.id]) ? "is-on" : "",
                      ].filter(Boolean).join(" ")}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        <div className="workshop-activity-calendar__legend">
          {WORKSHOP_ACTIVITY_STAGES.map((stage) => (
            <span key={stage.id} className="workshop-activity-calendar__legend-item">
              <span className={`workshop-activity-calendar__dot workshop-activity-calendar__dot--${stage.id} is-on`} />
              {stage.label}
            </span>
          ))}
        </div>
      </div>

      {hoveredTooltip && (
        <div className="workshop-activity-calendar__tooltip" role="status">
          {hoveredTooltip.split("\n").map((line, i) => (
            <div key={`${hoveredKey}-${i}`}>{line}</div>
          ))}
        </div>
      )}
    </section>
  );
});

export default WorkshopActivityCalendar;
