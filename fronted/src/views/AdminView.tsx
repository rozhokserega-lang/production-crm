import { useMemo } from "react";

interface CrmUser {
  userId: string;
  email: string;
  role: string;
  note: string;
}

interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  userId: string;
  details: string;
  createdAt: string;
}

interface WorkScheduleDay {
  label: string;
  start: string;
  end: string;
  enabled: boolean;
}

type WorkSchedule = Record<string, WorkScheduleDay>;

interface AdminViewProps {
  canAdminSettings: boolean;
  crmUsersLoading: boolean;
  crmUsersSaving: boolean;
  loadCrmUsers: () => Promise<void>;
  newCrmUserId: string;
  setNewCrmUserId: (v: string) => void;
  newCrmUserRole: string;
  setNewCrmUserRole: (v: string) => void;
  newCrmUserNote: string;
  setNewCrmUserNote: (v: string) => void;
  createCrmUserRole: () => Promise<void>;
  crmUsers: CrmUser[];
  updateCrmUserRole: (userId: string, role: string) => Promise<void>;
  removeCrmUserRole: (userId: string) => Promise<void>;
  formatDateTimeRu: (v: string) => string;
  roleOptions: string[];
  roleLabels: Record<string, string>;
  auditLog: AuditEntry[];
  auditLoading: boolean;
  auditError: string;
  auditAction: string;
  auditEntity: string;
  auditLimit: number;
  auditOffset: number;
  setAuditAction: (v: string) => void;
  setAuditEntity: (v: string) => void;
  loadAuditLog: (params: { action?: string; entity?: string; limit?: number; offset?: number }) => Promise<void>;
  workSchedule: WorkSchedule;
  setWorkSchedule: (v: WorkSchedule | ((prev: WorkSchedule) => WorkSchedule)) => void;
  workScheduleLoading: boolean;
  workScheduleSaving: boolean;
  loadWorkSchedule: () => Promise<void>;
  saveWorkSchedule: () => Promise<void>;
}

