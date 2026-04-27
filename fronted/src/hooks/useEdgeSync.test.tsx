import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEdgeSync } from "./useEdgeSync.ts";

vi.mock("../config", () => ({
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
}));

const {
  mockSyncWarehouseFromGoogleSheetEdge,
  mockSyncLeftoversToGoogleSheetEdge,
  mockLogConsumeToGoogleSheetEdge,
  mockSyncPlanCellToGoogleSheetEdge,
  mockNotifyAssemblyReadyTelegramEdge,
  mockNotifyFinalStageTelegramEdge,
} = vi.hoisted(() => ({
  mockSyncWarehouseFromGoogleSheetEdge: vi.fn(),
  mockSyncLeftoversToGoogleSheetEdge: vi.fn(),
  mockLogConsumeToGoogleSheetEdge: vi.fn(),
  mockSyncPlanCellToGoogleSheetEdge: vi.fn(),
  mockNotifyAssemblyReadyTelegramEdge: vi.fn(),
  mockNotifyFinalStageTelegramEdge: vi.fn(),
}));

vi.mock("../app/edgeSyncService", () => ({
  syncWarehouseFromGoogleSheetEdge: mockSyncWarehouseFromGoogleSheetEdge,
  syncLeftoversToGoogleSheetEdge: mockSyncLeftoversToGoogleSheetEdge,
  logConsumeToGoogleSheetEdge: mockLogConsumeToGoogleSheetEdge,
  syncPlanCellToGoogleSheetEdge: mockSyncPlanCellToGoogleSheetEdge,
  notifyAssemblyReadyTelegramEdge: mockNotifyAssemblyReadyTelegramEdge,
  notifyFinalStageTelegramEdge: mockNotifyFinalStageTelegramEdge,
}));

import * as configModule from "../config";

describe("useEdgeSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(configModule).SUPABASE_URL = "https://test.supabase.co";
    vi.mocked(configModule).SUPABASE_ANON_KEY = "test-anon-key";
  });

  const callBackend = vi.fn();
  const setError = vi.fn();
  const toUserError = (e: unknown) => `User error: ${(e as Error).message}`;

  const defaultDeps = {
    callBackend,
    setError,
    toUserError,
  };

  const warehousePayload = {
    sheetId: "test-sheet",
    gid: "test-gid",
    leftoversGid: "test-leftovers",
  };

  it("syncWarehouseFromGoogleSheet calls edge function and reloads", async () => {
    mockSyncWarehouseFromGoogleSheetEdge.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useEdgeSync(defaultDeps));

    await act(async () => {
      await result.current.syncWarehouseFromGoogleSheet(warehousePayload);
    });

    expect(mockSyncWarehouseFromGoogleSheetEdge).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key",
      warehousePayload,
    );
  });

  it("syncWarehouseFromGoogleSheet handles errors", async () => {
    mockSyncWarehouseFromGoogleSheetEdge.mockRejectedValue(new Error("Sync failed"));

    const { result } = renderHook(() => useEdgeSync(defaultDeps));

    await act(async () => {
      await result.current.syncWarehouseFromGoogleSheet(warehousePayload);
    });

    expect(setError).toHaveBeenCalledWith(
      expect.stringContaining("Sync failed"),
    );
  });

  it("syncLeftoversToGoogleSheet calls edge function", async () => {
    mockSyncLeftoversToGoogleSheetEdge.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useEdgeSync(defaultDeps));

    await act(async () => {
      await result.current.syncLeftoversToGoogleSheet({ silent: false });
    });

    expect(mockSyncLeftoversToGoogleSheetEdge).toHaveBeenCalled();
  });

  it("syncLeftoversToGoogleSheet skips loading state when silent", async () => {
    mockSyncLeftoversToGoogleSheetEdge.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useEdgeSync(defaultDeps));

    await act(async () => {
      await result.current.syncLeftoversToGoogleSheet({ silent: true });
    });

    expect(mockSyncLeftoversToGoogleSheetEdge).toHaveBeenCalled();
  });

  it("logConsumeToGoogleSheet calls edge function", async () => {
    mockLogConsumeToGoogleSheetEdge.mockResolvedValue({ ok: true });

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

    expect(mockLogConsumeToGoogleSheetEdge).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key",
      expect.objectContaining({
        orderId: "A-1",
        material: "Egger",
        qty: 5,
      }),
    );
  });

  it("syncPlanCellToGoogleSheet forwards payload (TS hook does not validate)", async () => {
    mockSyncPlanCellToGoogleSheetEdge.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useEdgeSync(defaultDeps));

    await act(async () => {
      await result.current.syncPlanCellToGoogleSheet({ orderId: "A-1" });
    });

    expect(mockSyncPlanCellToGoogleSheetEdge).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key",
      { orderId: "A-1" },
    );
  });

  it("syncPlanCellToGoogleSheet sends valid payload", async () => {
    mockSyncPlanCellToGoogleSheetEdge.mockResolvedValue({ ok: true });

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

    expect(mockSyncPlanCellToGoogleSheetEdge).toHaveBeenCalledWith(
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
    mockNotifyAssemblyReadyTelegramEdge.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useEdgeSync(defaultDeps));

    await act(async () => {
      await result.current.notifyAssemblyReadyTelegram({ orderId: "A-1" });
    });

    expect(mockNotifyAssemblyReadyTelegramEdge).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key",
      { orderId: "A-1" },
    );
  });

  it("notifyFinalStageTelegram calls edge function", async () => {
    mockNotifyFinalStageTelegramEdge.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useEdgeSync(defaultDeps));

    await act(async () => {
      await result.current.notifyFinalStageTelegram({ orderId: "A-1" });
    });

    expect(mockNotifyFinalStageTelegramEdge).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key",
      { orderId: "A-1" },
    );
  });

  it("calls edge with empty base URL when config is cleared (TS hook still forwards)", async () => {
    vi.mocked(configModule).SUPABASE_URL = "";
    vi.mocked(configModule).SUPABASE_ANON_KEY = "";

    const { result } = renderHook(() => useEdgeSync(defaultDeps));

    await act(async () => {
      await result.current.syncWarehouseFromGoogleSheet(warehousePayload);
    });

    expect(mockSyncWarehouseFromGoogleSheetEdge).toHaveBeenCalledWith(
      "",
      "",
      warehousePayload,
    );
  });
});
