import { useState, useEffect, useCallback } from "react";
import {
  getSupabaseAuthSession,
  getSupabaseAuthUser,
  supabaseSignInWithPassword,
  supabaseSignOut,
} from "../api";

/**
 * Хук аутентификации — единый источник правды для состояния входа.
 *
 * @param {Object} options
 * @param {boolean} [options.authEnabled=true] — разрешена ли аутентификация
 * @param {Function} [options.onAuthChange] — колбэк после успешного входа/выхода (например load())
 * @param {Function} [options.setError] — функция для показа ошибок (из App)
 * @param {Function} [options.toUserError] — нормализатор ошибок
 */
export function useAuth({
  authEnabled = true,
  onAuthChange,
  setError,
  toUserError,
} = {}) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setErrorLocal] = useState(null);

  // Поля формы логина (перенесены из useCrmRole)
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authSaving, setAuthSaving] = useState(false);

  // Текущий пользователь Supabase (persisted-сессия)
  const [authUser, setAuthUser] = useState(() => getSupabaseAuthUser());

  // Проверка существующей сессии при монтировании
  useEffect(() => {
    const session = getSupabaseAuthSession();
    const currentUser = getSupabaseAuthUser();

    if (session && currentUser) {
      setUser(currentUser);
      setAuthUser(currentUser);
    }
    setLoading(false);
  }, []);

  /** Вход через Supabase (email + password) */
  const signInWithSupabase = useCallback(async () => {
    if (!authEnabled || authSaving) return;
    const email = String(authEmail || "").trim();
    if (!email || !authPassword) {
      const msg = "Введите email и пароль.";
      if (setError) setError(msg);
      else setErrorLocal(msg);
      return;
    }
    setAuthSaving(true);
    if (setError) setError("");
    else setErrorLocal(null);
    try {
      const session = await supabaseSignInWithPassword(email, authPassword);
      const nextUser = session?.user || null;
      setAuthUser(nextUser);
      setUser(nextUser);
      setAuthPassword("");
      if (onAuthChange) await onAuthChange();
    } catch (e) {
      const msg = toUserError ? toUserError(e) : e.message;
      if (setError) setError(msg);
      else setErrorLocal(msg);
    } finally {
      setAuthSaving(false);
    }
  }, [authEnabled, authSaving, authEmail, authPassword, setError, toUserError, onAuthChange]);

  /** Выход из Supabase */
  const signOutSupabaseUser = useCallback(async () => {
    if (!authEnabled || authSaving) return;
    setAuthSaving(true);
    if (setError) setError("");
    else setErrorLocal(null);
    try {
      await supabaseSignOut();
      setAuthUser(null);
      setUser(null);
      if (onAuthChange) await onAuthChange();
    } catch (e) {
      const msg = toUserError ? toUserError(e) : e.message;
      if (setError) setError(msg);
      else setErrorLocal(msg);
    } finally {
      setAuthSaving(false);
    }
  }, [authEnabled, authSaving, setError, toUserError, onAuthChange]);

  /** Простой signIn (без полей формы) — для обратной совместимости */
  const signIn = useCallback(async (email, password) => {
    setLoading(true);
    setErrorLocal(null);
    try {
      const result = await supabaseSignInWithPassword(email, password);
      setUser(result.user);
      setAuthUser(result.user);
      return result;
    } catch (err) {
      setErrorLocal(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Простой signOut (без колбэков) — для обратной совместимости */
  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      await supabaseSignOut();
      setUser(null);
      setAuthUser(null);
    } catch (err) {
      setErrorLocal(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    // Пользователь (общий)
    user,
    loading,
    error,
    isAuthenticated: !!user,

    // Поля формы логина (из useCrmRole)
    authEmail,
    authPassword,
    authSaving,
    authUser,
    setAuthEmail,
    setAuthPassword,

    // Функции входа/выхода
    signIn,
    signOut,
    signInWithSupabase,
    signOutSupabaseUser,
  };
}
