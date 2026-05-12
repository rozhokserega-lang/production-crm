import { VIEWS } from "../app/appConstants";

const VIEW_ICONS = {
  shipment:     "ti-truck-delivery",
  overview:     "ti-layout-kanban",
  workshop:     "ti-tools",
  warehouse:    "ti-building-warehouse",
  strapStock:   "ti-link",
  metal:        "ti-hammer",
  labor:        "ti-clock-hour-4",
  stats:        "ti-chart-bar",
  furniture:    "ti-armchair",
  admin:        "ti-settings",
};

export function ViewSwitcher({ view, setView, setTab, canAdminSettings, packagingInboxCount }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <i className="ti ti-layout-kanban" aria-hidden="true" />
      </div>

      <nav className="sidebar-nav">
        {VIEWS.map((v) => {
          if (v.id === "admin" && !canAdminSettings) return null;
          const icon = VIEW_ICONS[v.id] || "ti-circle";
          const isActive = view === v.id;
          return (
            <button
              key={v.id}
              type="button"
              className={`sidebar-item ${isActive ? "active" : ""}`}
              title={v.label}
              onClick={() => {
                setView(v.id);
                if (v.id === "workshop") setTab("pilka");
              }}
              aria-label={v.label}
            >
              <i className={`ti ${icon}`} aria-hidden="true" />
              {v.id === "warehouse" && Number(packagingInboxCount) > 0 && (
                <span className="sidebar-badge">{packagingInboxCount}</span>
              )}
              <span className="sidebar-tooltip">{v.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
