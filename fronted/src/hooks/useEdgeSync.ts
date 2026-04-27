import { useCallback } from "react";
import {
  notifyAssemblyReadyTelegramEdge,
  notifyFinalStageTelegramEdge,
  syncWarehouseFromGoogleSheetEdge,
  syncLeftoversToGoogleSheetEdge,
  logConsumeToGoogleSheetEdge,
  syncPlanCellToGoogleSheetEdge,
} from "../app/edgeSyncService";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config";

interface UseEdgeSyncParams {
  callBackend: (action: string, payload?: Record<string, unknown>) => Promise<unknown>;
  setError: (msg: string) => void;
  toUserError: (e: unknown) => string;
}

interface UseEdgeSyncReturn {
  notifyAssemblyReadyTelegram: (meta: Record<string, unknown>) => Promise<void>;
  notifyFinalStageTelegram: (meta: Record<string, unknown>) => Promise<void>;
  syncWarehouseFromGoogleSheet: (params: Record<string, unknown>) => Promise<void>;
  syncLeftoversToGoogleSheet: (params: Record<string, unknown>) => Promise<void>;
  logConsumeToGoogleSheet: (params: Record<string, unknown>) => Promise<void>;
  syncPlanCellToGoogleSheet: (params: Record<string, unknown>) => Promise<void>;
}

function resolveCreds(): { baseUrl: string; token: string } {
  return {
    baseUrl: SUPABASE_URL,
    token: SUPABASE_ANON_KEY,
  };
}

export function useEdgeSync({
  callBackend,
  setError,
  toUserError,
}: UseEdgeSyncParams): UseEdgeSyncReturn {
  const notifyAssemblyReadyTelegram = useCallback(
    async (meta: Record<string, unknown>) => {
      try {
        const { baseUrl, token } = resolveCreds();
        await notifyAssemblyReadyTelegramEdge(baseUrl, token, meta);
      } catch (e) {
        setError(toUserError(e));
      }
    },
    [setError, toUserError],
  );

  const notifyFinalStageTelegram = useCallback(
    async (meta: Record<string, unknown>) => {
      try {
        const { baseUrl, token } = resolveCreds();
        await notifyFinalStageTelegramEdge(baseUrl, token, meta);
      } catch (e) {
        setError(toUserError(e));
      }
    },
    [setError, toUserError],
  );

  const syncWarehouseFromGoogleSheet = useCallback(
    async (params: Record<string, unknown>) => {
      try {
        const { baseUrl, token } = resolveCreds();
        await syncWarehouseFromGoogleSheetEdge(baseUrl, token, params);
      } catch (e) {
        setError(toUserError(e));
      }
    },
    [setError, toUserError],
  );

  const syncLeftoversToGoogleSheet = useCallback(
    async (params: Record<string, unknown>) => {
      try {
        const { baseUrl, token } = resolveCreds();
        await syncLeftoversToGoogleSheetEdge(baseUrl, token, params);
      } catch (e) {
        setError(toUserError(e));
      }
    },
    [setError, toUserError],
  );

  const logConsumeToGoogleSheet = useCallback(
    async (params: Record<string, unknown>) => {
      try {
        const { baseUrl, token } = resolveCreds();
        await logConsumeToGoogleSheetEdge(baseUrl, token, params);
      } catch (e) {
        setError(toUserError(e));
      }
    },
    [setError, toUserError],
  );

  const syncPlanCellToGoogleSheet = useCallback(
    async (params: Record<string, unknown>) => {
      try {
        const { baseUrl, token } = resolveCreds();
        await syncPlanCellToGoogleSheetEdge(baseUrl, token, params);
      } catch (e) {
        setError(toUserError(e));
      }
    },
    [setError, toUserError],
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
