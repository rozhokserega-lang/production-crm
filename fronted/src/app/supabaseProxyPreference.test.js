import { describe, expect, it, beforeEach } from "vitest";
import {
  CRM_SUPABASE_PROXY_PREF_KEY,
  readSupabaseProxyEnabled,
  writeSupabaseProxyEnabled,
} from "./supabaseProxyPreference";

describe("supabaseProxyPreference", () => {
  beforeEach(() => {
    window.localStorage.removeItem(CRM_SUPABASE_PROXY_PREF_KEY);
  });

  it("defaults proxy to enabled", () => {
    expect(readSupabaseProxyEnabled()).toBe(true);
  });

  it("persists disabled preference", () => {
    writeSupabaseProxyEnabled(false);
    expect(readSupabaseProxyEnabled()).toBe(false);
    writeSupabaseProxyEnabled(true);
    expect(readSupabaseProxyEnabled()).toBe(true);
  });
});
