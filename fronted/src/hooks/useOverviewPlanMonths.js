import { useCallback, useEffect, useState } from "react";
import {
  loadPlanMonths,
  normalizePlanWeek,
  savePlanMonths,
  sortPlanWeeks,
} from "../app/overviewPlansHelpers";

export function useOverviewPlanMonths() {
  const [months, setMonthsState] = useState(() => loadPlanMonths());

  useEffect(() => {
    savePlanMonths(months);
  }, [months]);

  const addMonth = useCallback((name, weeks) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return false;
    const normalizedWeeks = sortPlanWeeks(
      (weeks || []).map(normalizePlanWeek).filter(Boolean)
    );
    if (!normalizedWeeks.length) return false;
    setMonthsState((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: trimmed, weeks: normalizedWeeks },
    ]);
    return true;
  }, []);

  const updateMonth = useCallback((id, patch) => {
    setMonthsState((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const name = patch.name != null ? String(patch.name).trim() : m.name;
        const weeks = patch.weeks != null
          ? sortPlanWeeks(patch.weeks.map(normalizePlanWeek).filter(Boolean))
          : m.weeks;
        return { ...m, name: name || m.name, weeks };
      })
    );
  }, []);

  const deleteMonth = useCallback((id) => {
    setMonthsState((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return { months, addMonth, updateMonth, deleteMonth, setMonths: setMonthsState };
}
