import { useState, useCallback, useEffect } from "react";
import { supabaseSignInWithPassword, supabaseSignOut } from "../api";

interface UseAuthParams {
  callBackend: (action: string, payload?: Record<string, unknown>) => Promise<unknown>;
  setError: (msg: string) => void;
  toUserError: (e: unknown) => string;
}

interface UseAuthReturn {
  session: Record<string, unknown> | null;
  setSession: (v: Record<string, unknown> | null) => void;
  authEmail: string;
  setAuthEmail: (v: string) => void;
  authPassword: string;
  setAuthPassword: (v: string) => void;
  authLoading: boolean;
  authError: string;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
}

export function useAuth({
  callBackend,
  setError,
  toUserError,
}: UseAuthParams): UseAuthReturn {
  const [session, setSession] = useState<Record<string, unknown> | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("supabaseSession");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Record<string, unknown>;
        setSession(parsed);
      } catch {
        localStorage.removeItem("supabaseSession");
      }
    }
  }, []);

  useEffect(() => {
    if (session) {
      localStorage.setItem("supabaseSession", JSON.stringify(session));
    } else {
      localStorage.removeItem("supabaseSession");
    }
  }, [session]);

  const signIn = useCallback(async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const result = await supabaseSignInWithPassword(authEmail, authPassword);
      setSession(result as Record<string, unknown>);
    } catch (e) {
      const msg = toUserError(e);
      setAuthError(msg);
      setError(msg);
    } finally {
      setAuthLoading(false);
    }
  }, [authEmail, authPassword, setError, toUserError]);

  const signOut = useCallback(async () => {
    try {
      await supabaseSignOut();
      setSession(null);
    } catch (e) {
      setError(toUserError(e));
    }
  }, [setError, toUserError]);

  return {
    session,
    setSession,
    authEmail,
    setAuthEmail,
    authPassword,
    setAuthPassword,
    authLoading,
    authError,
    signIn,
    signOut,
    isAuthenticated: !!session,
  };
}
