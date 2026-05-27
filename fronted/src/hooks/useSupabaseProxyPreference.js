import { useCallback, useEffect, useState } from "react";
import {
  CRM_SUPABASE_PROXY_PREF_EVENT,
  readSupabaseProxyEnabled,
  writeSupabaseProxyEnabled,
} from "../app/supabaseProxyPreference";

export function useSupabaseProxyPreference() {
  const [supabaseProxyEnabled, setSupabaseProxyEnabledState] = useState(() => readSupabaseProxyEnabled());

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onChange = (event) => {
      if (event?.detail && typeof event.detail.enabled === "boolean") {
        setSupabaseProxyEnabledState(event.detail.enabled);
        return;
      }
      setSupabaseProxyEnabledState(readSupabaseProxyEnabled());
    };
    window.addEventListener(CRM_SUPABASE_PROXY_PREF_EVENT, onChange);
    return () => window.removeEventListener(CRM_SUPABASE_PROXY_PREF_EVENT, onChange);
  }, []);

  const setSupabaseProxyEnabled = useCallback((enabled) => {
    writeSupabaseProxyEnabled(Boolean(enabled));
    setSupabaseProxyEnabledState(Boolean(enabled));
  }, []);

  const toggleSupabaseProxy = useCallback(() => {
    setSupabaseProxyEnabled(!readSupabaseProxyEnabled());
  }, [setSupabaseProxyEnabled]);

  return {
    supabaseProxyEnabled,
    setSupabaseProxyEnabled,
    toggleSupabaseProxy,
  };
}
