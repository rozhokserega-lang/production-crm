import React from 'react';

export function WorkshopTabs({ currentTab, onTabChange, tabs }) {
  return (
    <div className="workshop-tabs">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`tab-btn ${currentTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
