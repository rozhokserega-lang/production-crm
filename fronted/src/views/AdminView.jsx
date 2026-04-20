import { useMemo } from "react";

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
}) {
  if (!canAdminSettings) return null;

  const filteredAuditLog = useMemo(() => {
    const needle = String(auditEntity || "").trim().toLowerCase();
    if (!needle) return auditLog;
    return (auditLog || []).filter((row) => String(row?.entity || "").toLowerCase().includes(needle));
  }, [auditLog, auditEntity]);

  return (
    <div className="admin-panel">
      <div className="admin-panel__head">
        <div className="admin-panel__title">Управление ролями пользователей</div>
        <button className="mini" disabled={crmUsersLoading || crmUsersSaving !== ""} onClick={loadCrmUsers}>
          {crmUsersLoading ? "Обновляю..." : "Обновить"}
        </button>
      </div>
      <div className="admin-panel__create">
        <input
          placeholder="user_id (UUID)"
          value={newCrmUserId}
          onChange={(e) => setNewCrmUserId(e.target.value)}
        />
        <select value={newCrmUserRole} onChange={(e) => setNewCrmUserRole(e.target.value)}>
          {roleOptions.map((r) => (
            <option key={`new-role-${r}`} value={r}>{roleLabels[r]}</option>
          ))}
        </select>
        <input
          placeholder="Комментарий (опционально)"
          value={newCrmUserNote}
          onChange={(e) => setNewCrmUserNote(e.target.value)}
        />
        <button className="mini ok" disabled={crmUsersSaving !== ""} onClick={createCrmUserRole}>
          Назначить роль
        </button>
      </div>
      {!crmUsersLoading && crmUsers.length === 0 && (
        <div className="empty">Назначенных ролей пока нет.</div>
      )}
      {crmUsers.length > 0 && (
        <div className="sheet-table-wrap">
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Роль</th>
                <th>Комментарий</th>
                <th>Обновлено</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {crmUsers.map((u) => (
                <tr key={u.userId}>
                  <td>{u.email || u.userId}</td>
                  <td>
                    <select
                      value={u.role}
                      disabled={crmUsersSaving === u.userId}
                      onChange={(e) => updateCrmUserRole(u.userId, e.target.value)}
                    >
                      {roleOptions.map((r) => (
                        <option key={r} value={r}>{roleLabels[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td>{u.note || "-"}</td>
                  <td>{u.updatedAt ? formatDateTimeRu(u.updatedAt) : "-"}</td>
                  <td>
                    <button
                      className="mini warn"
                      disabled={crmUsersSaving === u.userId}
                      onClick={() => removeCrmUserRole(u.userId)}
                    >
                      Удалить роль
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="admin-panel__head">
        <div className="admin-panel__title">Журнал действий (Audit Log)</div>
        <button
          className="mini"
          disabled={auditLoading}
          onClick={() => loadAuditLog({ action: auditAction, limit: auditLimit, offset: auditOffset })}
        >
          {auditLoading ? "Обновляю..." : "Обновить журнал"}
        </button>
      </div>
      <div className="admin-panel__audit-controls">
        <input
          placeholder="Фильтр action (например, set_stage_done)"
          value={auditAction}
          onChange={(e) => setAuditAction(e.target.value)}
        />
        <input
          placeholder="Фильтр entity (например, orders)"
          value={auditEntity}
          onChange={(e) => setAuditEntity(e.target.value)}
        />
        <select
          value={String(auditLimit)}
          onChange={(e) => loadAuditLog({ limit: Number(e.target.value || 50), offset: 0 })}
        >
          <option value="25">25 строк</option>
          <option value="50">50 строк</option>
          <option value="100">100 строк</option>
          <option value="200">200 строк</option>
        </select>
        <button
          className="mini"
          disabled={auditLoading}
          onClick={() => loadAuditLog({ action: auditAction, offset: 0 })}
        >
          Применить фильтр
        </button>
      </div>
      {auditError && <div className="error">{auditError}</div>}
      {!auditLoading && filteredAuditLog.length === 0 && (
        <div className="empty">Записей аудита не найдено.</div>
      )}
      {filteredAuditLog.length > 0 && (
        <div className="sheet-table-wrap">
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Кто</th>
                <th>Роль</th>
                <th>Action</th>
                <th>Сущность</th>
                <th>ID</th>
                <th>Детали</th>
              </tr>
            </thead>
            <tbody>
              {filteredAuditLog.map((row) => (
                <tr key={`audit-${row.id}`}>
                  <td>{row.createdAt ? formatDateTimeRu(row.createdAt) : "-"}</td>
                  <td>{row.actorUserId || row.actorDbRole || "-"}</td>
                  <td>{roleLabels[row.actorCrmRole] || row.actorCrmRole || "-"}</td>
                  <td>{row.action || "-"}</td>
                  <td>{row.entity || "-"}</td>
                  <td>{row.entityId || "-"}</td>
                  <td className="admin-panel__audit-details">
                    {row.details ? JSON.stringify(row.details) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="admin-panel__audit-pager">
            <button
              className="mini"
              disabled={auditLoading || auditOffset <= 0}
              onClick={() =>
                loadAuditLog({
                  action: auditAction,
                  limit: auditLimit,
                  offset: Math.max(0, auditOffset - auditLimit),
                })}
            >
              Назад
            </button>
            <span>Смещение: {auditOffset}</span>
            <button
              className="mini"
              disabled={auditLoading || auditLog.length < auditLimit}
              onClick={() =>
                loadAuditLog({
                  action: auditAction,
                  limit: auditLimit,
                  offset: auditOffset + auditLimit,
                })}
            >
              Вперед
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
