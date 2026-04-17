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
}) {
  if (!canAdminSettings) return null;

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
    </div>
  );
}
