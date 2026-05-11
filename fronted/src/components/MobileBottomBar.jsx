const BOTTOM_NAV = [
  { id: "shipment",  label: "Отгрузка",    icon: "🚚" },
  { id: "workshop",  label: "Произв.",     icon: "⚙️" },
  { id: "overview",  label: "Обзор",       icon: "📋" },
  { id: "warehouse", label: "Склад",       icon: "🏪" },
  { id: "stats",     label: "Статистика",  icon: "📊" },
];

export function MobileBottomBar({ view, setView, setTab }) {
  return (
    <nav className="mobile-bottom-bar" aria-label="Навигация">
      {BOTTOM_NAV.map((v) => (
        <button
          key={v.id}
          className={`mobile-bottom-bar__item${view === v.id ? " active" : ""}`}
          onClick={() => {
            setView(v.id);
            if (v.id === "workshop") setTab("pilka");
          }}
          aria-current={view === v.id ? "page" : undefined}
        >
          <span className="mobile-bottom-bar__icon">{v.icon}</span>
          <span className="mobile-bottom-bar__label">{v.label}</span>
        </button>
      ))}
    </nav>
  );
}
