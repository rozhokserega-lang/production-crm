import React from 'react';
import { VIEWS, TABS } from '../../constants/views';

export function Navigation({ currentView, currentTab, onViewChange, onTabChange, showTabs = false }) {
  return (
    <nav className="navigation">
      <div className="nav-views">
        {VIEWS.map(view => (
          <button
            key={view.id}
            className={`nav-view-btn ${currentView === view.id ? 'active' : ''}`}
            onClick={() => onViewChange(view.id)}
          >
            {view.label}
          </button>
        ))}
      </div>
      
      {showTabs && (
        <div className="nav-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`nav-tab-btn ${currentTab === tab.id ? 'active' : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}

export { VIEWS, TABS };
