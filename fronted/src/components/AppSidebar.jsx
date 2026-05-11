import {
  IconTruckDelivery,
  IconLayoutKanban,
  IconTools,
  IconBuildingWarehouse,
  IconLink,
  IconStar,
  IconClock,
  IconChartBar,
  IconArmchair,
  IconSettings,
  IconUser,
} from "@tabler/icons-react";

const NAV_ITEMS = [
  { id: "shipment",   Icon: IconTruckDelivery,     label: "Отгрузка" },
  { id: "overview",   Icon: IconLayoutKanban,       label: "Обзор заказов" },
  { id: "workshop",   Icon: IconTools,              label: "Производство" },
  { id: "warehouse",  Icon: IconBuildingWarehouse,  label: "Склад" },
  { id: "strapStock", Icon: IconLink,               label: "Обвязка" },
  { id: "metal",      Icon: IconStar,               label: "Металл" },
  { id: "labor",      Icon: IconClock,              label: "Трудоёмкость" },
  { id: "stats",      Icon: IconChartBar,           label: "Статистика" },
  { id: "furniture",  Icon: IconArmchair,           label: "Мебель" },
];

export function AppSidebar({ view, setView, setTab, canAdminSettings }) {
  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__logo">
        <IconLayoutKanban size={22} stroke={1.8} />
      </div>

      <nav className="app-sidebar__nav">
        {NAV_ITEMS.map(({ id, Icon, label }) => (
          <button
            key={id}
            className={`app-sidebar__item${view === id ? " active" : ""}`}
            onClick={() => { setView(id); if (id === "workshop") setTab("pilka"); }}
            aria-current={view === id ? "page" : undefined}
          >
            <Icon size={22} stroke={1.6} />
            <span className="app-sidebar__tip">{label}</span>
          </button>
        ))}

        {canAdminSettings && (
          <>
            <div className="app-sidebar__sep" />
            <button
              className={`app-sidebar__item${view === "admin" ? " active" : ""}`}
              onClick={() => setView("admin")}
            >
              <IconSettings size={22} stroke={1.6} />
              <span className="app-sidebar__tip">Админ</span>
            </button>
          </>
        )}
      </nav>

      <div className="app-sidebar__footer">
        <div className="app-sidebar__avatar">
          <IconUser size={16} stroke={2} />
        </div>
      </div>
    </aside>
  );
}
