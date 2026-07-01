import { useCallback, useEffect, useState } from "react";
import {
  CRM_ROLE_PREVIEW_BAR_PREF_EVENT,
  readRolePreviewBarEnabled,
  writeRolePreviewBarEnabled,
} from "../app/rolePreviewBarPreference";

export function useRolePreviewBarPreference() {
  const [rolePreviewBarEnabled, setRolePreviewBarEnabledState] = useState(() => readRolePreviewBarEnabled());

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onChange = (event) => {
      if (event?.detail && typeof event.detail.enabled === "boolean") {
        setRolePreviewBarEnabledState(event.detail.enabled);
        return;
      }
      setRolePreviewBarEnabledState(readRolePreviewBarEnabled());
    };
    window.addEventListener(CRM_ROLE_PREVIEW_BAR_PREF_EVENT, onChange);
    return () => window.removeEventListener(CRM_ROLE_PREVIEW_BAR_PREF_EVENT, onChange);
  }, []);

  const setRolePreviewBarEnabled = useCallback((enabled) => {
    writeRolePreviewBarEnabled(Boolean(enabled));
    setRolePreviewBarEnabledState(Boolean(enabled));
  }, []);

  const toggleRolePreviewBar = useCallback(() => {
    setRolePreviewBarEnabled(!readRolePreviewBarEnabled());
  }, [setRolePreviewBarEnabled]);

  return {
    rolePreviewBarEnabled,
    setRolePreviewBarEnabled,
    toggleRolePreviewBar,
  };
}
