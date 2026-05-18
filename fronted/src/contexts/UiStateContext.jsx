import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toUserError } from "../app/errorCatalogHelpers";

const UiStateContext = createContext(null);

export function UiStateProvider({ children }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const setUserError = useCallback((e) => {
    setError(typeof e === "string" ? e : toUserError(e));
  }, []);

  const clearError = useCallback(() => setError(""), []);

  const value = useMemo(
    () => ({
      loading,
      setLoading,
      error,
      setError,
      setUserError,
      clearError,
      actionLoading,
      setActionLoading,
      isOnline,
    }),
    [loading, error, setUserError, clearError, actionLoading, isOnline],
  );

  return (
    <UiStateContext.Provider value={value}>
      {children}
    </UiStateContext.Provider>
  );
}

export function useUiState() {
  const ctx = useContext(UiStateContext);
  if (!ctx) throw new Error("useUiState must be used within UiStateProvider");
  return ctx;
}
