import { IconSearch, IconCalendar, IconChevronDown, IconAdjustmentsHorizontal, IconPlus } from "@tabler/icons-react";
import { VIEWS } from "../constants/views";

export function Topbar({
  view,
  query,
  setQuery,
  weekFilter,
  setWeekFilter,
  weeks,
  shipmentSort,
  setShipmentSort,
  canOperateProduction,
  openCreatePlanDialog,
  authUserLabel,
  authEnabled,
}) {
  const viewLabel = VIEWS.find((v) => v.id === view)?.label ?? "";

  const allWeeks = !weekFilter || weekFilter === "all" || (Array.isArray(weekFilter) && weekFilter.length === 0);
  const weekLabel = allWeeks
    ? "Все недели"
    : Array.isArray(weekFilter)
      ? weekFilter.length === 1 ? `Неделя ${weekFilter[0]}` : `Нед: ${weekFilter.join(", ")}`
      : `Неделя ${weekFilter}`;

  return (
    <div className="topbar">
      <div className="topbar__title">
        {viewLabel}
      </div>

      {view !== "furniture" && view !== "metalProcess" && (
        <div className="topbar__search">
          <IconSearch size={15} stroke={2} className="topbar__search-icon" />
          <input
            className="topbar__search-input"
            placeholder={view === "shipment" ? "Название или ID..." : "Поиск..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {view !== "warehouse" && view !== "furniture" && view !== "metal" && view !== "metalProcess" && (
        <button className="topbar__week-pill" type="button">
          <IconCalendar size={14} stroke={2} />
          {weekLabel}
          <IconChevronDown size={12} stroke={2} />
        </button>
      )}

      {view === "shipment" && (
        <button className="topbar__btn topbar__btn--ghost" type="button">
          <IconAdjustmentsHorizontal size={14} stroke={2} />
          {shipmentSort === "name" ? "По названию" : shipmentSort === "week" ? "По неделе" : "По цвету"}
        </button>
      )}

      <div className="topbar__spacer" />

      {view === "shipment" && canOperateProduction && (
        <button className="topbar__btn topbar__btn--accent" type="button" onClick={openCreatePlanDialog}>
          <IconPlus size={15} stroke={2.5} />
          Добавить план
        </button>
      )}

      {authEnabled && authUserLabel && (
        <div className="topbar__user" title={authUserLabel}>
          {authUserLabel.slice(0, 2).toUpperCase()}
        </div>
      )}
    </div>
  );
}
