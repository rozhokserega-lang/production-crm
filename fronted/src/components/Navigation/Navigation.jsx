import React from 'react';

const VIEWS = [
  { id: "shipment", label: "Отгрузка" },
  { id: "overview", label: "Обзор заказов" },
  { id: "workshop", label: "Производство" },
  { id: "warehouse", label: "Склад" },
  { id: "labor", label: "Трудоемкость" },
  { id: "stats", label: "Статистика" },
  { id: "furniture", label: "Мебель" },
  { id: "admin", label: "Админ" },
];

const TABS = [
  { id: "pilka", label: "Пила" },
  { id: "kromka", label: "Кромка" },
  { id: "pras", label: "Присадка" },
  { id: "assembly", label: "Сборка" },
  { id: "done", label: "Финал" },
];

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
