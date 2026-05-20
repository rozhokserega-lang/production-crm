import { VIEWS } from "../app/appConstants";
import { preloadView } from "../app/preloadViews";

const VIEW_ICONS = {
  shipment:   "🚚",
  overview:   "⊞",
  workshop:   "⚙",
  warehouse:  "🏠",
  strapStock: "🔗",
  metal:      "✦",
  labor:      "⏱",
  stats:      "▮▮",
  furniture:  "🪑",
  db:         "🗄",
  admin:      "👤",
};

export function ViewSwitcher({ view, setView, setTab, canAdminSettings }) {
  return (
    <section className="view-switch">
      {VIEWS.map((v) => {
        if ((v.id === "admin" || v.id === "db") && !canAdminSettings) return null;
        return (
          <button
            key={v.id}
            className={view === v.id ? "tab active" : "tab"}
            onClick={() => {
              setView(v.id);
              if (v.id === "workshop") setTab("pilka");
            }}
            onMouseEnter={() => preloadView(v.id)}
          >
            <span className="view-switch__icon">{VIEW_ICONS[v.id]}</span>
            {v.label}
          </button>
        );
      })}
    </section>
  );
}
