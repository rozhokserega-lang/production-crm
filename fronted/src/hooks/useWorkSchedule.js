import { useCallback, useEffect, useState } from "react";

const WEEK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function useWorkSchedule({ canAdminSettings, view, callBackend, setError, toUserError }) {
  const [workScheduleLoading, setWorkScheduleLoading] = useState(false);
  const [workScheduleSaving, setWorkScheduleSaving] = useState(false);
  const [workSchedule, setWorkSchedule] = useState({
    hoursPerDay: 8,
    workingDays: ["mon", "tue", "wed", "thu", "fri"],
    weekendDays: ["sat", "sun"],
    workStart: "08:00",
    workEnd: "18:00",
    lunchStart: "12:00",
    lunchEnd: "13:00",
    updatedAt: "",
  });

  const normalizeWorkSchedule = useCallback((payload) => {
    const source =
      Array.isArray(payload) && payload.length > 0 && payload[0] && typeof payload[0] === "object"
        ? payload[0]
        : payload && typeof payload === "object"
          ? payload
          : {};
    const hoursRaw = Number(source.hours_per_day ?? source.hoursPerDay ?? 8);
    const hoursPerDay = Number.isFinite(hoursRaw) ? Math.min(24, Math.max(1, hoursRaw)) : 8;
    const workingDaysRaw = Array.isArray(source.working_days ?? source.workingDays)
      ? source.working_days ?? source.workingDays
      : ["mon", "tue", "wed", "thu", "fri"];
    const workingDays = [...new Set(workingDaysRaw.map((x) => String(x || "").trim().toLowerCase()))].filter((x) =>
      WEEK_DAYS.includes(x),
    );
    const fixedWorkingDays = workingDays.length > 0 ? workingDays : ["mon", "tue", "wed", "thu", "fri"];
    const weekendDays = WEEK_DAYS.filter((d) => !fixedWorkingDays.includes(d));
    const workStart = String(source.work_start || source.workStart || "08:00").trim() || "08:00";
    const workEnd = String(source.work_end || source.workEnd || "18:00").trim() || "18:00";
    const lunchStart = String(source.lunch_start || source.lunchStart || "12:00").trim() || "12:00";
    const lunchEnd = String(source.lunch_end || source.lunchEnd || "13:00").trim() || "13:00";
    return {
      hoursPerDay,
      workingDays: fixedWorkingDays,
      weekendDays,
      workStart,
      workEnd,
      lunchStart,
      lunchEnd,
      updatedAt: String(source.updated_at || source.updatedAt || "").trim(),
    };
  }, []);

  const loadWorkSchedule = useCallback(async () => {
    if (!canAdminSettings) return;
    setWorkScheduleLoading(true);
    try {
      const payload = await callBackend("webGetWorkSchedule");
      setWorkSchedule(normalizeWorkSchedule(payload));
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setWorkScheduleLoading(false);
    }
  }, [callBackend, canAdminSettings, normalizeWorkSchedule, setError, toUserError]);

  const saveWorkSchedule = useCallback(async () => {
    if (!canAdminSettings || workScheduleSaving) return;
    setWorkScheduleSaving(true);
    setError("");
    try {
      const payload = await callBackend("webSetWorkSchedule", {
        hoursPerDay: workSchedule.hoursPerDay,
        workingDays: workSchedule.workingDays,
        workStart: workSchedule.workStart,
        workEnd: workSchedule.workEnd,
        lunchStart: workSchedule.lunchStart,
        lunchEnd: workSchedule.lunchEnd,
      });
      setWorkSchedule(normalizeWorkSchedule(payload));
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setWorkScheduleSaving(false);
    }
  }, [
    callBackend,
    canAdminSettings,
    normalizeWorkSchedule,
    setError,
    toUserError,
    workSchedule,
    workScheduleSaving,
  ]);

  useEffect(() => {
    if (view !== "admin" || !canAdminSettings) return;
    loadWorkSchedule();
  }, [canAdminSettings, loadWorkSchedule, view]);

  return {
    workScheduleLoading,
    workScheduleSaving,
    workSchedule,
    setWorkSchedule,
    loadWorkSchedule,
    saveWorkSchedule,
  };
}
