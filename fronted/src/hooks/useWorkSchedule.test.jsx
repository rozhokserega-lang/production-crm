import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useWorkSchedule } from "./useWorkSchedule";

describe("useWorkSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultDeps = {
    canAdminSettings: true,
    view: "admin",
    callBackend: vi.fn(),
    setError: vi.fn(),
    toUserError: (e) => String(e?.message || e),
  };

  it("initializes with default schedule", () => {
    // Keep the hook in a non-admin view to avoid async load side-effects in this test.
    const { result } = renderHook(() => useWorkSchedule({ ...defaultDeps, view: "workshop" }));
    expect(result.current.workSchedule.hoursPerDay).toBe(8);
    expect(result.current.workSchedule.workingDays).toEqual(["mon", "tue", "wed", "thu", "fri"]);
    expect(result.current.workSchedule.weekendDays).toEqual(["sat", "sun"]);
    expect(result.current.workSchedule.workStart).toBe("08:00");
    expect(result.current.workSchedule.workEnd).toBe("18:00");
    expect(result.current.workSchedule.lunchStart).toBe("12:00");
    expect(result.current.workSchedule.lunchEnd).toBe("13:00");
  });

  it("loads work schedule on mount when view is admin", async () => {
    const callBackend = vi.fn().mockResolvedValue({
      hours_per_day: 9,
      working_days: ["mon", "tue", "wed", "thu", "fri", "sat"],
      work_start: "09:00",
      work_end: "17:00",
      lunch_start: "13:00",
      lunch_end: "14:00",
    });

    const { result } = renderHook(() =>
      useWorkSchedule({ ...defaultDeps, callBackend }),
    );

    await waitFor(() => {
      expect(result.current.workScheduleLoading).toBe(false);
    });

    expect(callBackend).toHaveBeenCalledWith("webGetWorkSchedule");
    expect(result.current.workSchedule.hoursPerDay).toBe(9);
    expect(result.current.workSchedule.workingDays).toContain("sat");
    expect(result.current.workSchedule.workStart).toBe("09:00");
  });

  it("does not load schedule when canAdminSettings is false", () => {
    const callBackend = vi.fn();
    renderHook(() =>
      useWorkSchedule({ ...defaultDeps, canAdminSettings: false, callBackend }),
    );
    expect(callBackend).not.toHaveBeenCalled();
  });

  it("does not load schedule when view is not admin", () => {
    const callBackend = vi.fn();
    renderHook(() =>
      useWorkSchedule({ ...defaultDeps, view: "workshop", callBackend }),
    );
    expect(callBackend).not.toHaveBeenCalled();
  });

  it("saves work schedule via callBackend", async () => {
    const callBackend = vi.fn().mockResolvedValue({
      hours_per_day: 8,
      working_days: ["mon", "tue", "wed", "thu", "fri"],
    });

    const { result } = renderHook(() =>
      useWorkSchedule({ ...defaultDeps, callBackend }),
    );

    await act(async () => {
      await result.current.saveWorkSchedule();
    });

    expect(callBackend).toHaveBeenCalledWith("webSetWorkSchedule", {
      hoursPerDay: 8,
      workingDays: ["mon", "tue", "wed", "thu", "fri"],
      workStart: "08:00",
      workEnd: "18:00",
      lunchStart: "12:00",
      lunchEnd: "13:00",
    });
  });

  it("handles save error", async () => {
    const setError = vi.fn();
    const callBackend = vi.fn().mockRejectedValue(new Error("Save failed"));

    const { result } = renderHook(() =>
      useWorkSchedule({ ...defaultDeps, callBackend, setError }),
    );

    await act(async () => {
      await result.current.saveWorkSchedule();
    });

    expect(setError).toHaveBeenCalledWith("Save failed");
  });

  it("does not save when already saving", async () => {
    // Resolve the load call immediately, but keep the save call pending
    let resolveSave;
    const callBackend = vi.fn().mockImplementation((action) => {
      if (action === "webGetWorkSchedule") {
        return Promise.resolve({});
      }
      return new Promise((resolve) => {
        resolveSave = resolve;
      });
    });

    const { result } = renderHook(() =>
      useWorkSchedule({ ...defaultDeps, callBackend }),
    );

    // Wait for the initial load to complete
    await waitFor(() => {
      expect(result.current.workScheduleLoading).toBe(false);
    });

    // Start first save (doesn't resolve yet)
    act(() => {
      result.current.saveWorkSchedule();
    });

    // Wait for workScheduleSaving to become true (state update is async)
    await waitFor(() => {
      expect(result.current.workScheduleSaving).toBe(true);
    });

    // Try saving again while first save is in progress
    await act(async () => {
      await result.current.saveWorkSchedule();
    });

    // callBackend should have been called:
    // 1. "webGetWorkSchedule" (load on mount)
    // 2. "webSetWorkSchedule" (first save)
    // NOT a third time (second save should be blocked)
    expect(callBackend).toHaveBeenCalledTimes(2);

    // Clean up: resolve the pending promise inside act to avoid warnings.
    await act(async () => {
      if (resolveSave) resolveSave({});
    });
    await waitFor(() => {
      expect(result.current.workScheduleSaving).toBe(false);
    });
  });
});
