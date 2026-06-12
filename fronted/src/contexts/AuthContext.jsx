import {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";
import {
  getSupabaseAuthSession,
  getSupabaseAuthUserId,
} from "../api";
import { useAuth as useAuthHook } from "../hooks/useAuth";
import { useCrmRole } from "../hooks/useCrmRole";
import { useSupabaseProxyPreference } from "../hooks/useSupabaseProxyPreference";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config";
import { CRM_ROLE_LABELS } from "../app/appConstants";
import {
  canOperateProductionForRole,
  canOperateWorkshopStageForRole,
  canUseOperatorPilkaModeForRole,
  canConsumePilkaSheetsForRole,
  canAccessViewForRole,
  canAccessWorkshopTabForRole,
  getDefaultViewForRole,
  getDefaultWorkshopTabForRole,
  isRestrictedWorkshopOperatorRole,
} from "../app/crmRoles";
import { useCrmRolePreview } from "../hooks/useCrmRolePreview";
import { toUserError as toUserErrorFn } from "../app/errorCatalogHelpers";

const AuthContext = createContext(null);

export function AuthProvider({ children, view, onAuthChange, setError }) {
  const authEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

  const {
    authEmail,
    setAuthEmail,
    authPassword,
    setAuthPassword,
    authSaving,
    authUser,
    signInWithSupabase,
    signOutSupabaseUser,
  } = useAuthHook({
    authEnabled,
    onAuthChange,
    setError,
    toUserError: toUserErrorFn,
  });

  const authUserLabel = useMemo(
    () => String(authUser?.email || authUser?.phone || authUser?.id || "").trim(),
    [authUser],
  );

  const {
    crmRole,
    crmAuthStrict,
    crmAuthStrictSaving,
    canAdminSettings,
    toggleCrmAuthStrict,
    crmUsers,
    crmUsersLoading,
    crmUsersSaving,
    newCrmUserId,
    setNewCrmUserId,
    newCrmUserRole,
    setNewCrmUserRole,
    newCrmUserNote,
    setNewCrmUserNote,
    auditLog,
    auditLoading,
    auditError,
    auditAction,
    setAuditAction,
    auditEntity,
    setAuditEntity,
    auditLimit,
    auditOffset,
    loadCrmUsers,
    loadAuditLog,
    updateCrmUserRole,
    removeCrmUserRole,
    createCrmUserRole,
  } = useCrmRole({
    view,
    toUserError: toUserErrorFn,
    authEnabled,
    load: onAuthChange,
    setError,
    authUser,
  });

  const actualCrmRole = crmRole;
  const {
    crmRolePreview,
    crmRolePreviewActive,
    setCrmRolePreview,
    clearCrmRolePreview,
  } = useCrmRolePreview({ canAdminSettings });

  const effectiveCrmRole = crmRolePreviewActive ? crmRolePreview : crmRole;

  const {
    supabaseProxyEnabled,
    setSupabaseProxyEnabled,
    toggleSupabaseProxy,
  } = useSupabaseProxyPreference();

  const crmRoleLabel = useMemo(() => {
    const label = CRM_ROLE_LABELS[effectiveCrmRole] || CRM_ROLE_LABELS.viewer;
    if (crmRolePreviewActive) return `${label} (проверка)`;
    return label;
  }, [effectiveCrmRole, crmRolePreviewActive]);

  const actualCrmRoleLabel = useMemo(
    () => CRM_ROLE_LABELS[actualCrmRole] || CRM_ROLE_LABELS.viewer,
    [actualCrmRole],
  );

  const canOperateProduction = canOperateProductionForRole(effectiveCrmRole);
  const canOperateWorkshopStage = useCallback(
    (stage) => canOperateWorkshopStageForRole(effectiveCrmRole, stage),
    [effectiveCrmRole],
  );
  const canUseOperatorPilkaMode = canUseOperatorPilkaModeForRole(effectiveCrmRole);
  const canConsumePilkaSheets = canConsumePilkaSheetsForRole(effectiveCrmRole);
  const isRestrictedWorkshopOperator = isRestrictedWorkshopOperatorRole(effectiveCrmRole);
  const defaultViewForRole = useMemo(() => getDefaultViewForRole(effectiveCrmRole), [effectiveCrmRole]);
  const defaultWorkshopTabForRole = useMemo(() => getDefaultWorkshopTabForRole(effectiveCrmRole), [effectiveCrmRole]);
  const canAccessView = useCallback(
    (viewId) => canAccessViewForRole(effectiveCrmRole, viewId, {
      canAdminSettings: canAdminSettings && !crmRolePreviewActive,
    }),
    [effectiveCrmRole, canAdminSettings, crmRolePreviewActive],
  );
  const canAccessWorkshopTab = useCallback(
    (tabId) => canAccessWorkshopTabForRole(effectiveCrmRole, tabId),
    [effectiveCrmRole],
  );
  const hasAuthSession =
    Boolean(String(authUser?.id || authUser?.email || "").trim()) ||
    Boolean(String(getSupabaseAuthUserId() || "").trim()) ||
    Boolean(String(getSupabaseAuthSession()?.access_token || "").trim());
  const canOperateWarehouse =
    hasAuthSession && (effectiveCrmRole === "warehouse" || effectiveCrmRole === "admin");
  const canManageOrders = effectiveCrmRole === "manager" || effectiveCrmRole === "admin";

  const denyActionByRole = useCallback(
    (message) => {
      setError(message);
      return false;
    },
    [setError],
  );

  const value = useMemo(
    () => ({
      authEnabled,
      authEmail,
      setAuthEmail,
      authPassword,
      setAuthPassword,
      authSaving,
      authUser,
      authUserLabel,
      signInWithSupabase,
      signOutSupabaseUser,
      crmRole: effectiveCrmRole,
      actualCrmRole,
      crmRoleLabel,
      actualCrmRoleLabel,
      crmRolePreview,
      crmRolePreviewActive,
      setCrmRolePreview,
      clearCrmRolePreview,
      crmAuthStrict,
      crmAuthStrictSaving,
      canAdminSettings,
      canOperateProduction,
      canOperateWorkshopStage,
      canUseOperatorPilkaMode,
      canConsumePilkaSheets,
      isRestrictedWorkshopOperator,
      defaultViewForRole,
      defaultWorkshopTabForRole,
      canAccessView,
      canAccessWorkshopTab,
      canOperateWarehouse,
      canManageOrders,
      toggleCrmAuthStrict,
      denyActionByRole,
      crmUsers,
      crmUsersLoading,
      crmUsersSaving,
      newCrmUserId,
      setNewCrmUserId,
      newCrmUserRole,
      setNewCrmUserRole,
      newCrmUserNote,
      setNewCrmUserNote,
      auditLog,
      auditLoading,
      auditError,
      auditAction,
      setAuditAction,
      auditEntity,
      setAuditEntity,
      auditLimit,
      auditOffset,
      loadCrmUsers,
      loadAuditLog,
      updateCrmUserRole,
      removeCrmUserRole,
      createCrmUserRole,
      supabaseProxyEnabled,
      setSupabaseProxyEnabled,
      toggleSupabaseProxy,
    }),
    [
      authEnabled,
      authEmail,
      authPassword,
      authSaving,
      authUser,
      authUserLabel,
      signInWithSupabase,
      signOutSupabaseUser,
      effectiveCrmRole,
      actualCrmRole,
      crmRoleLabel,
      actualCrmRoleLabel,
      crmRolePreview,
      crmRolePreviewActive,
      setCrmRolePreview,
      clearCrmRolePreview,
      crmAuthStrict,
      crmAuthStrictSaving,
      canAdminSettings,
      canOperateProduction,
      canOperateWorkshopStage,
      canUseOperatorPilkaMode,
      canConsumePilkaSheets,
      isRestrictedWorkshopOperator,
      defaultViewForRole,
      defaultWorkshopTabForRole,
      canAccessView,
      canAccessWorkshopTab,
      canOperateWarehouse,
      canManageOrders,
      toggleCrmAuthStrict,
      denyActionByRole,
      crmUsers,
      crmUsersLoading,
      crmUsersSaving,
      newCrmUserId,
      newCrmUserRole,
      newCrmUserNote,
      setNewCrmUserId,
      setNewCrmUserRole,
      setNewCrmUserNote,
      auditLog,
      auditLoading,
      auditError,
      auditAction,
      setAuditAction,
      auditEntity,
      setAuditEntity,
      auditLimit,
      auditOffset,
      loadCrmUsers,
      loadAuditLog,
      updateCrmUserRole,
      removeCrmUserRole,
      createCrmUserRole,
      supabaseProxyEnabled,
      setSupabaseProxyEnabled,
      toggleSupabaseProxy,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
