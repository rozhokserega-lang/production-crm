const MSK_TZ = "Europe/Moscow";

export const WORKSHOP_ACTIVITY_STAGES = [
  {
    id: "pilka",
    label: "Пила",
    startKeys: ["pilka_started_at", "pilkaStartedAt"],
    doneKeys: ["pilka_done_at", "pilkaDoneAt"],
  },
  {
    id: "kromka",
    label: "Кромка",
    startKeys: ["kromka_started_at", "kromkaStartedAt"],
    doneKeys: ["kromka_done_at", "kromkaDoneAt"],
  },
  {
    id: "pras",
    label: "Присадка",
    startKeys: ["pras_started_at", "prasStartedAt"],
    doneKeys: ["pras_done_at", "prasDoneAt"],
  },
];

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function pickField(row, keys) {
  for (const key of keys) {
    const raw = row?.[key];
    if (raw) return String(raw).trim();
  }
  return "";
}

export function toMoscowDateKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString("en-CA", { timeZone: MSK_TZ });
}

export function emptyDayActivity() {
  const stages = {};
  for (const stage of WORKSHOP_ACTIVITY_STAGES) {
    stages[stage.id] = { starts: 0, dones: 0 };
  }
  return { stages, totalEvents: 0 };
}

export function mergeDayActivity(base, next) {
  const out = {
    stages: { ...base.stages },
    totalEvents: base.totalEvents,
  };
  for (const stage of WORKSHOP_ACTIVITY_STAGES) {
    out.stages[stage.id] = {
      starts: base.stages[stage.id].starts + next.stages[stage.id].starts,
      dones: base.stages[stage.id].dones + next.stages[stage.id].dones,
    };
  }
  out.totalEvents = Object.values(out.stages).reduce(
    (sum, s) => sum + s.starts + s.dones,
    0,
  );
  return out;
}

export function buildWorkshopActivityByDay(orders = []) {
  const map = new Map();

  const bump = (dateKey, stageId, kind) => {
    if (!dateKey) return;
    if (!map.has(dateKey)) map.set(dateKey, emptyDayActivity());
    const day = map.get(dateKey);
    day.stages[stageId][kind] += 1;
    day.totalEvents += 1;
  };

  for (const order of Array.isArray(orders) ? orders : []) {
    for (const stage of WORKSHOP_ACTIVITY_STAGES) {
      const startKey = toMoscowDateKey(pickField(order, stage.startKeys));
      const doneKey = toMoscowDateKey(pickField(order, stage.doneKeys));
      if (startKey) bump(startKey, stage.id, "starts");
      if (doneKey) bump(doneKey, stage.id, "dones");
    }
  }

  return map;
}

export function stageWorkedOnDay(stageActivity) {
  return (stageActivity?.starts || 0) + (stageActivity?.dones || 0) > 0;
}

export function formatDayActivityTooltip(dateKey, activity) {
  const [y, m, d] = String(dateKey || "").split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const weekday = dt.toLocaleDateString("ru-RU", { weekday: "long" });
  const dateLabel = dt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

  const lines = [`${dateLabel}, ${weekday}`];
  if (!activity || activity.totalEvents === 0) {
    lines.push("Нет отмеченной работы в CRM");
    for (const stage of WORKSHOP_ACTIVITY_STAGES) {
      lines.push(`${stage.label}: не работала`);
    }
    return lines.join("\n");
  }

  for (const stage of WORKSHOP_ACTIVITY_STAGES) {
    const s = activity.stages[stage.id];
    const worked = stageWorkedOnDay(s);
    if (!worked) {
      lines.push(`${stage.label}: не работала`);
      continue;
    }
    const parts = [];
    if (s.starts > 0) parts.push(`${s.starts} старт`);
    if (s.dones > 0) parts.push(`${s.dones} готово`);
    lines.push(`${stage.label}: работала (${parts.join(", ")})`);
  }
  return lines.join("\n");
}

function isoWeekdayMonFirst(date) {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

export function buildMonthCalendarCells(year, month, activityByDay) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const cells = [];

  for (let i = 0; i < isoWeekdayMonFirst(first); i += 1) {
    cells.push({ empty: true });
  }

  for (let day = 1; day <= last.getDate(); day += 1) {
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const activity = activityByDay.get(dateKey) || emptyDayActivity();
    cells.push({
      empty: false,
      dateKey,
      day,
      activity,
      worked: activity.totalEvents > 0,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ empty: true });
  }

  return cells;
}

export function getCalendarMonthLabel(year, month) {
  const dt = new Date(year, month, 1);
  const label = dt.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export { WEEKDAY_LABELS };
