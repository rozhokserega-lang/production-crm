import { useCallback, useEffect, useState } from "react";
import {
  clearPlanMonthsLocalStorage,
  loadPlanMonthsFromLocalStorage,
  normalizePlanMonthRow,
  normalizePlanWeek,
  sortPlanWeeks,
} from "../app/overviewPlansHelpers";
import { toUserError } from "../app/errorCatalogHelpers";
import { OrderService } from "../services/orderService";

function readSavedRow(result) {
  const row = Array.isArray(result) ? result[0] : result;
  return row ? normalizePlanMonthRow(row) : null;
}

export function useOverviewPlanMonths() {
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const loadMonths = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let rows = await OrderService.getOverviewPlanMonths();
      let normalized = (Array.isArray(rows) ? rows : [])
        .map(normalizePlanMonthRow)
        .filter((m) => m.name);

      const legacy = loadPlanMonthsFromLocalStorage();
      if (!normalized.length && legacy.length) {
        for (const month of legacy) {
          await OrderService.upsertOverviewPlanMonth({
            name: month.name,
            weeks: month.weeks,
          });
        }
        clearPlanMonthsLocalStorage();
        rows = await OrderService.getOverviewPlanMonths();
        normalized = (Array.isArray(rows) ? rows : [])
          .map(normalizePlanMonthRow)
          .filter((m) => m.name);
      }

      setMonths(normalized);
    } catch (e) {
      setError(toUserError(e));
      setMonths(loadPlanMonthsFromLocalStorage());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMonths();
  }, [loadMonths]);

  const addMonth = useCallback(async (name, weeks) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return false;
    const normalizedWeeks = sortPlanWeeks(
      (weeks || []).map(normalizePlanWeek).filter(Boolean)
    );
    if (!normalizedWeeks.length) return false;

    setSaving(true);
    setError(null);
    try {
      const saved = readSavedRow(
        await OrderService.upsertOverviewPlanMonth({
          name: trimmed,
          weeks: normalizedWeeks,
        })
      );
      if (saved) {
        setMonths((prev) => [...prev, saved]);
      } else {
        await loadMonths();
      }
      return true;
    } catch (e) {
      setError(toUserError(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, [loadMonths]);

  const updateMonth = useCallback(async (id, patch) => {
    const current = months.find((m) => String(m.id) === String(id));
    if (!current) return false;

    const name = patch.name != null ? String(patch.name).trim() : current.name;
    const weeks = patch.weeks != null
      ? sortPlanWeeks(patch.weeks.map(normalizePlanWeek).filter(Boolean))
      : current.weeks;
    if (!name || !weeks.length) return false;

    setSaving(true);
    setError(null);
    try {
      const saved = readSavedRow(
        await OrderService.upsertOverviewPlanMonth({
          id: current.id,
          name,
          weeks,
        })
      );
      if (saved) {
        setMonths((prev) => prev.map((m) => (String(m.id) === String(id) ? saved : m)));
      } else {
        await loadMonths();
      }
      return true;
    } catch (e) {
      setError(toUserError(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, [loadMonths, months]);

  const deleteMonth = useCallback(async (id) => {
    setSaving(true);
    setError(null);
    try {
      await OrderService.deleteOverviewPlanMonth({ id });
      setMonths((prev) => prev.filter((m) => String(m.id) !== String(id)));
      return true;
    } catch (e) {
      setError(toUserError(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const setMonthHidden = useCallback(async (id, hidden) => {
    setSaving(true);
    setError(null);
    try {
      const saved = readSavedRow(
        await OrderService.setOverviewPlanMonthHidden({
          id,
          hidden: Boolean(hidden),
        }),
      );
      if (saved) {
        setMonths((prev) => prev.map((m) => (String(m.id) === String(id) ? saved : m)));
      } else {
        await loadMonths();
      }
      return true;
    } catch (e) {
      setError(toUserError(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, [loadMonths]);

  return {
    months,
    loading,
    saving,
    error,
    addMonth,
    updateMonth,
    deleteMonth,
    setMonthHidden,
    reloadMonths: loadMonths,
  };
}
