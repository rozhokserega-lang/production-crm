import { useCallback, useEffect, useState } from "react";

const CRM_ROLES = ["viewer", "operator", "manager", "admin"];

interface CrmUser {
  userId: string;
  email: string;
  role: string;
  note: string;
  assignedBy: string;
  updatedAt: string;
}

interface AuditEntry {
  id: number;
  createdAt: string;
  actorUserId: string;
  actorDbRole: string;
  actorCrmRole: string;
  action: string;
  entity: string;
  entityId: string;
  details: Record<string, unknown> | null;
}

interface UseCrmRoleParams {
  view: string;
  callBackend: (action: string, payload?: Record<string, unknown>) => Promise<unknown>;
  toUserError: (e: unknown) => string;
  authEnabled: boolean;
  load: () => Promise<void>;
  setError: (msg: string) => void;
  authUser: Record<string, unknown> | null;
}

interface UseCrmRoleReturn {
  crmRole: string;
  crmAuthStrict: boolean;
  crmAuthStrictSaving: boolean;
  canAdminSettings: boolean;
  crmUsers: CrmUser[];
  crmUsersLoading: boolean;
  crmUsersSaving: string;
  newCrmUserId: string;
  newCrmUserRole: string;
  newCrmUserNote: string;
  setNewCrmUserId: (v: string) => void;
  setNewCrmUserRole: (v: string) => void;
  setNewCrmUserNote: (v: string) => void;
  auditLog: AuditEntry[];
  auditLoading: boolean;
  auditError: string;
  auditAction: string;
  auditEntity: string;
  auditLimit: number;
  auditOffset: number;
  setAuditAction: (v: string) => void;
  setAuditEntity: (v: string) => void;
  toggleCrmAuthStrict: () => Promise<void>;
  loadCrmUsers: () => Promise<void>;
  loadAuditLog: (next?: Record<string, unknown>) => Promise<void>;
  updateCrmUserRole: (userId: string, role: string) => Promise<void>;
  removeCrmUserRole: (userId: string) => Promise<void>;
  createCrmUserRole: () => Promise<void>;
}

function normalizeCrmRole(rawRole: unknown): string {
  const role = String(rawRole || "").trim().toLowerCase();
  return CRM_ROLES.includes(role) ? role : "viewer";
}

function parseCrmRoleResponse(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (Array.isArray(payload) && payload.length > 0) {
    const first = payload[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      const f = first as Record<string, unknown>;
      return String(
        f.web_effective_crm_role || f.role || f.crm_role || Object.values(f)[0] || "",
      );
    }
  }
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    return String(p.web_effective_crm_role || p.role || p.crm_role || "");
  }
  return "";
}

function parseStrictModeResponse(payload: unknown): boolean {
  if (typeof payload === "boolean") return payload;
  if (typeof payload === "string") return payload.trim().toLowerCase() === "true";
  if (Array.isArray(payload) && payload.length > 0) {
    const first = payload[0] as Record<string, unknown>;
    if (first && typeof first === "object") {
      if (typeof first.enabled === "boolean") return first.enabled;
      if (typeof first.web_is_crm_auth_strict === "boolean") return first.web_is_crm_auth_strict;
      if (typeof first.value === "boolean") return first.value;
    }
  }
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (typeof p.enabled === "boolean") return p.enabled;
    if (typeof p.web_is_crm_auth_strict === "boolean") return p.web_is_crm_auth_strict;
    if (typeof p.value === "boolean") return p.value;
  }
  return false;
}

function normalizeCrmUsers(payload: unknown): CrmUser[] {
  const list = Array.isArray(payload) ? payload : [];
  return list
    .map((x) => {
      const item = x as Record<string, unknown>;
      return {
        userId: String(item?.user_id || item?.userId || "").trim(),
        email: String(item?.email || "").trim(),
        role: normalizeCrmRole(item?.role),
        note: String(item?.note || "").trim(),
        assignedBy: String(item?.assigned_by || item?.assignedBy || "").trim(),
        updatedAt: String(item?.updated_at || item?.updatedAt || "").trim(),
      };
    })
    .filter((x) => x.userId);
}

function normalizeAuditLog(payload: unknown): AuditEntry[] {
  const list = Array.isArray(payload) ? payload : [];
  return list.map((x) => {
    const item = x as Record<string, unknown>;
    return {
      id: Number(item?.id || 0),
      createdAt: String(item?.created_at || item?.createdAt || "").trim(),
      actorUserId: String(item?.actor_user_id || item?.actorUserId || "").trim(),
      actorDbRole: String(item?.actor_db_role || item?.actorDbRole || "").trim(),
      actorCrmRole: normalizeCrmRole(item?.actor_crm_role || item?.actorCrmRole || ""),
      action: String(item?.action || "").trim(),
      entity: String(item?.entity || "").trim(),
      entityId: String(item?.entity_id || item?.entityId || "").trim(),
      details:
        item?.details && typeof item.details === "object"
          ? (item.details as Record<string, unknown>)
          : null,
    };
  });
}

