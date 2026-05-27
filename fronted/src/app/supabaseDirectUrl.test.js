import { describe, expect, it } from "vitest";

function extractSupabaseProjectRefFromAnonKey(token) {
  const raw = String(token || "").trim();
  if (!raw) return "";
  const parts = raw.split(".");
  if (parts.length < 2) return "";
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad) b64 += "=".repeat(4 - pad);
    const payload = JSON.parse(atob(b64));
    return String(payload?.ref || "").trim();
  } catch (_) {
    return "";
  }
}

describe("supabase direct url helpers", () => {
  it("extracts project ref from anon key", () => {
    const ref = extractSupabaseProjectRefFromAnonKey(
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zZHd5cGNiaG1mc2VvdGNsa3JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjA4OTYsImV4cCI6MjA5MTI5Njg5Nn0.sig",
    );
    expect(ref).toBe("nsdwypcbhmfseotclkrm");
  });
});
