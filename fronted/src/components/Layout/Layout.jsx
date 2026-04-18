import React from 'react';
import { Navigation } from '../Navigation/Navigation';

export function Layout({ 
  children, 
  currentView, 
  currentTab, 
  onViewChange, 
  onTabChange, 
  showTabs = false,
  user,
  onSignOut 
}) {
  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">Production CRM</h1>
          {user && (
            <div className="user-info">
              <span className="user-email">{user.email}</span>
              <button className="sign-out-btn" onClick={onSignOut}>
                Выйти
              </button>
            </div>
          )}
        </div>
      </header>

      <Navigation
        currentView={currentView}
        currentTab={currentTab}
        onViewChange={onViewChange}
        onTabChange={onTabChange}
        showTabs={showTabs}
      />

      <main className="app-main">
        {children}
      </main>

      <footer className="app-footer">
        <p>&copy; 2026 Production CRM. Все права защищены.</p>
      </footer>
    </div>
  );
}
