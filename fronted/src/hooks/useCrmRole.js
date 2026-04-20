import { useCallback, useEffect, useState } from "react";
import {
  getSupabaseAuthUser,
  supabaseSignInWithPassword,
  supabaseSignOut,
} from "../api";

const CRM_ROLES = ["viewer", "operator", "manager", "admin"];

function normalizeCrmRole(rawRole) {
  const role = String(rawRole || "").trim().toLowerCase();
  return CRM_ROLES.includes(role) ? role : "viewer";
}

function parseCrmRoleResponse(payload) {
  if (typeof payload === "string") return payload;
  if (Array.isArray(payload) && payload.length > 0) {
    const first = payload[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      return first.web_effective_crm_role || first.role || first.crm_role || Object.values(first)[0];
    }
  }
  if (payload && typeof payload === "object") {
    return payload.web_effective_crm_role || payload.role || payload.crm_role || "";
  }
  return "";
}

function parseStrictModeResponse(payload) {
  if (typeof payload === "boolean") return payload;
  if (typeof payload === "string") return payload.trim().toLowerCase() === "true";
  if (Array.isArray(payload) && payload.length > 0) {
    const first = payload[0];
    if (typeof first === "boolean") return first;
    if (first && typeof first === "object") {
      if (typeof first.enabled === "boolean") return first.enabled;
      if (typeof first.web_is_crm_auth_strict === "boolean") return first.web_is_crm_auth_strict;
      if (typeof first.value === "boolean") return first.value;
    }
  }
  if (payload && typeof payload === "object") {
    if (typeof payload.enabled === "boolean") return payload.enabled;
    if (typeof payload.web_is_crm_auth_strict === "boolean") return payload.web_is_crm_auth_strict;
    if (typeof payload.value === "boolean") return payload.value;
  }
  return false;
}

function normalizeCrmUsers(payload) {
  const list = Array.isArray(payload) ? payload : [];
  return list
    .map((x) => ({
      userId: String(x?.user_id || x?.userId || "").trim(),
      email: String(x?.email || "").trim(),
      role: normalizeCrmRole(x?.role),
      note: String(x?.note || "").trim(),
      assignedBy: String(x?.assigned_by || x?.assignedBy || "").trim(),
      updatedAt: String(x?.updated_at || x?.updatedAt || "").trim(),
    }))
    .filter((x) => x.userId);
}

function normalizeAuditLog(payload) {
  const list = Array.isArray(payload) ? payload : [];
  return list.map((x) => ({
    id: Number(x?.id || 0),
    createdAt: String(x?.created_at || x?.createdAt || "").trim(),
    actorUserId: String(x?.actor_user_id || x?.actorUserId || "").trim(),
    actorDbRole: String(x?.actor_db_role || x?.actorDbRole || "").trim(),
    actorCrmRole: normalizeCrmRole(x?.actor_crm_role || x?.actorCrmRole || ""),
    action: String(x?.action || "").trim(),
    entity: String(x?.entity || "").trim(),
    entityId: String(x?.entity_id || x?.entityId || "").trim(),
    details: x?.details && typeof x.details === "object" ? x.details : null,
  }));
}

