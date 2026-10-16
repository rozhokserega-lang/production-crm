import { afterEach, describe, expect, it, vi } from "vitest";
import {
  logConsumeToGoogleSheetEdge,
  syncLeftoversToGoogleSheetEdge,
} from "./edgeSyncService";

const originalFetch = globalThis.fetch;

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("edge-функции: перебор адресов", () => {
  it("после недоступного адреса пробует следующий", async () => {
    const calls = [];
    globalThis.fetch = vi.fn(async (url) => {
      calls.push(String(url));
      if (String(url).includes("portal.local")) throw new Error("HTTP 405");
      return jsonResponse({ ok: true, added: 3 });
    });

    const result = await logConsumeToGoogleSheetEdge(
      ["http://portal.local/supabase", "http://gateway.local"],
      "token",
      { qty: 3 },
    );

    expect(result).toEqual({ ok: true, added: 3 });
    expect(calls).toEqual([
      "http://portal.local/supabase/functions/v1/log-consume-sheet",
      "http://gateway.local/functions/v1/log-consume-sheet",
    ]);
  });

  it("ошибку функции отдаёт наружу с перечнем адресов", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ ok: false, error: "Sheet not found by title/gid: title='Расход ноябрь 2026'" }, 500),
    );

    await expect(
      logConsumeToGoogleSheetEdge(["http://a.local", "http://b.local"], "token", {}),
    ).rejects.toThrow(/Sheet not found by title\/gid/);
    await expect(
      logConsumeToGoogleSheetEdge(["http://a.local", "http://b.local"], "token", {}),
    ).rejects.toThrow(/пробовал: http:\/\/a\.local → http:\/\/b\.local/);
  });

  it("без ключа запись не отправляется", async () => {
    globalThis.fetch = vi.fn();
    expect(await logConsumeToGoogleSheetEdge(["http://a.local"], "", {})).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("одинаковые адреса не опрашиваются дважды", async () => {
    const calls = [];
    globalThis.fetch = vi.fn(async (url) => {
      calls.push(String(url));
      return jsonResponse({ ok: true });
    });

    await syncLeftoversToGoogleSheetEdge(["http://same.local/", "http://same.local"], "token", {});

    expect(calls).toEqual(["http://same.local/functions/v1/sync-leftovers-sheet"]);
  });
});
