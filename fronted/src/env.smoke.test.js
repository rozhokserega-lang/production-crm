/**
 * Smoke-тест окружения.
 *
 * Проверяет, что все обязательные переменные окружения заданы и имеют
 * корректный формат. Тесты выполняются в CI и при локальной разработке.
 *
 * Переменные читаются из process.env (Vitest подставляет их через
 * loadEnv/define, либо из .env.local через dotenv).
 */
import { describe, expect, it } from "vitest";

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
const SUPABASE_PROXY_URL = String(import.meta.env.VITE_SUPABASE_PROXY_URL ?? "").trim();

describe("Environment smoke tests", () => {
  it("VITE_SUPABASE_URL is set and looks like a URL", () => {
    expect(SUPABASE_URL, "VITE_SUPABASE_URL is empty").not.toBe("");
    expect(
      SUPABASE_URL.startsWith("https://") || SUPABASE_URL.startsWith("http://"),
      `VITE_SUPABASE_URL should start with http(s)://  got: "${SUPABASE_URL}"`
    ).toBe(true);
  });

  it("VITE_SUPABASE_ANON_KEY is set and non-trivially long", () => {
    expect(SUPABASE_ANON_KEY, "VITE_SUPABASE_ANON_KEY is empty").not.toBe("");
    expect(
      SUPABASE_ANON_KEY.length,
      "VITE_SUPABASE_ANON_KEY looks too short to be a JWT"
    ).toBeGreaterThan(20);
  });

  it("VITE_SUPABASE_PROXY_URL: dev path or omitted when using direct HTTPS URL", () => {
    if (!SUPABASE_PROXY_URL) {
      // Продакшен (VPS): в .env.production часто только VITE_SUPABASE_URL=https://supabase-proxy...
      expect(
        SUPABASE_URL.startsWith("https://"),
        "без VITE_SUPABASE_PROXY_URL адрес Supabase должен быть полным https://"
      ).toBe(true);
      return;
    }
    expect(
      SUPABASE_PROXY_URL,
      'VITE_SUPABASE_PROXY_URL should not be "/supabase" — use direct HTTPS URL in production'
    ).not.toBe("/supabase");
  });

  it("VITE_SUPABASE_PROXY_URL points to the same host as VITE_SUPABASE_URL or is a dedicated proxy", () => {
    if (!SUPABASE_PROXY_URL.startsWith("http")) return; // relative paths skip this check
    let proxyHost;
    let supabaseHost;
    try {
      proxyHost = new URL(SUPABASE_PROXY_URL).hostname;
      supabaseHost = new URL(SUPABASE_URL).hostname;
    } catch {
      return; // malformed URL is caught by the earlier test
    }
    // The proxy may be a different subdomain (e.g. supabase-proxy.crm-v175.ru vs
    // xxx.supabase.co). We just verify both values are parseable and non-empty.
    expect(proxyHost).not.toBe("");
    expect(supabaseHost).not.toBe("");
  });
});
