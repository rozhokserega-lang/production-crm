import { VIEWS } from "../app/appConstants";

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
  admin:      "👤",
};

export function ViewSwitcher({ view, setView, setTab, canAdminSettings }) {
  return (
    <section className="view-switch">
      {VIEWS.map((v) => {
        if (v.id === "admin" && !canAdminSettings) return null;
        return (
          <button
            key={v.id}
            className={view === v.id ? "tab active" : "tab"}
            onClick={() => {
              setView(v.id);
              if (v.id === "workshop") setTab("pilka");
            }}
          >
            <span className="view-switch__icon">{VIEW_ICONS[v.id]}</span>
            {v.label}
          </button>
        );
      })}
    </section>
  );
}