/**
 * Хук управления CRM-ролями, пользователями, аудитом и строгим режимом.
 *
 * Аутентификация (authEmail, authPassword, signInWithSupabase и т.д.) вынесена
 * в хук useAuth(). Этот хук принимает auth-поля через пропсы и пробрасывает их
 * наружу для обратной совместимости.
 */
export function useCrmRole({
  view,
  callBackend,
  toUserError,
  authEnabled,
  load,
  setError,
  authUser,
}: UseCrmRoleParams): UseCrmRoleReturn {
  const [crmRole, setCrmRole] = useState("viewer");
  const [crmAuthStrict, setCrmAuthStrict] = useState(false);
  const [crmAuthStrictSaving, setCrmAuthStrictSaving] = useState(false);
  const [crmUsers, setCrmUsers] = useState<CrmUser[]>([]);
  const [crmUsersLoading, setCrmUsersLoading] = useState(false);
  const [crmUsersSaving, setCrmUsersSaving] = useState("");
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditEntity, setAuditEntity] = useState("");
  const [auditLimit, setAuditLimit] = useState(50);
  const [auditOffset, setAuditOffset] = useState(0);
  const [newCrmUserId, setNewCrmUserId] = useState("");
  const [newCrmUserRole, setNewCrmUserRole] = useState("viewer");
  const [newCrmUserNote, setNewCrmUserNote] = useState("");

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

  const loadAuditLog = useCallback(
    async (next: Record<string, unknown> = {}) => {
      if (!canAdminSettings) return;
      const requestedAction = String(next.action ?? "").trim();
      const requestedEntity = String(next.entity ?? "").trim();
      const requestedLimit = Math.max(1, Math.min(1000, Number(next.limit ?? 50) || 50));
      const requestedOffset = Math.max(0, Number(next.offset ?? 0) || 0);
      setAuditLoading(true);
      setAuditError("");
      try {
        const payload = await callBackend("webGetAuditLog", {
          action: requestedAction || null,
          entity: requestedEntity || null,
          limit: requestedLimit,
          offset: requestedOffset,
        });
        setAuditLog(normalizeAuditLog(payload));
        setAuditAction(requestedAction);
        setAuditEntity(requestedEntity);
        setAuditLimit(requestedLimit);
        setAuditOffset(requestedOffset);
      } catch (e) {
        setAuditError(toUserError(e));
      } finally {
        setAuditLoading(false);
      }
    },
    [callBackend, canAdminSettings, toUserError],
  );

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
        : "Выключить строгий режим авторизации и вернуть совместимый режим?",
    );
    if (!ok) return;
    setCrmAuthStrictSaving(true);
    setError("");
    try {
      const result = await callBackend("webSetCrmAuthStrict", { enabled: next });
      setCrmAuthStrict(parseStrictModeResponse(result));
      const rolePayload = await callBackend("webGetMyRole").catch(() => null);
      if (rolePayload != null)
        setCrmRole(normalizeCrmRole(parseCrmRoleResponse(rolePayload)));
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setCrmAuthStrictSaving(false);
    }
  }

  async function updateCrmUserRole(userId: string, role: string) {
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

  async function removeCrmUserRole(userId: string) {
    if (!canAdminSettings || !userId) return;
    const ok = window.confirm(
      "Удалить роль пользователя? Он получит роль viewer по умолчанию.",
    );
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
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        userId,
      )
    ) {
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

  return {
    // CRM-роль и строгий режим
    crmRole,
    crmAuthStrict,
    crmAuthStrictSaving,
    canAdminSettings,

    // CRM-пользователи
    crmUsers,
    crmUsersLoading,
    crmUsersSaving,
    newCrmUserId,
    newCrmUserRole,
    newCrmUserNote,
    setNewCrmUserId,
    setNewCrmUserRole,
    setNewCrmUserNote,

    // Аудит
    auditLog,
    auditLoading,
    auditError,
    auditAction,
    auditEntity,
    auditLimit,
    auditOffset,
    setAuditAction,
    setAuditEntity,

    // Действия
    toggleCrmAuthStrict,
    loadCrmUsers,
    loadAuditLog,
    updateCrmUserRole,
    removeCrmUserRole,
    createCrmUserRole,
  };
}
