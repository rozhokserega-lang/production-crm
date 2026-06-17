import { useCallback, useState } from "react";
import { normalizeCrmRole } from "../app/crmRoles";

/** Роли для UI-проверки (не меняют роль в БД). */
export const CRM_ROLE_PREVIEW_OPTIONS = [
  "planner",
  "operator_pilka",
  "operator_kromka",
  "operator_pras",
  "operator",
  "viewer",
];

export function useCrmRolePreview({ canAdminSettings }) {
  const [crmRolePreview, setCrmRolePreviewRaw] = useState("");

  const setCrmRolePreview = useCallback(
    (next) => {
      if (!canAdminSettings) return;
      const role = String(next || "").trim().toLowerCase();
      if (!role || !CRM_ROLE_PREVIEW_OPTIONS.includes(role)) {
        setCrmRolePreviewRaw("");
        return;
      }
      setCrmRolePreviewRaw(normalizeCrmRole(role));
    },
    [canAdminSettings],
  );

  const clearCrmRolePreview = useCallback(() => {
    setCrmRolePreviewRaw("");
  }, []);

  const crmRolePreviewActive = Boolean(crmRolePreview) && canAdminSettings;

  return {
    crmRolePreview: crmRolePreviewActive ? crmRolePreview : "",
    crmRolePreviewActive,
    setCrmRolePreview,
    clearCrmRolePreview,
  };
}
