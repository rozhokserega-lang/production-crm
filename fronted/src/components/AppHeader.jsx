import { useEffect, useState } from "react";

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
}) {
  const [themeMode, setThemeMode] = useState(() => {
    if (typeof window === "undefined") return "classic";
    const saved = String(window.localStorage.getItem("crm_ui_theme") || "").trim();
    return saved === "tech-dark" ? "tech-dark" : "classic";
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", themeMode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("crm_ui_theme", themeMode);
    }
  }, [themeMode]);

  const isTechDark = themeMode === "tech-dark";
  return (
    <header className="top">
      <h1>Управление производственными заказами</h1>
      <div className="top-actions">
        <button
          type="button"
          className="mini tab theme-toggle"
          onClick={() => setThemeMode(isTechDark ? "classic" : "tech-dark")}
          title="Переключить визуальный режим интерфейса"
        >
          {isTechDark ? "Тема: Classic" : "Тема: Tech Dark"}
        </button>
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
