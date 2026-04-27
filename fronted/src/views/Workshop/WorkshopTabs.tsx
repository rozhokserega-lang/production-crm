import React from 'react';

interface TabItem {
  id: string;
  label: string;
}

interface WorkshopTabsProps {
  currentTab: string;
  onTabChange: (tabId: string) => void;
  tabs: TabItem[];
}

export function WorkshopTabs({ currentTab, onTabChange, tabs }: WorkshopTabsProps) {
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
