import { useState, useCallback, useEffect } from "react";
import { callBackend } from "../api";

interface WorkScheduleDay {
  start: string;
  end: string;
  breakStart: string;
  breakEnd: string;
}

interface WorkSchedule {
  [day: string]: WorkScheduleDay;
}

interface UseWorkScheduleParams {
  canAdminSettings: boolean;
  view: string;
  callBackend: typeof callBackend;
  setError: (msg: string) => void;
  toUserError: (e: unknown) => string;
}

interface UseWorkScheduleReturn {
  workSchedule: WorkSchedule;
  setWorkSchedule: (v: WorkSchedule) => void;
  saveWorkSchedule: () => Promise<void>;
}

function normalizeWorkSchedule(raw: unknown): WorkSchedule {
  const data = raw as Record<string, unknown> || {};
  const out: WorkSchedule = {};
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  days.forEach((day) => {
    const d = data[day] as Record<string, unknown> | undefined;
    if (d && typeof d === "object") {
      out[day] = {
        start: String(d.start || "09:00"),
        end: String(d.end || "18:00"),
        breakStart: String(d.break_start || d.breakStart || "13:00"),
        breakEnd: String(d.break_end || d.breakEnd || "14:00"),
      };
    } else {
      out[day] = { start: "09:00", end: "18:00", breakStart: "13:00", breakEnd: "14:00" };
    }
  });
  return out;
}

export function useWorkSchedule({
  canAdminSettings,
  view,
  callBackend: backendCall,
  setError,
  toUserError,
}: UseWorkScheduleParams): UseWorkScheduleReturn {
  const [workSchedule, setWorkSchedule] = useState<WorkSchedule>(() =>
    normalizeWorkSchedule({}),
  );

  useEffect(() => {
    if (!canAdminSettings) return;
    (async () => {
      try {
        const payload = await backendCall("webGetWorkSchedule");
        const data = (payload as Record<string, unknown>)?.data || payload;
        setWorkSchedule(normalizeWorkSchedule(data));
      } catch (e) {
        setError(toUserError(e));
      }
    })();
  }, [canAdminSettings, backendCall, setError, toUserError]);

  const saveWorkSchedule = useCallback(async () => {
    try {
      await backendCall("webSetWorkSchedule", { schedule: workSchedule });
    } catch (e) {
      setError(toUserError(e));
    }
  }, [backendCall, workSchedule, setError, toUserError]);

  return { workSchedule, setWorkSchedule, saveWorkSchedule };
}
