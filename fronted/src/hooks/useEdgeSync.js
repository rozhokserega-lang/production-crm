import { useCallback } from "react";
import { SUPABASE_ANON_KEY, SUPABASE_DIRECT_URL, SUPABASE_PROXY_URL, SUPABASE_URL } from "../config";
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
import {
  buildConsumeSheetNameCandidates,
  isSheetNameMissingError,
  isStaleConsumeSheetName,
} from "../app/consumeSheetName";
import { extractErrorMessage } from "../app/errorCatalogHelpers";
import { isBrokenCrmProxyHost } from "../app/supabaseRpcRoutes";
import { OrderService } from "../services/orderService";

/**
 * Адреса edge-функций. Первый — «свой origin + /supabase» (прод-домен и портал),
 * дальше прямой адрес из env: если один прокси недоступен, запрос уйдёт по
 * второму, а не потеряется молча. Заведомо нерабочий прокси (supabase-proxy.*)
 * отбрасываем — тем же правилом, что и слой RPC.
 */
function resolveCreds() {
  const baseUrls = [SUPABASE_URL, SUPABASE_DIRECT_URL, SUPABASE_PROXY_URL].filter(
    (url) => String(url || "").trim() && !isBrokenCrmProxyHost(url),
  );
  const token = String(SUPABASE_ANON_KEY || "").trim();
  return { baseUrls, token };
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
      const { baseUrls, token } = resolveCreds();
      if (!baseUrls.length || !token) return;
      try {
        await notifyAssemblyReadyTelegramEdge(baseUrls, token, meta);
      } catch (_) {
        // Notification is best-effort and should not block production workflow.
      }
    },
    [],
  );

  const notifyFinalStageTelegram = useCallback(
    async (meta = {}) => {
      const { baseUrls, token } = resolveCreds();
      if (!baseUrls.length || !token) return;
      try {
        await notifyFinalStageTelegramEdge(baseUrls, token, meta);
      } catch (_) {
        // Notification is best-effort and should not block production workflow.
      }
    },
    [],
  );

  const syncWarehouseFromGoogleSheet = useCallback(
    async () => {
      const { baseUrls, token } = resolveCreds();
      if (!baseUrls.length || !token) {
        setError("Не настроен доступ к Supabase (URL/ANON key).");
        return;
      }
      setWarehouseSyncLoading(true);
      setError("");
      try {
        await syncWarehouseFromGoogleSheetEdge(baseUrls, token, {
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
      const { baseUrls, token } = resolveCreds();
      if (!baseUrls.length || !token) {
        if (!silent) setError("Не настроен доступ к Supabase (URL/ANON key).");
        return;
      }
      if (!silent) setLeftoversSyncLoading(true);
      if (!silent) setError("");
      try {
        await syncLeftoversToGoogleSheetEdge(baseUrls, token, {
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

  /**
   * Запись списания листов в Google-таблицу.
   *
   * Возвращает результат, а не глотает ошибку: списание в CRM уже прошло, но если
   * строка в таблицу не попала, об этом нужно сказать пользователю — иначе
   * расхождение заметят только по факту. Имя вкладки считаем из текущего месяца
   * («Расход ноябрь 2026»), чтобы не забывать переключать его в админке; если
   * такой вкладки нет — пробуем имя из настроек и предупреждаем о старом месяце.
   */
  const logConsumeToGoogleSheet = useCallback(
    async (meta = {}) => {
      const { baseUrls, token } = resolveCreds();
      if (!baseUrls.length || !token) {
        return { ok: false, error: "Не настроен доступ к Supabase (URL/ANON key)." };
      }
      const configuredName = await resolveConsumeLogSheetName(consumeLogSheetName);
      const sheetNames = buildConsumeSheetNameCandidates(configuredName);
      const params = {
        sheetId: WAREHOUSE_SYNC_SHEET_ID,
        orderId: String(meta.orderId || "").trim(),
        item: String(meta.item || "").trim(),
        material: String(meta.material || "").trim(),
        week: String(meta.week || "").trim(),
        qty: Number(meta.qty || 0),
      };

      let lastError = "";
      for (const sheetName of sheetNames) {
        try {
          await logConsumeToGoogleSheetEdge(baseUrls, token, { ...params, sheetName });
          if (sheetNames.length > 1 && isStaleConsumeSheetName(sheetName)) {
            return {
              ok: true,
              sheetName,
              warning:
                `Запись в Google-таблицу ушла во вкладку «${sheetName}»: вкладки «${sheetNames[0]}» в книге нет.` +
                ` Создайте её, чтобы расход шёл в текущий месяц.`,
            };
          }
          return { ok: true, sheetName };
        } catch (e) {
          lastError = extractErrorMessage(e);
          if (!isSheetNameMissingError(lastError)) break;
        }
      }

      console.warn(`[CRM] Списание не записано в Google-таблицу: ${lastError}`);
      return { ok: false, error: lastError };
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