export function AdminView({
  canAdminSettings,
  crmUsersLoading,
  crmUsersSaving,
  loadCrmUsers,
  newCrmUserId,
  setNewCrmUserId,
  newCrmUserRole,
  setNewCrmUserRole,
  newCrmUserNote,
  setNewCrmUserNote,
  createCrmUserRole,
  crmUsers,
  updateCrmUserRole,
  removeCrmUserRole,
  formatDateTimeRu,
  roleOptions,
  roleLabels,
  auditLog,
  auditLoading,
  auditError,
  auditAction,
  auditEntity,
  auditLimit,
  auditOffset,
  setAuditAction,
  setAuditEntity,
  loadAuditLog,
  workSchedule,
  setWorkSchedule,
  workScheduleLoading,
  workScheduleSaving,
  loadWorkSchedule,
  saveWorkSchedule,
}: AdminViewProps) {
  const dayLabels: Record<string, string> = {
    mon: "Пн",
    tue: "Вт",
    wed: "Ср",
    thu: "Чт",
    fri: "Пт",
    sat: "Сб",
    sun: "Вс",
  };

  const dayKeys = useMemo(() => Object.keys(dayLabels), []);

  return (
    <div style={{ display: "grid", gap: 24, padding: 16, maxWidth: 800, margin: "0 auto" }}>
      {/* Work Schedule */}
      <div className="sheet-table-wrap">
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>График работы цеха</div>
        {workScheduleLoading ? (
          <div className="empty">Загрузка...</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {dayKeys.map((key) => {
              const day = workSchedule[key] || { label: dayLabels[key], start: "09:00", end: "18:00", enabled: true };
              return (
                <div key={key} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 40, fontWeight: 600 }}>{dayLabels[key]}</div>
                  <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={day.enabled}
                      onChange={() =>
                        setWorkSchedule((prev) => ({
                          ...prev,
                          [key]: { ...day, enabled: !day.enabled },
                        }))
                      }
                    />
                    Рабочий
                  </label>
                  <input
                    type="time"
                    value={day.start}
                    onChange={(e) =>
                      setWorkSchedule((prev) => ({
                        ...prev,
                        [key]: { ...day, start: e.target.value },
                      }))
                    }
                    disabled={!day.enabled}
                    style={{ width: 100 }}
                  />
                  <span>—</span>
                  <input
                    type="time"
                    value={day.end}
                    onChange={(e) =>
                      setWorkSchedule((prev) => ({
                        ...prev,
                        [key]: { ...day, end: e.target.value },
                      }))
                    }
                    disabled={!day.enabled}
                    style={{ width: 100 }}
                  />
                </div>
              );
            })}
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                className="mini ok"
                onClick={saveWorkSchedule}
                disabled={workScheduleSaving}
              >
                {workScheduleSaving ? "Сохраняю..." : "Сохранить график"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CRM Users */}
      <div className="sheet-table-wrap">
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>Пользователи CRM</div>
        <div style={{ display: "flex", gap: 8, alignItems: "end", marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 200 }}>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>Email / ID пользователя</div>
            <input value={newCrmUserId} onChange={(e) => setNewCrmUserId(e.target.value)} placeholder="user@example.com" />
          </div>
          <div style={{ minWidth: 140 }}>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>Роль</div>
            <select value={newCrmUserRole} onChange={(e) => setNewCrmUserRole(e.target.value)}>
              {roleOptions.map((r) => (
                <option key={r} value={r}>{roleLabels[r] || r}</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 160 }}>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>Заметка</div>
            <input value={newCrmUserNote} onChange={(e) => setNewCrmUserNote(e.target.value)} placeholder="Опционально" />
          </div>
          <button
            type="button"
            className="mini ok"
            onClick={createCrmUserRole}
            disabled={crmUsersSaving || !newCrmUserId.trim()}
          >
            {crmUsersSaving ? "Добавляю..." : "Добавить"}
          </button>
          <button type="button" className="mini" onClick={loadCrmUsers} disabled={crmUsersLoading}>
            {crmUsersLoading ? "Загрузка..." : "Обновить"}
          </button>
        </div>
        <table className="sheet-table">
          <thead>
            <tr>
              <th>Пользователь</th>
              <th>Роль</th>
              <th>Заметка</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {crmUsers.map((u) => (
              <tr key={u.userId}>
                <td>{u.email || u.userId}</td>
                <td>{roleLabels[u.role] || u.role}</td>
                <td>{u.note || "-"}</td>
                <td>
                  <button
                    type="button"
                    className="mini"
                    onClick={() => {
                      const nextRole = prompt("Новая роль:", u.role);
                      if (nextRole && nextRole !== u.role) updateCrmUserRole(u.userId, nextRole);
                    }}
                  >
                    Сменить роль
                  </button>{" "}
                  <button
                    type="button"
                    className="mini danger"
                    onClick={() => {
                      if (confirm(`Удалить роль у ${u.email}?`)) removeCrmUserRole(u.userId);
                    }}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
            {crmUsers.length === 0 && !crmUsersLoading && (
              <tr><td colSpan={4}>Нет пользователей.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Audit Log */}
      <div className="sheet-table-wrap">
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>Аудит действий</div>
        <div style={{ display: "flex", gap: 8, alignItems: "end", marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 160 }}>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>Действие</div>
            <input value={auditAction} onChange={(e) => setAuditAction(e.target.value)} placeholder="Фильтр" />
          </div>
          <div style={{ minWidth: 160 }}>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>Сущность</div>
            <input value={auditEntity} onChange={(e) => setAuditEntity(e.target.value)} placeholder="Фильтр" />
          </div>
          <button
            type="button"
            className="mini"
            onClick={() =>
              loadAuditLog({
                action: auditAction || undefined,
                entity: auditEntity || undefined,
                limit: auditLimit,
                offset: auditOffset,
              })
            }
            disabled={auditLoading}
          >
            {auditLoading ? "Загрузка..." : "Поиск"}
          </button>
        </div>
        {auditError && <div className="error">{auditError}</div>}
        <table className="sheet-table">
          <thead>
            <tr>
              <th>Время</th>
              <th>Пользователь</th>
              <th>Действие</th>
              <th>Сущность</th>
              <th>Детали</th>
            </tr>
          </thead>
          <tbody>
            {auditLog.map((entry) => (
              <tr key={entry.id}>
                <td>{formatDateTimeRu(entry.createdAt)}</td>
                <td>{entry.userId}</td>
                <td>{entry.action}</td>
                <td>{entry.entity}</td>
                <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.details}</td>
              </tr>
            ))}
            {auditLog.length === 0 && !auditLoading && (
              <tr><td colSpan={5}>Нет записей.</td></tr>
            )}
          </tbody>
        </table>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            type="button"
            className="mini"
            disabled={auditOffset <= 0}
            onClick={() =>
              loadAuditLog({
                action: auditAction || undefined,
                entity: auditEntity || undefined,
                limit: auditLimit,
                offset: Math.max(0, auditOffset - auditLimit),
              })
            }
          >
            ← Назад
          </button>
          <button
            type="button"
            className="mini"
            disabled={auditLog.length < auditLimit}
            onClick={() =>
              loadAuditLog({
                action: auditAction || undefined,
                entity: auditEntity || undefined,
                limit: auditLimit,
                offset: auditOffset + auditLimit,
              })
            }
          >
            Вперед →
          </button>
        </div>
      </div>
    </div>
  );
}
