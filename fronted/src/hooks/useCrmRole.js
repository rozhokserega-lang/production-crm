import { useEffect, useState } from "react";
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

export function useCrmRole({
  view,
  callBackend,
  toUserError,
  authEnabled,
  load,
  setError,
}) {
  const [crmRole, setCrmRole] = useState("admin");
  const [crmAuthStrict, setCrmAuthStrict] = useState(false);
  const [crmAuthStrictSaving, setCrmAuthStrictSaving] = useState(false);
  const [crmUsers, setCrmUsers] = useState([]);
  const [crmUsersLoading, setCrmUsersLoading] = useState(false);
  const [crmUsersSaving, setCrmUsersSaving] = useState("");
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
        const [rolePayload, strictPayload] = await Promise.all([
          callBackend("webGetMyRole"),
          callBackend("webGetCrmAuthStrict").catch(() => false),
        ]);
        const role = normalizeCrmRole(parseCrmRoleResponse(rolePayload));
        if (!cancelled) setCrmRole(role);
        if (!cancelled) setCrmAuthStrict(parseStrictModeResponse(strictPayload));
      } catch (_) {
        // Keep backward-compatible default role for environments without role RPC.
      }
    }
    loadCrmRole();
    return () => {
      cancelled = true;
    };
  }, [authUser?.id, callBackend]);

  async function loadCrmUsers() {
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
  }

  useEffect(() => {
    if (view !== "admin" || !canAdminSettings) return;
    loadCrmUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, canAdminSettings]);

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
    setAuthEmail,
    setAuthPassword,
    toggleCrmAuthStrict,
    loadCrmUsers,
    updateCrmUserRole,
    removeCrmUserRole,
    createCrmUserRole,
    signInWithSupabase,
    signOutSupabaseUser,
  };
}