export function useCrmRole({
  view,
  callBackend,
  toUserError,
  authEnabled,
  load,
  setError,
}) {
  const [crmRole, setCrmRole] = useState("viewer");
  const [crmAuthStrict, setCrmAuthStrict] = useState(false);
  const [crmAuthStrictSaving, setCrmAuthStrictSaving] = useState(false);
  const [crmUsers, setCrmUsers] = useState([]);
  const [crmUsersLoading, setCrmUsersLoading] = useState(false);
  const [crmUsersSaving, setCrmUsersSaving] = useState("");
  const [auditLog, setAuditLog] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditLimit, setAuditLimit] = useState(50);
  const [auditOffset, setAuditOffset] = useState(0);
  const [newCrmUserId, setNewCrmUserId] = useState("");
  const [newCrmUserRole, setNewCrmUserRole] = useState("viewer");
  const [newCrmUserNote, setNewCrmUserNote] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authSaving, setAuthSaving] = useState(false);
  const [authUser, setAuthUser] = useState(() => getSupabaseAuthUser());

  const canAdminSettings = crmRole === "admin";

  useEffect(() => {
    let cancelled = false;
    async function loadCrmRole() {
      try {
        const strictPayload = await callBackend("webGetCrmAuthStrict");
        if (!cancelled) setCrmAuthStrict(parseStrictModeResponse(strictPayload));
      } catch (_) {
        if (!cancelled) setCrmAuthStrict(false);
      }
      try {
        const rolePayload = await callBackend("webGetMyRole");
        const role = normalizeCrmRole(parseCrmRoleResponse(rolePayload));
        if (!cancelled) setCrmRole(role);
      } catch (_) {
        if (!cancelled) setCrmRole("viewer");
      }
    }
    loadCrmRole();
    return () => {
      cancelled = true;
    };
  }, [authUser?.id, callBackend]);

  const loadCrmUsers = useCallback(async () => {
    if (!canAdminSettings) return;
    setCrmUsersLoading(true);
    try {
      const payload = await callBackend("webListCrmUserRoles");
      setCrmUsers(normalizeCrmUsers(payload));
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setCrmUsersLoading(false);
    }
  }, [callBackend, canAdminSettings, setError, toUserError]);

  const loadAuditLog = useCallback(async (next = {}) => {
    if (!canAdminSettings) return;
    const requestedAction = String(next.action ?? "").trim();
    const requestedLimit = Math.max(1, Math.min(1000, Number(next.limit ?? 50) || 50));
    const requestedOffset = Math.max(0, Number(next.offset ?? 0) || 0);
    setAuditLoading(true);
    setAuditError("");
    try {
      const payload = await callBackend("webGetAuditLog", {
        action: requestedAction || null,
        limit: requestedLimit,
        offset: requestedOffset,
      });
      setAuditLog(normalizeAuditLog(payload));
      setAuditAction(requestedAction);
      setAuditLimit(requestedLimit);
      setAuditOffset(requestedOffset);
    } catch (e) {
      setAuditError(toUserError(e));
    } finally {
      setAuditLoading(false);
    }
  }, [callBackend, canAdminSettings, toUserError]);

  useEffect(() => {
    if (view !== "admin" || !canAdminSettings) return;
    loadCrmUsers();
    loadAuditLog({ offset: 0 });
  }, [view, canAdminSettings, loadCrmUsers, loadAuditLog]);

  async function toggleCrmAuthStrict() {
    if (!canAdminSettings || crmAuthStrictSaving) return;
    const next = !crmAuthStrict;
    const ok = window.confirm(
      next
        ? "Включить строгий режим авторизации? Без входа пользователя роль anon станет viewer."
        : "Выключить строгий режим авторизации и вернуть совместимый режим?"
    );
    if (!ok) return;
    setCrmAuthStrictSaving(true);
    setError("");
    try {
      const result = await callBackend("webSetCrmAuthStrict", { enabled: next });
      setCrmAuthStrict(parseStrictModeResponse(result));
      const rolePayload = await callBackend("webGetMyRole").catch(() => null);
      if (rolePayload != null) setCrmRole(normalizeCrmRole(parseCrmRoleResponse(rolePayload)));
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setCrmAuthStrictSaving(false);
    }
  }

  async function updateCrmUserRole(userId, role) {
    if (!canAdminSettings || !userId || !role) return;
    setCrmUsersSaving(userId);
    setError("");
    try {
      await callBackend("webSetCrmUserRole", { userId, role });
      await loadCrmUsers();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setCrmUsersSaving("");
    }
  }

  async function removeCrmUserRole(userId) {
    if (!canAdminSettings || !userId) return;
    const ok = window.confirm("Удалить роль пользователя? Он получит роль viewer по умолчанию.");
    if (!ok) return;
    setCrmUsersSaving(userId);
    setError("");
    try {
      await callBackend("webRemoveCrmUserRole", { userId });
      await loadCrmUsers();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setCrmUsersSaving("");
    }
  }

  async function createCrmUserRole() {
    const userId = String(newCrmUserId || "").trim();
    if (!canAdminSettings) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      setError("Укажите корректный user_id (UUID).");
      return;
    }
    setCrmUsersSaving(userId);
    setError("");
    try {
      await callBackend("webSetCrmUserRole", {
        userId,
        role: newCrmUserRole,
        note: newCrmUserNote,
      });
      setNewCrmUserId("");
      setNewCrmUserRole("viewer");
      setNewCrmUserNote("");
      await loadCrmUsers();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setCrmUsersSaving("");
    }
  }

  async function signInWithSupabase() {
    if (!authEnabled || authSaving) return;
    const email = String(authEmail || "").trim();
    if (!email || !authPassword) {
      setError("Введите email и пароль.");
      return;
    }
    setAuthSaving(true);
    setError("");
    try {
      const session = await supabaseSignInWithPassword(email, authPassword);
      setAuthUser(session?.user || null);
      setAuthPassword("");
      await load();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setAuthSaving(false);
    }
  }

  async function signOutSupabaseUser() {
    if (!authEnabled || authSaving) return;
    setAuthSaving(true);
    setError("");
    try {
      await supabaseSignOut();
      setAuthUser(null);
      setCrmUsers([]);
      setAuditLog([]);
      await load();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setAuthSaving(false);
    }
  }

  return {
    crmRole,
    crmAuthStrict,
    crmAuthStrictSaving,
    crmUsers,
    crmUsersLoading,
    crmUsersSaving,
    auditLog,
    auditLoading,
    auditError,
    auditAction,
    auditLimit,
    auditOffset,
    newCrmUserId,
    newCrmUserRole,
    newCrmUserNote,
    authEmail,
    authPassword,
    authSaving,
    authUser,
    setNewCrmUserId,
    setNewCrmUserRole,
    setNewCrmUserNote,
    setAuditAction,
    setAuthEmail,
    setAuthPassword,
    toggleCrmAuthStrict,
    loadCrmUsers,
    loadAuditLog,
    updateCrmUserRole,
    removeCrmUserRole,
    createCrmUserRole,
    signInWithSupabase,
    signOutSupabaseUser,
  };
}
