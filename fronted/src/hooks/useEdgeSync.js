import { useCallback } from "react";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config";
import {
  logConsumeToGoogleSheetEdge,
  notifyAssemblyReadyTelegramEdge,
  notifyFinalStageTelegramEdge,
  syncLeftoversToGoogleSheetEdge,
  syncWarehouseFromGoogleSheetEdge,
} from "../app/edgeSyncService";
import {
  CONSUME_LOG_SHEET_NAME,
  LEFTOVERS_SYNC_GID,
  WAREHOUSE_SYNC_GID,
  WAREHOUSE_SYNC_SHEET_ID,
} from "../app/appConstants";
import { extractErrorMessage } from "../app/errorCatalogHelpers";
import { OrderService } from "../services/orderService";

function resolveCreds() {
  const baseUrl = String(SUPABASE_URL || "").replace(/\/$/, "");
  const token = String(SUPABASE_ANON_KEY || "").trim();
  return { baseUrl, token };
}

async function resolveConsumeLogSheetName(fallback = "") {
  try {
    const raw = await OrderService.getConsumeLogSheetName();
    const row = Array.isArray(raw) ? raw[0] : raw;
    const name = String(row?.sheet_name ?? row?.sheetName ?? "").trim();
    if (name) return name;
  } catch (_) {
    /* RPC может быть недоступен в старой сборке */
  }
  return String(fallback || "").trim() || CONSUME_LOG_SHEET_NAME;
}

/**
 * Хук для синхронизации склада с Google Sheets через Supabase Edge Functions.
 * Все функции — best-effort (не блокируют основной поток) и управляют состоянием загрузки/ошибок.
 */
export function useEdgeSync({
  setError,
  setWarehouseSyncLoading,
  setLeftoversSyncLoading,
  load,
  consumeLogSheetName,
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
        const sheetName = await resolveConsumeLogSheetName(consumeLogSheetName);
        await logConsumeToGoogleSheetEdge(baseUrl, token, {
          sheetId: WAREHOUSE_SYNC_SHEET_ID,
          sheetName,
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
    [consumeLogSheetName],
  );

  return {
    notifyAssemblyReadyTelegram,
    notifyFinalStageTelegram,
    syncWarehouseFromGoogleSheet,
    syncLeftoversToGoogleSheet,
    logConsumeToGoogleSheet,
  };
}
