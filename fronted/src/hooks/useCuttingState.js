import { useCallback, useEffect, useRef, useState } from "react";
import { OrderService } from "../services/orderService";

const DEFAULT_SETTINGS = {
  sheetW: 2800,
  sheetH: 2070,
  kerf: 4.8,
  marginX: 20,
  marginY: 20,
  allowRotate: false,
  accountEdgeBand: false,
  algorithm: "saw",
};

const EMPTY_JOB = {
  id: null,
  name: "Новый раскрой",
  settings: DEFAULT_SETTINGS,
  items: [],
};

export function useCuttingState() {
  const [jobs, setJobs] = useState([]);
  const [activeJob, setActiveJob] = useState({ ...EMPTY_JOB });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [cuttingResult, setCuttingResult] = useState(null);

  const saveTimerRef = useRef(null);

  // -------- load all jobs --------
  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await OrderService.getCuttingJobs();
      setJobs(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e?.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // -------- auto-save (debounce 1s) --------
  const scheduleSave = useCallback((job) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        const result = await OrderService.upsertCuttingJob({
          id: job.id,
          name: job.name,
          settings: job.settings,
          items: job.items,
        });
        const saved = Array.isArray(result) ? result[0] : result;
        if (saved?.id) {
          setActiveJob((prev) => ({ ...prev, id: saved.id }));
          setJobs((prev) => {
            const idx = prev.findIndex((j) => j.id === saved.id);
            const updated = { ...job, id: saved.id };
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = updated;
              return copy;
            }
            return [updated, ...prev];
          });
        }
      } catch (e) {
        setError(e?.message || "Ошибка сохранения");
      } finally {
        setSaving(false);
      }
    }, 1000);
  }, []);

  // -------- open job --------
  const openJob = useCallback((job) => {
    setActiveJob(job);
    setCuttingResult(null);
  }, []);

  // -------- create new blank job --------
  const createNewJob = useCallback(() => {
    setActiveJob({ ...EMPTY_JOB });
    setCuttingResult(null);
  }, []);

  // -------- update job name --------
  const setJobName = useCallback((name) => {
    setActiveJob((prev) => {
      const updated = { ...prev, name };
      scheduleSave(updated);
      return updated;
    });
  }, [scheduleSave]);

  // -------- update settings --------
  const updateSettings = useCallback((patch) => {
    setActiveJob((prev) => {
      const updated = { ...prev, settings: { ...prev.settings, ...patch } };
      scheduleSave(updated);
      return updated;
    });
    setCuttingResult(null);
  }, [scheduleSave]);

  // -------- add items (from shipment) --------
  const addItems = useCallback((newItems) => {
    setActiveJob((prev) => {
      const merged = [...prev.items];
      for (const ni of newItems) {
        const existing = merged.find(
          (x) => x.itemName === ni.itemName && x.material === ni.material
        );
        if (existing) {
          existing.qty = (existing.qty || 1) + (ni.qty || 1);
        } else {
          merged.push({ ...ni });
        }
      }
      const updated = { ...prev, items: merged };
      scheduleSave(updated);
      return updated;
    });
    setCuttingResult(null);
  }, [scheduleSave]);

  // -------- update item qty --------
  const updateItemQty = useCallback((idx, delta) => {
    setActiveJob((prev) => {
      const items = prev.items.map((it, i) => {
        if (i !== idx) return it;
        return { ...it, qty: Math.max(1, (it.qty || 1) + delta) };
      });
      const updated = { ...prev, items };
      scheduleSave(updated);
      return updated;
    });
    setCuttingResult(null);
  }, [scheduleSave]);

  // -------- toggle item rotation (swap W↔H, flip turned flag) --------
  const toggleItemTurn = useCallback((idx) => {
    setActiveJob((prev) => {
      const items = prev.items.map((it, i) => {
        if (i !== idx) return it;
        return { ...it, w: it.h, h: it.w, turned: !it.turned };
      });
      const updated = { ...prev, items };
      scheduleSave(updated);
      return updated;
    });
    setCuttingResult(null);
  }, [scheduleSave]);

  // -------- remove item --------
  const removeItem = useCallback((idx) => {
    setActiveJob((prev) => {
      const items = prev.items.filter((_, i) => i !== idx);
      const updated = { ...prev, items };
      scheduleSave(updated);
      return updated;
    });
    setCuttingResult(null);
  }, [scheduleSave]);

  // -------- delete job --------
  const deleteJob = useCallback(async (id) => {
    try {
      await OrderService.deleteCuttingJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      if (activeJob.id === id) {
        setActiveJob({ ...EMPTY_JOB });
        setCuttingResult(null);
      }
    } catch (e) {
      setError(e?.message || "Ошибка удаления");
    }
  }, [activeJob.id]);

  return {
    jobs,
    activeJob,
    loading,
    saving,
    error,
    cuttingResult,
    setCuttingResult,
    loadJobs,
    openJob,
    createNewJob,
    setJobName,
    updateSettings,
    addItems,
    updateItemQty,
    toggleItemTurn,
    removeItem,
    deleteJob,
  };
}
