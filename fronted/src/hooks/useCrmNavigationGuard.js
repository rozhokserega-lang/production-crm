import { useEffect, useMemo } from "react";
import {
  canAccessViewForRole,
  canAccessWorkshopTabForRole,
  getDefaultViewForRole,
  getDefaultWorkshopTabForRole,
} from "../app/crmRoles";

/** Сбрасывает view/tab, если текущая роль не имеет доступа. */
export function useCrmNavigationGuard({
  crmRole,
  canAdminSettings = false,
  view,
  tab,
  setView,
  setTab,
}) {
  const defaultView = useMemo(() => getDefaultViewForRole(crmRole), [crmRole]);
  const defaultWorkshopTab = useMemo(() => getDefaultWorkshopTabForRole(crmRole), [crmRole]);

  useEffect(() => {
    if (!canAccessViewForRole(crmRole, view, { canAdminSettings })) {
      setView(defaultView);
      if (defaultView === "workshop") {
        setTab(defaultWorkshopTab);
      }
      return;
    }
    if (view === "workshop" && !canAccessWorkshopTabForRole(crmRole, tab)) {
      setTab(defaultWorkshopTab);
    }
  }, [
    crmRole,
    canAdminSettings,
    view,
    tab,
    defaultView,
    defaultWorkshopTab,
    setView,
    setTab,
  ]);

  return { defaultView, defaultWorkshopTab };
}
