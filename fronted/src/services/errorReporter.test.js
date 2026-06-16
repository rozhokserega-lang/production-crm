import { describe, expect, it, beforeEach, vi } from "vitest";

// callBackend мокаем ДО импорта модуля-репортёра — он берёт ссылку на функцию
// при первом импорте.
vi.mock("../api", () => ({
  callBackend: vi.fn().mockResolvedValue(undefined),
}));

import { callBackend } from "../api";
import {
  reportUiError,
  setUiContext,
  __resetErrorReporterState,
} from "./errorReporter";

function lastCall() {
  const args = callBackend.mock.calls[callBackend.mock.calls.length - 1];
  return args ? { action: args[0], payload: args[1] } : null;
}

describe("errorReporter", () => {
  beforeEach(() => {
    callBackend.mockClear();
    callBackend.mockResolvedValue(undefined);
    __resetErrorReporterState();
  });

  it("sends ui_error event with action/entity/details", () => {
    reportUiError({
      type: "react_boundary",
      message: "boom",
      stack: "at X\nat Y",
    });
    expect(callBackend).toHaveBeenCalledTimes(1);
    const call = lastCall();
    expect(call.action).toBe("webLogUiError");
    expect(call.payload.details.type).toBe("react_boundary");
    expect(call.payload.details.message).toBe("boom");
    expect(call.payload.details.stack).toBe("at X\nat Y");
    // Контекст браузера должен собираться (jsdom задаёт location/navigator).
    expect(typeof call.payload.details.href).toBe("string");
    expect(call.payload.details.sessionStartedAt).toBeTruthy();
  });

  it("dedupes identical errors within the window", () => {
    reportUiError({ type: "window_error", message: "same" });
    reportUiError({ type: "window_error", message: "same" });
    reportUiError({ type: "window_error", message: "same" });
    expect(callBackend).toHaveBeenCalledTimes(1);
  });

  it("sends different messages separately", () => {
    reportUiError({ type: "window_error", message: "one" });
    reportUiError({ type: "window_error", message: "two" });
    expect(callBackend).toHaveBeenCalledTimes(2);
  });

  it("respects the hard cap of 50 unique errors per session", () => {
    for (let i = 0; i < 60; i += 1) {
      reportUiError({ type: "window_error", message: `err-${i}` });
    }
    expect(callBackend).toHaveBeenCalledTimes(50);
  });

  it("truncates long message and stack", () => {
    const longMsg = "x".repeat(3000);
    const longStack = "y".repeat(5000);
    reportUiError({ type: "t", message: longMsg, stack: longStack });
    const details = lastCall().payload.details;
    expect(details.message.length).toBeLessThanOrEqual(1013); // 1000 + маркер …[truncated]
    expect(details.message).toContain("[truncated]");
    expect(details.stack.length).toBeLessThanOrEqual(2013);
    expect(details.stack).toContain("[truncated]");
  });

  it("includes componentStack from ErrorBoundary", () => {
    reportUiError({
      type: "react_boundary",
      message: "boom",
      componentStack: "\n    in Button\n    in App",
    });
    expect(lastCall().payload.details.componentStack).toContain("in Button");
  });

  it("attaches UI context (view/tab) when set", () => {
    setUiContext({ view: "workshop", tab: "pilka" });
    reportUiError({ type: "t", message: "boom" });
    const details = lastCall().payload.details;
    expect(details.view).toBe("workshop");
    expect(details.tab).toBe("pilka");
  });

  it("stays silent when callBackend rejects", () => {
    callBackend.mockRejectedValueOnce(new Error("network down"));
    expect(() => {
      reportUiError({ type: "t", message: "boom" });
    }).not.toThrow();
  });

  it("stays silent on internal throw (never propagates)", () => {
    // Заставляем callBackend бросить синхронно — репортёр должен это проглотить.
    callBackend.mockImplementation(() => {
      throw new Error("sync boom");
    });
    expect(() => {
      reportUiError({ type: "t", message: "boom" });
    }).not.toThrow();
    callBackend.mockReset();
    callBackend.mockResolvedValue(undefined);
  });

  it("does not throw on null/undefined inputs", () => {
    expect(() => reportUiError()).not.toThrow();
    expect(() => reportUiError({})).not.toThrow();
    expect(() => reportUiError({ type: null, message: null })).not.toThrow();
  });

  it("merges extra context into details", () => {
    reportUiError({
      type: "t",
      message: "boom",
      context: { orderId: "order-1", retry: 3 },
    });
    const details = lastCall().payload.details;
    expect(details.orderId).toBe("order-1");
    expect(details.retry).toBe(3);
  });
});
