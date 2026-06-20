import { useEffect, useMemo } from "react";
import {
  canAccessLaborSubViewForRole,
  canAccessViewForRole,
  canAccessWorkshopTabForRole,
  getDefaultLaborSubViewForRole,
  getDefaultViewForRole,
  getDefaultWorkshopTabForRole,
} from "../app/crmRoles";

/** Сбрасывает view/tab, если текущая роль не имеет доступа. */
export function useCrmNavigationGuard({
  crmRole,
  canAdminSettings = false,
  view,
  tab,
  laborSubView,
  setView,
  setTab,
  setLaborSubView,
}) {
  const defaultView = useMemo(() => getDefaultViewForRole(crmRole), [crmRole]);
  const defaultWorkshopTab = useMemo(() => getDefaultWorkshopTabForRole(crmRole), [crmRole]);
  const defaultLaborSubView = useMemo(() => getDefaultLaborSubViewForRole(crmRole), [crmRole]);

  useEffect(() => {
    if (view === "workshopLoad" && typeof setLaborSubView === "function") {
      setView("labor");
      setLaborSubView("workshopLoad");
      return;
    }
    if (!canAccessViewForRole(crmRole, view, { canAdminSettings })) {
      setView(defaultView);
      if (defaultView === "workshop") {
        setTab(defaultWorkshopTab);
      }
      if (defaultView === "labor" && typeof setLaborSubView === "function") {
        setLaborSubView(defaultLaborSubView);
      }
      return;
    }
    if (view === "workshop" && !canAccessWorkshopTabForRole(crmRole, tab)) {
      setTab(defaultWorkshopTab);
    }
    if (
      view === "labor" &&
      typeof setLaborSubView === "function" &&
      !canAccessLaborSubViewForRole(crmRole, laborSubView)
    ) {
      setLaborSubView(defaultLaborSubView);
    }
  }, [
    crmRole,
    canAdminSettings,
    view,
    tab,
    laborSubView,
    defaultView,
    defaultWorkshopTab,
    defaultLaborSubView,
    setView,
    setTab,
    setLaborSubView,
  ]);

  return { defaultView, defaultWorkshopTab, defaultLaborSubView };
}
