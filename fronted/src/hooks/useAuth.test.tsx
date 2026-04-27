import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "./useAuth.ts";

const { mockSupabaseSignInWithPassword, mockSupabaseSignOut } = vi.hoisted(() => ({
  mockSupabaseSignInWithPassword: vi.fn(),
  mockSupabaseSignOut: vi.fn(),
}));

vi.mock("../api", () => ({
  supabaseSignInWithPassword: mockSupabaseSignInWithPassword,
  supabaseSignOut: mockSupabaseSignOut,
}));

describe("useAuth", () => {
  const callBackend = vi.fn();
  const setError = vi.fn();
  const toUserError = (e: unknown) => `User error: ${(e as Error).message}`;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("initializes with no session", () => {
    const { result } = renderHook(() => useAuth({ callBackend, setError, toUserError }));
    expect(result.current.session).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.authLoading).toBe(false);
    expect(result.current.authError).toBe("");
  });

  it("restores session from localStorage on mount", () => {
    const mockSession = { access_token: "token", user: { id: "u1", email: "test@test.com" } };
    localStorage.setItem("supabaseSession", JSON.stringify(mockSession));

    const { result } = renderHook(() => useAuth({ callBackend, setError, toUserError }));
    expect(result.current.session).toEqual(mockSession);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("signIn calls supabaseSignInWithPassword and sets session", async () => {
    const mockSession = { user: { id: "u1", email: "test@test.com" } };
    mockSupabaseSignInWithPassword.mockResolvedValue(mockSession);

    const { result } = renderHook(() => useAuth({ callBackend, setError, toUserError }));

    act(() => {
      result.current.setAuthEmail("test@test.com");
      result.current.setAuthPassword("password123");
    });

    await act(async () => {
      await result.current.signIn();
    });

    expect(mockSupabaseSignInWithPassword).toHaveBeenCalledWith("test@test.com", "password123");
    expect(result.current.session).toEqual(mockSession);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.authLoading).toBe(false);
  });

  it("signIn handles errors via toUserError", async () => {
    mockSupabaseSignInWithPassword.mockRejectedValue(new Error("Invalid credentials"));

    const { result } = renderHook(() => useAuth({ callBackend, setError, toUserError }));

    act(() => {
      result.current.setAuthEmail("test@test.com");
      result.current.setAuthPassword("wrong");
    });

    await act(async () => {
      await result.current.signIn();
    });

    expect(setError).toHaveBeenCalledWith("User error: Invalid credentials");
    expect(result.current.authError).toBe("User error: Invalid credentials");
    expect(result.current.session).toBeNull();
  });

  it("signOut clears session", async () => {
    mockSupabaseSignOut.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth({ callBackend, setError, toUserError }));

    act(() => {
      result.current.setSession({ user: { id: "u1" } });
    });

    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockSupabaseSignOut).toHaveBeenCalled();
    expect(result.current.session).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("setAuthEmail and setAuthPassword update state", () => {
    const { result } = renderHook(() => useAuth({ callBackend, setError, toUserError }));

    act(() => {
      result.current.setAuthEmail("test@test.com");
      result.current.setAuthPassword("secret");
    });

    expect(result.current.authEmail).toBe("test@test.com");
    expect(result.current.authPassword).toBe("secret");
  });

  it("persists session to localStorage", () => {
    const { result } = renderHook(() => useAuth({ callBackend, setError, toUserError }));

    const mockSession = { user: { id: "u1" } };
    act(() => {
      result.current.setSession(mockSession);
    });

    const stored = JSON.parse(localStorage.getItem("supabaseSession") || "null");
    expect(stored).toEqual(mockSession);
  });

  it("removes session from localStorage on null", () => {
    localStorage.setItem("supabaseSession", JSON.stringify({ user: { id: "u1" } }));

    const { result } = renderHook(() => useAuth({ callBackend, setError, toUserError }));

    act(() => {
      result.current.setSession(null);
    });

    expect(localStorage.getItem("supabaseSession")).toBeNull();
  });
});
