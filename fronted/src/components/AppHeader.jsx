import { useEffect } from "react";

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
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.removeAttribute("data-theme");
    try { window.localStorage.removeItem("crm_ui_theme"); } catch (_) {}
  }, []);

  const initials = authUserLabel
    ? authUserLabel.slice(0, 2).toUpperCase()
    : (crmRoleLabel || "??").slice(0, 2).toUpperCase();

  return (
    <div className="sidebar-auth">
      {authEnabled && !authUserLabel && (
        <div className="sidebar-login">
          <input
            className="sidebar-input"
            type="email"
            placeholder="Email"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            autoComplete="username"
          />
          <input
            className="sidebar-input"
            type="password"
            placeholder="Пароль"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") signInWithSupabase(); }}
            autoComplete="current-password"
          />
          <button
            type="button"
            className="sidebar-login-btn"
            disabled={authSaving}
            onClick={signInWithSupabase}
          >
            {authSaving ? "Вход..." : "Войти"}
          </button>
        </div>
      )}

      {(!authEnabled || authUserLabel) && (
        <div className="sidebar-user-block">
          <div className={`sidebar-avatar role-${crmRole}`} title={`${crmRoleLabel}${authUserLabel ? ": " + authUserLabel : ""}`}>
            {initials}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-role">{crmRoleLabel}</div>
            {authUserLabel && (
              <div className="sidebar-user-email" title={authUserLabel}>{authUserLabel}</div>
            )}
          </div>
        </div>
      )}

      {authEnabled && authUserLabel && (
        <button
          type="button"
          className="sidebar-logout-btn"
          disabled={authSaving}
          onClick={signOutSupabaseUser}
          title="Выйти"
        >
          <i className="ti ti-logout" aria-hidden="true" />
        </button>
      )}

      {canAdminSettings && (
        <button
          type="button"
          className={`sidebar-strict-btn ${crmAuthStrict ? "on" : ""}`}
          onClick={toggleCrmAuthStrict}
          disabled={crmAuthStrictSaving}
          title={`Strict mode: ${crmAuthStrict ? "ON" : "OFF"}`}
        >
          <i className={`ti ti-shield${crmAuthStrict ? "-check" : ""}`} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
