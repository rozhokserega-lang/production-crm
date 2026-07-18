import { useEffect, useRef, useState } from "react";

// Основные пункты (видны в нижнем баре всегда), остальные — в меню «Ещё».
const PRIMARY_NAV = [
  { id: "shipment",  label: "Отгрузка",    icon: "🚚" },
  { id: "workshop",  label: "Цех",         icon: "⚙️" },
  { id: "overview",  label: "Обзор",       icon: "📋" },
  { id: "metalProcess", label: "Металл",   icon: "🔩" },
  { id: "warehouse", label: "Склад",       icon: "🏪" },
];

const SECONDARY_NAV = [
  { id: "floorMap",  label: "Карта",        icon: "🗺" },
  { id: "cutting",   label: "Раскрой",      icon: "✂️" },
  { id: "strapStock",label: "Обвязка",      icon: "🟫" },
  { id: "labor",     label: "Трудоёмкость", icon: "⏱" },
  { id: "stats",     label: "Статистика",   icon: "📊" },
  { id: "furniture", label: "Мебель",       icon: "🪑" },
  { id: "metal",     label: "Металл-кат.",  icon: "⚙" },
  { id: "db",        label: "БД",           icon: "🗃" },
  { id: "admin",     label: "Админ",        icon: "🛠" },
];

export function MobileBottomBar({
  view,
  setView,
  setTab,
  canAccessView,
  defaultWorkshopTab = "pilka",
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  // Закрытие меню «Ещё» по тапу вне его области.
  useEffect(() => {
    if (!moreOpen) return;
    const onDocClick = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
    };
  }, [moreOpen]);

  const filterFn = (v) => typeof canAccessView !== "function" || canAccessView(v.id);
  const primary = PRIMARY_NAV.filter(filterFn);
  const secondary = SECONDARY_NAV.filter(filterFn);

  const isCurrentSecondary = secondary.some((v) => v.id === view);

  const go = (v) => {
    setView(v.id);
    if (v.id === "workshop") setTab(defaultWorkshopTab);
    setMoreOpen(false);
  };

  return (
    <nav className="mobile-bottom-bar" aria-label="Навигация">
      {primary.map((v) => (
        <button
          key={v.id}
          className={`mobile-bottom-bar__item${view === v.id ? " active" : ""}`}
          onClick={() => go(v)}
          aria-current={view === v.id ? "page" : undefined}
        >
          <span className="mobile-bottom-bar__icon">{v.icon}</span>
          <span className="mobile-bottom-bar__label">{v.label}</span>
        </button>
      ))}

      {secondary.length > 0 && (
        <div className="mobile-bottom-bar__more" ref={moreRef}>
          <button
            type="button"
            className={`mobile-bottom-bar__item${moreOpen || isCurrentSecondary ? " active" : ""}`}
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
          >
            <span className="mobile-bottom-bar__icon">⋯</span>
            <span className="mobile-bottom-bar__label">{isCurrentSecondary ? "Ещё •" : "Ещё"}</span>
          </button>
          {moreOpen && (
            <div className="mobile-bottom-bar__more-menu" role="menu">
              {secondary.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`mobile-bottom-bar__more-item${view === v.id ? " active" : ""}`}
                  onClick={() => go(v)}
                  role="menuitem"
                >
                  <span className="mobile-bottom-bar__icon">{v.icon}</span>
                  <span>{v.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

export default MobileBottomBar;
