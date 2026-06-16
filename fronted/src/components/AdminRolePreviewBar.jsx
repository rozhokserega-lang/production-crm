import { CRM_ROLE_LABELS } from "../app/appConstants";
import { CRM_ROLE_PREVIEW_OPTIONS } from "../hooks/useCrmRolePreview";

export function AdminRolePreviewBar({
  canAdminSettings,
  crmRolePreview,
  crmRolePreviewActive,
  setCrmRolePreview,
  clearCrmRolePreview,
  actualCrmRoleLabel,
}) {
  if (!canAdminSettings) return null;

  return (
    <section className="admin-role-preview no-print" aria-label="Проверка ролей оператора">
      <div className="admin-role-preview__head">
        <span className="admin-role-preview__title">Проверка роли</span>
        {crmRolePreviewActive ? (
          <span className="admin-role-preview__hint">
            Сейчас UI как у «{CRM_ROLE_LABELS[crmRolePreview] || crmRolePreview}». API — как у админа.
          </span>
        ) : (
          <span className="admin-role-preview__hint">
            Переключите вид интерфейса без смены роли в БД ({actualCrmRoleLabel}).
          </span>
        )}
      </div>
      <div className="admin-role-preview__actions">
        {CRM_ROLE_PREVIEW_OPTIONS.map((role) => (
          <button
            key={role}
            type="button"
            className={`admin-role-preview__btn${crmRolePreview === role ? " is-active" : ""}`}
            onClick={() => setCrmRolePreview(role)}
          >
            {CRM_ROLE_LABELS[role] || role}
          </button>
        ))}
        <button
          type="button"
          className={`admin-role-preview__btn admin-role-preview__btn--reset${!crmRolePreviewActive ? " is-active" : ""}`}
          onClick={clearCrmRolePreview}
        >
          Сброс (админ)
        </button>
      </div>
    </section>
  );
}
