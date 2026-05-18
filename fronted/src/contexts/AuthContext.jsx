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
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config";
import { CRM_ROLE_LABELS } from "../app/appConstants";
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

  const crmRoleLabel = useMemo(
    () => CRM_ROLE_LABELS[crmRole] || CRM_ROLE_LABELS.viewer,
    [crmRole],
  );

  const canOperateProduction =
    crmRole === "operator" || crmRole === "manager" || crmRole === "admin";
  const hasAuthSession =
    Boolean(String(authUser?.id || authUser?.email || "").trim()) ||
    Boolean(String(getSupabaseAuthUserId() || "").trim()) ||
    Boolean(String(getSupabaseAuthSession()?.access_token || "").trim());
  const canOperateWarehouse =
    hasAuthSession && (crmRole === "warehouse" || crmRole === "admin");
  const canManageOrders = crmRole === "manager" || crmRole === "admin";

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
      crmRole,
      crmRoleLabel,
      crmAuthStrict,
      crmAuthStrictSaving,
      canAdminSettings,
      canOperateProduction,
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
      crmRole,
      crmRoleLabel,
      crmAuthStrict,
      crmAuthStrictSaving,
      canAdminSettings,
      canOperateProduction,
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
