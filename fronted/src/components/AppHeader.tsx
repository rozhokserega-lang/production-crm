import type { CrmRole } from "../app/appConstants";

interface AppHeaderProps {
  authEnabled: boolean;
  authUserLabel: string;
  authEmail: string;
  setAuthEmail: (value: string) => void;
  authPassword: string;
  setAuthPassword: (value: string) => void;
  authSaving: boolean;
  signInWithSupabase: () => void;
  signOutSupabaseUser: () => void;
  crmRole: string;
  crmRoleLabel: string;
  canAdminSettings: boolean;
  crmAuthStrict: boolean;
  toggleCrmAuthStrict: () => void;
  crmAuthStrictSaving: boolean;
}

export function AppHeader({
  authEnabled,
  authUserLabel,
  authEmail,
  setAuthEmail,
  authPassword,
  setAuthPassword,
  authSaving,
  signInWithSupabase,
  signOutSupabaseUser,
  crmRole,
  crmRoleLabel,
  canAdminSettings,
  crmAuthStrict,
  toggleCrmAuthStrict,
  crmAuthStrictSaving,
}: AppHeaderProps) {
  return (
    <header className="top">
      <h1>Управление производственными заказами</h1>
      <div className="top-actions">
        {authEnabled && (
          <div className="auth-controls">
            {authUserLabel ? (
              <>
                <span className="role-badge role-viewer" title="Текущий авторизованный пользователь Supabase">
                  Вход: {authUserLabel}
                </span>
                <button
                  type="button"
                  className="mini"
                  disabled={authSaving}
                  onClick={signOutSupabaseUser}
                  title="Выйти из текущей Supabase-сессии"
                >
                  {authSaving ? "Выход..." : "Выйти"}
                </button>
              </>
            ) : (
              <>
                <input
                  className="auth-input"
                  type="email"
                  placeholder="Email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  autoComplete="username"
                />
                <input
                  className="auth-input"
                  type="password"
                  placeholder="Пароль"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") signInWithSupabase();
                  }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="mini ok"
                  disabled={authSaving}
                  onClick={signInWithSupabase}
                  title="Войти через Supabase Auth"
                >
                  {authSaving ? "Вход..." : "Войти"}
                </button>
              </>
            )}
          </div>
        )}
        <span className={`role-badge role-${crmRole}`} title="Текущая роль CRM">
          Роль: {crmRoleLabel}
        </span>
        {canAdminSettings && (
          <button
            type="button"
            className={`strict-mode-toggle ${crmAuthStrict ? "enabled" : ""}`}
            onClick={toggleCrmAuthStrict}
            disabled={crmAuthStrictSaving}
            title="Управление строгим режимом авторизации CRM"
          >
            {crmAuthStrictSaving
              ? "Сохраняю..."
              : `Strict mode: ${crmAuthStrict ? "ON" : "OFF"}`}
          </button>
        )}
      </div>
    </header>
  );
}
