import { describe, expect, it } from "vitest";
import { finalizeSupabaseRpcRoutes, buildSupabaseRpcRouteCandidates, isBrokenCrmProxyHost } from "./supabaseRpcRoutes";

describe("supabaseRpcRoutes", () => {
  it("skips broken supabase-proxy host", () => {
    expect(isBrokenCrmProxyHost("https://supabase-proxy.crm-v175.ru")).toBe(true);
    expect(isBrokenCrmProxyHost("https://crm-v175.ru/supabase")).toBe(false);
  });

  it("prefers same-origin proxy on production host", () => {
    expect(
      buildSupabaseRpcRouteCandidates({
        origin: "https://crm-v175.ru",
        directUrl: "https://project.supabase.co",
        proxyUrl: "https://supabase-proxy.crm-v175.ru",
        proxyEnabled: true,
      }),
    ).toEqual([
      "https://crm-v175.ru/supabase",
      "https://project.supabase.co",
    ]);
  });

  it("uses vite /supabase proxy on localhost", () => {
    expect(
      finalizeSupabaseRpcRoutes(
        buildSupabaseRpcRouteCandidates({
          origin: "http://localhost:5173",
          directUrl: "https://project.supabase.co",
          proxyUrl: "/supabase",
          proxyEnabled: true,
        }),
      ),
    ).toEqual(["http://localhost:5173/supabase"]);
  });
});
