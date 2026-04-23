function parseIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function parseTimeToMinutes(value, fallbackMinutes) {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallbackMinutes;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return fallbackMinutes;
  return Math.min(23 * 60 + 59, Math.max(0, hh * 60 + mm));
}

function dayKeyByDate(date) {
  const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return keys[date.getDay()] || "sun";
}

function overlapMs(startA, endA, startB, endB) {
  const start = Math.max(startA, startB);
  const end = Math.min(endA, endB);
  return Math.max(0, end - start);
}

export function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function calcWorkingMsBetween(startMs, endMs, schedule) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  const cfg = schedule || {};
  const workStartMin = parseTimeToMinutes(cfg.workStart, 8 * 60);
  const workEndMin = parseTimeToMinutes(cfg.workEnd, 18 * 60);
  if (workEndMin <= workStartMin) return 0;
  const lunchStartMin = parseTimeToMinutes(cfg.lunchStart, 12 * 60);
  const lunchEndMin = parseTimeToMinutes(cfg.lunchEnd, 13 * 60);
  const hasLunch = lunchEndMin > lunchStartMin;
  const workingDays =
    Array.isArray(cfg.workingDays) && cfg.workingDays.length > 0
      ? cfg.workingDays
      : ["mon", "tue", "wed", "thu", "fri"];

  const startDate = new Date(startMs);
  const endDate = new Date(endMs);
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  let totalMs = 0;

  while (cursor.getTime() <= endDay.getTime()) {
    const dayKey = dayKeyByDate(cursor);
    if (workingDays.includes(dayKey)) {
      const dayStart = cursor.getTime();
      const dayWorkStart = dayStart + workStartMin * 60000;
      const dayWorkEnd = dayStart + workEndMin * 60000;
      totalMs += overlapMs(startMs, endMs, dayWorkStart, dayWorkEnd);
      if (hasLunch) {
        const dayLunchStart = dayStart + lunchStartMin * 60000;
        const dayLunchEnd = dayStart + lunchEndMin * 60000;
        totalMs -= overlapMs(startMs, endMs, dayLunchStart, dayLunchEnd);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(0, totalMs);
}

function getRunState(nowMs, schedule) {
  const cfg = schedule || {};
  const workStartMin = parseTimeToMinutes(cfg.workStart, 8 * 60);
  const workEndMin = parseTimeToMinutes(cfg.workEnd, 18 * 60);
  const lunchStartMin = parseTimeToMinutes(cfg.lunchStart, 12 * 60);
  const lunchEndMin = parseTimeToMinutes(cfg.lunchEnd, 13 * 60);
  const workingDays =
    Array.isArray(cfg.workingDays) && cfg.workingDays.length > 0
      ? cfg.workingDays
      : ["mon", "tue", "wed", "thu", "fri"];
  const now = new Date(nowMs);
  const dayKey = dayKeyByDate(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const isWorkDay = workingDays.includes(dayKey);
  const inWorkWindow = currentMinutes >= workStartMin && currentMinutes < workEndMin;
  const inLunch = currentMinutes >= lunchStartMin && currentMinutes < lunchEndMin;
  return { isWorkDay, inWorkWindow, inLunch, scheduleAllowsRun: isWorkDay && inWorkWindow && !inLunch };
}

export function buildLiveStageClock(order, { nowMs = Date.now(), workSchedule, isInWork } = {}) {
  const isInWorkFn =
    typeof isInWork === "function"
      ? isInWork
      : (status) => /в\s*работе/i.test(String(status || ""));
  const stageDefs = [
    {
      key: "pilka",
      label: "Пила",
      status: String(order?.pilkaStatus ?? order?.pilka_status ?? order?.pilka ?? ""),
      startedAt: order?.pilka_started_at ?? order?.pilkaStartedAt,
      doneAt: order?.pilka_done_at ?? order?.pilkaDoneAt,
      pauseStartedAt: order?.pilka_pause_started_at ?? order?.pilkaPauseStartedAt,
      pauseAccMin: Number(order?.pilka_pause_acc_min ?? order?.pilkaPauseAccMin ?? 0),
    },
    {
      key: "kromka",
      label: "Кромка",
      status: String(order?.kromkaStatus ?? order?.kromka_status ?? order?.kromka ?? ""),
      startedAt: order?.kromka_started_at ?? order?.kromkaStartedAt,
      doneAt: order?.kromka_done_at ?? order?.kromkaDoneAt,
      pauseStartedAt: order?.kromka_pause_started_at ?? order?.kromkaPauseStartedAt,
      pauseAccMin: Number(order?.kromka_pause_acc_min ?? order?.kromkaPauseAccMin ?? 0),
    },
    {
      key: "pras",
      label: "Присадка",
      status: String(order?.prasStatus ?? order?.pras_status ?? order?.pras ?? ""),
      startedAt: order?.pras_started_at ?? order?.prasStartedAt,
      doneAt: order?.pras_done_at ?? order?.prasDoneAt,
      pauseStartedAt: order?.pras_pause_started_at ?? order?.prasPauseStartedAt,
      pauseAccMin: Number(order?.pras_pause_acc_min ?? order?.prasPauseAccMin ?? 0),
    },
    {
      key: "assembly",
      label: "Сборка",
      status: String(order?.assemblyStatus ?? order?.assembly_status ?? ""),
      startedAt: order?.assembly_started_at ?? order?.assemblyStartedAt,
      doneAt: order?.assembly_done_at ?? order?.assemblyDoneAt,
      pauseStartedAt: order?.assembly_pause_started_at ?? order?.assemblyPauseStartedAt,
      pauseAccMin: Number(order?.assembly_pause_acc_min ?? order?.assemblyPauseAccMin ?? 0),
    },
  ];
  const pipelineStageRaw = String(order?.pipelineStage ?? order?.pipeline_stage ?? "").trim();
  const pipelineStageKey =
    pipelineStageRaw === "pilka" || pipelineStageRaw === "kromka" || pipelineStageRaw === "pras" || pipelineStageRaw === "assembly"
      ? pipelineStageRaw
      : null;
  const byPipelineStage = pipelineStageKey ? stageDefs.find((x) => x.key === pipelineStageKey) : null;
  const activeStage =
    byPipelineStage ||
    stageDefs.find((x) => isInWorkFn(x.status)) ||
    stageDefs.find((x) => !!parseIsoDate(x.doneAt)) ||
    stageDefs.find((x) => !!parseIsoDate(x.startedAt));
  if (!activeStage) return null;

  const startedMs = parseIsoDate(activeStage.startedAt);
  if (!startedMs) {
    const waitingReason = isInWorkFn(activeStage.status) ? "Старт не зафиксирован" : "Этап еще не начат";
    return {
      key: activeStage.key,
      label: activeStage.label,
      effectiveSeconds: 0,
      durationText: formatDuration(0),
      isRunning: false,
      reason: waitingReason,
    };
  }
  const doneMs = parseIsoDate(activeStage.doneAt);
  const pauseStartedMs = parseIsoDate(activeStage.pauseStartedAt);
  const statusLower = String(activeStage.status || "").toLowerCase();
  const isPaused = statusLower.includes("пауза");
  const endMs = doneMs || nowMs;
  const totalWorkingMs = calcWorkingMsBetween(startedMs, endMs, workSchedule);
  const currentPauseMs =
    !doneMs && pauseStartedMs && pauseStartedMs < endMs ? calcWorkingMsBetween(pauseStartedMs, endMs, workSchedule) : 0;
  const storedPauseMs = Math.max(0, Number(activeStage.pauseAccMin || 0)) * 60000;
  const effectiveSeconds = Math.floor(Math.max(0, totalWorkingMs - storedPauseMs - currentPauseMs) / 1000);

  const run = getRunState(nowMs, workSchedule);
  const isRunning = !doneMs && isInWorkFn(activeStage.status) && !isPaused && run.scheduleAllowsRun;
  const reason = doneMs
    ? "Этап завершен"
    : isPaused
      ? "Пауза этапа"
      : !isInWorkFn(activeStage.status)
        ? "Этап не в работе"
        : !run.isWorkDay
          ? "Выходной по графику"
          : !run.inWorkWindow
            ? "Вне рабочего времени"
            : run.inLunch
              ? "Обед"
              : "Время идет";

  return {
    key: activeStage.key,
    label: activeStage.label,
    effectiveSeconds,
    durationText: formatDuration(effectiveSeconds),
    isRunning,
    reason,
  };
}
