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
  workSchedule,
  setWorkSchedule,
  workScheduleLoading,
  workScheduleSaving,
  loadWorkSchedule,
  saveWorkSchedule,
}) {
  const dayLabels = {
    mon: "Пн",
    tue: "Вт",
    wed: "Ср",
    thu: "Чт",
    fri: "Пт",
    sat: "Сб",
    sun: "Вс",
  };
  const dayOrder = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
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
        <div className="admin-panel__title">Рабочий календарь</div>
        <button className="mini" disabled={workScheduleLoading || workScheduleSaving} onClick={loadWorkSchedule}>
          {workScheduleLoading ? "Обновляю..." : "Обновить"}
        </button>
      </div>
      <div className="admin-panel__schedule">
        <div className="admin-panel__schedule-hours">
          <div className="admin-panel__schedule-label">Часов в рабочем дне</div>
          <input
            inputMode="decimal"
            value={String(workSchedule?.hoursPerDay ?? "")}
            onChange={(e) => {
              const next = Number(String(e.target.value || "").replace(",", "."));
              setWorkSchedule((prev) => ({
                ...prev,
                hoursPerDay: Number.isFinite(next) ? next : prev.hoursPerDay,
              }));
            }}
            disabled={workScheduleSaving}
          />
        </div>
        <div className="admin-panel__schedule-hours">
          <div className="admin-panel__schedule-label">Рабочее время</div>
          <div className="admin-panel__schedule-time-row">
            <input
              value={String(workSchedule?.workStart ?? "08:00")}
              onChange={(e) =>
                setWorkSchedule((prev) => ({
                  ...prev,
                  workStart: String(e.target.value || "").replace(/[^\d:]/g, "").slice(0, 5),
                }))
              }
              placeholder="08:00"
              disabled={workScheduleSaving}
            />
            <span>—</span>
            <input
              value={String(workSchedule?.workEnd ?? "18:00")}
              onChange={(e) =>
                setWorkSchedule((prev) => ({
                  ...prev,
                  workEnd: String(e.target.value || "").replace(/[^\d:]/g, "").slice(0, 5),
                }))
              }
              placeholder="18:00"
              disabled={workScheduleSaving}
            />
          </div>
        </div>
        <div className="admin-panel__schedule-hours">
          <div className="admin-panel__schedule-label">Обед</div>
          <div className="admin-panel__schedule-time-row">
            <input
              value={String(workSchedule?.lunchStart ?? "12:00")}
              onChange={(e) =>
                setWorkSchedule((prev) => ({
                  ...prev,
                  lunchStart: String(e.target.value || "").replace(/[^\d:]/g, "").slice(0, 5),
                }))
              }
              placeholder="12:00"
              disabled={workScheduleSaving}
            />
            <span>—</span>
            <input
              value={String(workSchedule?.lunchEnd ?? "13:00")}
              onChange={(e) =>
                setWorkSchedule((prev) => ({
                  ...prev,
                  lunchEnd: String(e.target.value || "").replace(/[^\d:]/g, "").slice(0, 5),
                }))
              }
              placeholder="13:00"
              disabled={workScheduleSaving}
            />
          </div>
        </div>
        <div className="admin-panel__schedule-days">
          <div className="admin-panel__schedule-label">Рабочие дни</div>
          <div className="admin-panel__schedule-days-list">
            {dayOrder.map((day) => {
              const active = (workSchedule?.workingDays || []).includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  className={active ? "mini ok admin-panel__day-toggle" : "mini admin-panel__day-toggle"}
                  disabled={workScheduleSaving}
                  onClick={() =>
                    setWorkSchedule((prev) => {
                      const current = Array.isArray(prev?.workingDays) ? prev.workingDays : [];
                      const next = active ? current.filter((d) => d !== day) : [...current, day];
                      return {
                        ...prev,
                        workingDays: dayOrder.filter((d) => next.includes(d)),
                      };
                    })
                  }
                >
                  {dayLabels[day]}
                </button>
              );
            })}
          </div>
        </div>
        <button className="mini ok admin-panel__schedule-save" disabled={workScheduleSaving} onClick={saveWorkSchedule}>
          {workScheduleSaving ? "Сохраняю..." : "Сохранить график"}
        </button>
      </div>
      <div className="empty" style={{ marginBottom: 10 }}>
        Рабочее окно: {workSchedule?.workStart || "08:00"}—{workSchedule?.workEnd || "18:00"}, обед {workSchedule?.lunchStart || "12:00"}—{workSchedule?.lunchEnd || "13:00"}.
        {" "}
        Выходные: {(workSchedule?.weekendDays || []).map((d) => dayLabels[d] || d).join(", ") || "нет"}.
        {workSchedule?.updatedAt ? ` Обновлено: ${formatDateTimeRu(workSchedule.updatedAt)}.` : ""}
      </div>
      <div className="admin-panel__head">
        <div className="admin-panel__title">Журнал действий (Audit Log)</div>
        <button
          className="mini"
          disabled={auditLoading}
          onClick={() =>
            loadAuditLog({
              action: auditAction,
              entity: auditEntity,
              limit: auditLimit,
              offset: auditOffset,
            })}
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
          onClick={() => loadAuditLog({ action: auditAction, entity: auditEntity, offset: 0 })}
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
                  entity: auditEntity,
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
                  entity: auditEntity,
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
