import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useWorkSchedule } from "./useWorkSchedule.js";

describe("useWorkSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultDeps = {
    canAdminSettings: true,
    view: "admin",
    callBackend: vi.fn(),
    setError: vi.fn(),
    toUserError: (e: unknown) => String((e as Error)?.message || e),
  };

  it("initializes with default flat schedule (no admin load when view is workshop)", () => {
    const { result } = renderHook(() => useWorkSchedule({ ...defaultDeps, view: "workshop" }));
    expect(result.current.workSchedule.hoursPerDay).toBe(8);
    expect(result.current.workSchedule.workStart).toBe("08:00");
    expect(result.current.workSchedule.workEnd).toBe("18:00");
    expect(result.current.workSchedule.lunchStart).toBe("12:00");
    expect(result.current.workSchedule.lunchEnd).toBe("13:00");
    expect(result.current.workSchedule.workingDays).toEqual(["mon", "tue", "wed", "thu", "fri"]);
    expect(result.current.workSchedule.weekendDays).toEqual(["sat", "sun"]);
  });

  it("loads work schedule on mount when view is admin", async () => {
    const callBackend = vi.fn().mockResolvedValue({
      hours_per_day: 8,
      work_start: "08:00",
      work_end: "17:00",
      working_days: ["mon", "tue", "wed", "thu", "fri"],
      lunch_start: "12:00",
      lunch_end: "13:00",
    });

    const { result } = renderHook(() => useWorkSchedule({ ...defaultDeps, callBackend }));

    await waitFor(() => {
      expect(callBackend).toHaveBeenCalledWith("webGetWorkSchedule");
    });

    expect(result.current.workSchedule.workStart).toBe("08:00");
    expect(result.current.workSchedule.workEnd).toBe("17:00");
  });

  it("does not load schedule when canAdminSettings is false", () => {
    const callBackend = vi.fn();
    renderHook(() => useWorkSchedule({ ...defaultDeps, canAdminSettings: false, callBackend }));
    expect(callBackend).not.toHaveBeenCalled();
  });

  it("does not load schedule when view is not admin", () => {
    const callBackend = vi.fn();
    renderHook(() => useWorkSchedule({ ...defaultDeps, view: "workshop", callBackend }));
    expect(callBackend).not.toHaveBeenCalled();
  });

  it("saves work schedule via callBackend with flat payload", async () => {
    const callBackend = vi.fn().mockResolvedValue({});

    const { result } = renderHook(() => useWorkSchedule({ ...defaultDeps, callBackend }));

    await waitFor(() => {
      expect(callBackend).toHaveBeenCalledWith("webGetWorkSchedule");
    });

    await act(async () => {
      await result.current.saveWorkSchedule();
    });

    expect(callBackend).toHaveBeenCalledWith(
      "webSetWorkSchedule",
      expect.objectContaining({
        hoursPerDay: 8,
        workStart: "08:00",
        workEnd: "18:00",
        lunchStart: "12:00",
        lunchEnd: "13:00",
        workingDays: ["mon", "tue", "wed", "thu", "fri"],
      }),
    );
  });

  it("handles save error", async () => {
    const setError = vi.fn();
    const callBackend = vi.fn().mockResolvedValue({});

    const { result } = renderHook(() => useWorkSchedule({ ...defaultDeps, callBackend, setError }));

    await waitFor(() => {
      expect(callBackend).toHaveBeenCalledWith("webGetWorkSchedule");
    });

    callBackend.mockRejectedValueOnce(new Error("Save failed"));

    await act(async () => {
      await result.current.saveWorkSchedule();
    });

    expect(setError).toHaveBeenCalledWith("Save failed");
  });

  it("handles load error", async () => {
    const setError = vi.fn();
    const callBackend = vi.fn().mockRejectedValue(new Error("Load failed"));

    renderHook(() => useWorkSchedule({ ...defaultDeps, callBackend, setError }));

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith("Load failed");
    });
  });
});
