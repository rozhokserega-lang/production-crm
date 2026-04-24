import { useCallback } from "react";
import { BACKEND_PROVIDER, SUPABASE_ANON_KEY, SUPABASE_URL } from "../config";
import {
  logConsumeToGoogleSheetEdge,
  notifyAssemblyReadyTelegramEdge,
  notifyFinalStageTelegramEdge,
  syncLeftoversToGoogleSheetEdge,
  syncPlanCellToGoogleSheetEdge,
  syncWarehouseFromGoogleSheetEdge,
} from "../app/edgeSyncService";
import {
  CONSUME_LOG_SHEET_NAME,
  LEFTOVERS_SYNC_GID,
  PLAN_SYNC_GID,
  PLAN_SYNC_SHEET_ID,
  WAREHOUSE_SYNC_GID,
  WAREHOUSE_SYNC_SHEET_ID,
} from "../app/appConstants";
import { extractErrorMessage } from "../app/errorCatalogHelpers";

function resolveCreds() {
  const baseUrl = String(SUPABASE_URL || "").replace(/\/$/, "");
  const token = String(SUPABASE_ANON_KEY || "").trim();
  return { baseUrl, token };
}

/**
 * Хук, предоставляющий функции для синхронизации с Google Sheets через Supabase Edge Functions.
 * Все функции — best-effort (не блокируют основной поток) и управляют состоянием загрузки/ошибок.
 */
export function useEdgeSync({
  setError,
  setWarehouseSyncLoading,
  setLeftoversSyncLoading,
  load,
}) {
  const notifyAssemblyReadyTelegram = useCallback(
    async (meta = {}) => {
      const { baseUrl, token } = resolveCreds();
      if (!baseUrl || !token) return;
      try {
        await notifyAssemblyReadyTelegramEdge(baseUrl, token, meta);
      } catch (_) {
        // Notification is best-effort and should not block production workflow.
      }
    },
    [],
  );

  const notifyFinalStageTelegram = useCallback(
    async (meta = {}) => {
      const { baseUrl, token } = resolveCreds();
      if (!baseUrl || !token) return;
      try {
        await notifyFinalStageTelegramEdge(baseUrl, token, meta);
      } catch (_) {
        // Notification is best-effort and should not block production workflow.
      }
    },
    [],
  );

  const syncWarehouseFromGoogleSheet = useCallback(
    async () => {
      const { baseUrl, token } = resolveCreds();
      if (!baseUrl || !token) {
        setError("Не настроен доступ к Supabase (URL/ANON key).");
        return;
      }
      setWarehouseSyncLoading(true);
      setError("");
      try {
        await syncWarehouseFromGoogleSheetEdge(baseUrl, token, {
          sheetId: WAREHOUSE_SYNC_SHEET_ID,
          gid: WAREHOUSE_SYNC_GID,
          leftoversGid: LEFTOVERS_SYNC_GID,
        });
        await load();
      } catch (e) {
        setError(`Не удалось синхронизировать склад: ${extractErrorMessage(e)}`);
      } finally {
        setWarehouseSyncLoading(false);
      }
    },
    [setError, setWarehouseSyncLoading, load],
  );

  const syncLeftoversToGoogleSheet = useCallback(
    async (options = {}) => {
      const silent = Boolean(options.silent);
      const { baseUrl, token } = resolveCreds();
      if (!baseUrl || !token) {
        if (!silent) setError("Не настроен доступ к Supabase (URL/ANON key).");
        return;
      }
      if (!silent) setLeftoversSyncLoading(true);
      if (!silent) setError("");
      try {
        await syncLeftoversToGoogleSheetEdge(baseUrl, token, {
          sheetId: WAREHOUSE_SYNC_SHEET_ID,
          gid: LEFTOVERS_SYNC_GID,
        });
      } catch (e) {
        if (!silent) {
          setError(`Не удалось выгрузить остатки в Google Sheet: ${extractErrorMessage(e)}`);
        }
      } finally {
        if (!silent) setLeftoversSyncLoading(false);
      }
    },
    [setError, setLeftoversSyncLoading],
  );

  const logConsumeToGoogleSheet = useCallback(
    async (meta = {}) => {
      const { baseUrl, token } = resolveCreds();
      if (!baseUrl || !token) return;
      try {
        await logConsumeToGoogleSheetEdge(baseUrl, token, {
          sheetId: WAREHOUSE_SYNC_SHEET_ID,
          sheetName: CONSUME_LOG_SHEET_NAME,
          orderId: String(meta.orderId || "").trim(),
          item: String(meta.item || "").trim(),
          material: String(meta.material || "").trim(),
          week: String(meta.week || "").trim(),
          qty: Number(meta.qty || 0),
        });
      } catch (_) {
        // Best-effort sync to sheet should not block core consumption flow.
      }
    },
    [],
  );

  const syncPlanCellToGoogleSheet = useCallback(
    async (meta = {}) => {
      // Best-effort: обновление Google Sheet не должно ломать сохранение плана в Supabase.
      if (!["supabase", "shadow"].includes(String(BACKEND_PROVIDER || ""))) return;
      const { baseUrl, token } = resolveCreds();
      if (!baseUrl || !token) return;

      const payload = {
        sheetId: PLAN_SYNC_SHEET_ID,
        gid: PLAN_SYNC_GID,
        sectionName: String(meta.sectionName || "").trim(),
        item: String(meta.item || "").trim(),
        material: String(meta.material || "").trim(),
        week: String(meta.week || "").trim(),
        qty: Number(meta.qty || 0),
        stageCode: String(meta.stageCode || "").trim(),
        stage: String(meta.stage || "").trim(),
        stageComment: String(meta.stageComment || "").trim(),
        orderId: String(meta.orderId || "").trim(),
      };
      if (!payload.sectionName || !payload.item || !payload.material || !payload.week || !Number.isFinite(payload.qty) || payload.qty <= 0) {
        return;
      }

      try {
        await syncPlanCellToGoogleSheetEdge(baseUrl, token, payload);
      } catch (_) {
        // Keep saving plan resilient; still log to console for troubleshooting.
        console.warn("[CRM] sync-plan-cell-to-gsheet failed (best-effort)", payload);
      }
    },
    [],
  );

  return {
    notifyAssemblyReadyTelegram,
    notifyFinalStageTelegram,
    syncWarehouseFromGoogleSheet,
    syncLeftoversToGoogleSheet,
    logConsumeToGoogleSheet,
    syncPlanCellToGoogleSheet,
  };
}
