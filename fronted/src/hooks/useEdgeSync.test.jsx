import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEdgeSync } from "./useEdgeSync";

vi.mock("../config", () => ({
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
}));

vi.mock("../app/edgeSyncService", () => ({
  syncWarehouseFromGoogleSheetEdge: vi.fn(),
  syncLeftoversToGoogleSheetEdge: vi.fn(),
  logConsumeToGoogleSheetEdge: vi.fn(),
  syncPlanCellToGoogleSheetEdge: vi.fn(),
  notifyAssemblyReadyTelegramEdge: vi.fn(),
  notifyFinalStageTelegramEdge: vi.fn(),
}));

import {
  syncWarehouseFromGoogleSheetEdge,
  syncLeftoversToGoogleSheetEdge,
  logConsumeToGoogleSheetEdge,
  syncPlanCellToGoogleSheetEdge,
  notifyAssemblyReadyTelegramEdge,
  notifyFinalStageTelegramEdge,
} from "../app/edgeSyncService";

import * as configModule from "../config";

describe("useEdgeSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultDeps = {
    setError: vi.fn(),
    setWarehouseSyncLoading: vi.fn(),
    setLeftoversSyncLoading: vi.fn(),
    load: vi.fn(),
  };

  it("syncWarehouseFromGoogleSheet calls edge function and reloads", async () => {
    syncWarehouseFromGoogleSheetEdge.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useEdgeSync(defaultDeps));

    await act(async () => {
      await result.current.syncWarehouseFromGoogleSheet();
    });

    expect(syncWarehouseFromGoogleSheetEdge).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key",
      expect.objectContaining({
        sheetId: expect.any(String),
        gid: expect.any(String),
        leftoversGid: expect.any(String),
      }),
    );
    expect(defaultDeps.setWarehouseSyncLoading).toHaveBeenCalledWith(true);
    expect(defaultDeps.setWarehouseSyncLoading).toHaveBeenCalledWith(false);
    expect(defaultDeps.load).toHaveBeenCalled();
  });

  it("syncWarehouseFromGoogleSheet handles errors", async () => {
    syncWarehouseFromGoogleSheetEdge.mockRejectedValue(new Error("Sync failed"));

    const { result } = renderHook(() => useEdgeSync(defaultDeps));

    await act(async () => {
      await result.current.syncWarehouseFromGoogleSheet();
    });

    expect(defaultDeps.setError).toHaveBeenCalledWith(
      expect.stringContaining("Sync failed"),
    );
  });

  it("syncLeftoversToGoogleSheet calls edge function", async () => {
    syncLeftoversToGoogleSheetEdge.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useEdgeSync(defaultDeps));

    await act(async () => {
      await result.current.syncLeftoversToGoogleSheet({ silent: false });
    });

    expect(syncLeftoversToGoogleSheetEdge).toHaveBeenCalled();
    expect(defaultDeps.setLeftoversSyncLoading).toHaveBeenCalledWith(true);
    expect(defaultDeps.setLeftoversSyncLoading).toHaveBeenCalledWith(false);
  });

  it("syncLeftoversToGoogleSheet skips loading state when silent", async () => {
    syncLeftoversToGoogleSheetEdge.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useEdgeSync(defaultDeps));

    await act(async () => {
      await result.current.syncLeftoversToGoogleSheet({ silent: true });
    });

    expect(defaultDeps.setLeftoversSyncLoading).not.toHaveBeenCalled();
  });

  it("logConsumeToGoogleSheet calls edge function", async () => {
    logConsumeToGoogleSheetEdge.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useEdgeSync(defaultDeps));

    await act(async () => {
      await result.current.logConsumeToGoogleSheet({
        orderId: "A-1",
        item: "Стол",
        material: "Egger",
        week: "2026-W17",
        qty: 5,
      });
    });

    expect(logConsumeToGoogleSheetEdge).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key",
      expect.objectContaining({
        orderId: "A-1",
        material: "Egger",
        qty: 5,
      }),
    );
  });

  it("syncPlanCellToGoogleSheet validates payload before sending", async () => {
    syncPlanCellToGoogleSheetEdge.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useEdgeSync(defaultDeps));

    // Missing required fields — should not call edge function
    await act(async () => {
      await result.current.syncPlanCellToGoogleSheet({ orderId: "A-1" });
    });

    expect(syncPlanCellToGoogleSheetEdge).not.toHaveBeenCalled();
  });

  it("syncPlanCellToGoogleSheet sends valid payload", async () => {
    syncPlanCellToGoogleSheetEdge.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useEdgeSync(defaultDeps));

    await act(async () => {
      await result.current.syncPlanCellToGoogleSheet({
        sectionName: "Кухни",
        item: "Стол Компас",
        material: "Egger White",
        week: "2026-W17",
        qty: 10,
        stageCode: "awaiting",
        stage: "Ожидаю заказ",
      });
    });

    expect(syncPlanCellToGoogleSheetEdge).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key",
      expect.objectContaining({
        sectionName: "Кухни",
        item: "Стол Компас",
        qty: 10,
      }),
    );
  });

  it("notifyAssemblyReadyTelegram calls edge function", async () => {
    notifyAssemblyReadyTelegramEdge.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useEdgeSync(defaultDeps));

    await act(async () => {
      await result.current.notifyAssemblyReadyTelegram({ orderId: "A-1" });
    });

    expect(notifyAssemblyReadyTelegramEdge).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key",
      { orderId: "A-1" },
    );
  });

  it("notifyFinalStageTelegram calls edge function", async () => {
    notifyFinalStageTelegramEdge.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useEdgeSync(defaultDeps));

    await act(async () => {
      await result.current.notifyFinalStageTelegram({ orderId: "A-1" });
    });

    expect(notifyFinalStageTelegramEdge).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key",
      { orderId: "A-1" },
    );
  });

  it("handles missing credentials gracefully", async () => {
    // Temporarily override the mock to return empty creds
    vi.mocked(configModule).SUPABASE_URL = "";
    vi.mocked(configModule).SUPABASE_ANON_KEY = "";

    const { result } = renderHook(() => useEdgeSync(defaultDeps));

    await act(async () => {
      await result.current.syncWarehouseFromGoogleSheet();
    });

    expect(defaultDeps.setError).toHaveBeenCalledWith(
      "Не настроен доступ к Supabase (URL/ANON key).",
    );
  });
});
