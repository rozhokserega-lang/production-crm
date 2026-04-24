import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAuth } from "./useAuth";

vi.mock("../api", () => ({
  getSupabaseAuthSession: vi.fn(() => null),
  getSupabaseAuthUser: vi.fn(() => null),
  supabaseSignInWithPassword: vi.fn(),
  supabaseSignOut: vi.fn(),
}));

import {
  getSupabaseAuthSession,
  getSupabaseAuthUser,
  supabaseSignInWithPassword,
  supabaseSignOut,
} from "../api";

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabaseAuthSession.mockReturnValue(null);
    getSupabaseAuthUser.mockReturnValue(null);
  });

  it("initializes with no user and loading state", async () => {
    const { result } = renderHook(() => useAuth({ authEnabled: true }));
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    // The useEffect runs synchronously during renderHook, so loading is already false
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("restores session from persisted auth on mount", async () => {
    const mockUser = { id: "u1", email: "test@test.com" };
    getSupabaseAuthSession.mockReturnValue({ access_token: "token" });
    getSupabaseAuthUser.mockReturnValue(mockUser);

    const { result } = renderHook(() => useAuth({ authEnabled: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("sets loading to false when no session exists", async () => {
    const { result } = renderHook(() => useAuth({ authEnabled: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.user).toBeNull();
  });

  it("signInWithSupabase validates credentials", async () => {
    const setError = vi.fn();
    const { result } = renderHook(() => useAuth({ authEnabled: true, setError }));

    await act(async () => {
      await result.current.signInWithSupabase();
    });

    expect(setError).toHaveBeenCalledWith("Введите email и пароль.");
    expect(supabaseSignInWithPassword).not.toHaveBeenCalled();
  });

  it("signInWithSupabase calls API with credentials", async () => {
    const setError = vi.fn();
    const mockSession = { user: { id: "u1", email: "test@test.com" } };
    supabaseSignInWithPassword.mockResolvedValue(mockSession);

    const { result } = renderHook(() => useAuth({ authEnabled: true, setError }));

    act(() => {
      result.current.setAuthEmail("test@test.com");
      result.current.setAuthPassword("password123");
    });

    await act(async () => {
      await result.current.signInWithSupabase();
    });

    expect(supabaseSignInWithPassword).toHaveBeenCalledWith("test@test.com", "password123");
    expect(result.current.authUser).toEqual(mockSession.user);
    expect(result.current.user).toEqual(mockSession.user);
  });

  it("signInWithSupabase calls onAuthChange after success", async () => {
    const onAuthChange = vi.fn();
    supabaseSignInWithPassword.mockResolvedValue({ user: { id: "u1" } });

    const { result } = renderHook(() => useAuth({ authEnabled: true, onAuthChange }));

    act(() => {
      result.current.setAuthEmail("test@test.com");
      result.current.setAuthPassword("password123");
    });

    await act(async () => {
      await result.current.signInWithSupabase();
    });

    expect(onAuthChange).toHaveBeenCalled();
  });

  it("signInWithSupabase handles errors", async () => {
    const setError = vi.fn();
    const toUserError = (e) => `User error: ${e.message}`;
    supabaseSignInWithPassword.mockRejectedValue(new Error("Invalid credentials"));

    const { result } = renderHook(() => useAuth({ authEnabled: true, setError, toUserError }));

    act(() => {
      result.current.setAuthEmail("test@test.com");
      result.current.setAuthPassword("wrong");
    });

    await act(async () => {
      await result.current.signInWithSupabase();
    });

    expect(setError).toHaveBeenCalledWith("User error: Invalid credentials");
  });

  it("signOutSupabaseUser calls supabaseSignOut", async () => {
    supabaseSignOut.mockResolvedValue({});

    const { result } = renderHook(() => useAuth({ authEnabled: true }));

    await act(async () => {
      await result.current.signOutSupabaseUser();
    });

    expect(supabaseSignOut).toHaveBeenCalled();
  });

  it("signOutSupabaseUser clears user state", async () => {
    supabaseSignOut.mockResolvedValue({});

    const { result } = renderHook(() => useAuth({ authEnabled: true }));

    await act(async () => {
      await result.current.signOutSupabaseUser();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.authUser).toBeNull();
  });

  it("signIn (simple) works with email and password", async () => {
    const mockUser = { id: "u1" };
    supabaseSignInWithPassword.mockResolvedValue({ user: mockUser });

    const { result } = renderHook(() => useAuth({ authEnabled: true }));

    let signInResult;
    await act(async () => {
      signInResult = await result.current.signIn("test@test.com", "password");
    });

    expect(signInResult.user).toEqual(mockUser);
    expect(result.current.user).toEqual(mockUser);
  });

  it("signOut (simple) clears user", async () => {
    supabaseSignOut.mockResolvedValue({});

    const { result } = renderHook(() => useAuth({ authEnabled: true }));

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.user).toBeNull();
  });

  it("does nothing when auth is disabled", async () => {
    const setError = vi.fn();
    const { result } = renderHook(() => useAuth({ authEnabled: false, setError }));

    act(() => {
      result.current.setAuthEmail("test@test.com");
      result.current.setAuthPassword("password");
    });

    await act(async () => {
      await result.current.signInWithSupabase();
    });

    expect(supabaseSignInWithPassword).not.toHaveBeenCalled();
  });
});
