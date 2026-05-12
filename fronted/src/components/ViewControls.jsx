import { useEffect, useMemo, useRef, useState } from "react";
import { TABS } from "../app/appConstants";
import { normalizeWeekFilter } from "../app/weekFilterUtils";

function WeekFilterDropdown({ value, onChange, weeks = [] }) {
  const allWeeksLabel = "\u0412\u0441\u0435 \u043d\u0435\u0434\u0435\u043b\u0438";
  const weekLabel = "\u041d\u0435\u0434\u0435\u043b\u044f";
  const weeksLabel = "\u041d\u0435\u0434\u0435\u043b\u0438";
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = useMemo(() => normalizeWeekFilter(value), [value]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!rootRef.current || rootRef.current.contains(event.target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const setAll = () => onChange("all");
  const toggleWeek = (week) => {
    const key = String(week || "").trim();
    if (!key) return;
    const next = selectedSet.has(key)
      ? selected.filter((x) => x !== key)
      : [...selected, key].sort((a, b) => Number(a) - Number(b));
    onChange(next.length ? next : "all");
  };
  const label = selected.length === 0
    ? allWeeksLabel
    : selected.length === 1
      ? `${weekLabel} ${selected[0]}`
      : `${weeksLabel}: ${selected.join(", ")}`;

  return (
    <div className="week-filter" ref={rootRef}>
      <button
        type="button"
        className={`week-filter__button ${open ? "active" : ""}`}
        onClick={() => setOpen((x) => !x)}
      >
        <span>{label}</span>
        <span className="week-filter__chevron">v</span>
      </button>
      {open && (
        <div className="week-filter__menu">
          <button
            type="button"
            className={selected.length === 0 ? "week-filter__option active" : "week-filter__option"}
            onClick={setAll}
          >
            {allWeeksLabel}
          </button>
          {weeks.map((week) => {
            const key = String(week || "").trim();
            const active = selectedSet.has(key);
            return (
              <button
                key={key}
                type="button"
                className={active ? "week-filter__option active" : "week-filter__option"}
                onClick={() => toggleWeek(key)}
              >
                <span className="week-filter__mark">{active ? "\u2713" : ""}</span>
                <span>{weekLabel} {key}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Недели в стиле topbar (иконки Tabler) — только для панели отгрузки */
function ShipmentWeekFilterTopbar({ value, onChange, weeks = [] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = useMemo(() => normalizeWeekFilter(value), [value]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!rootRef.current || rootRef.current.contains(event.target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const setAll = () => onChange("all");
  const toggleWeek = (week) => {
    const key = String(week || "").trim();
    if (!key) return;
    const next = selectedSet.has(key)
      ? selected.filter((x) => x !== key)
      : [...selected, key].sort((a, b) => Number(a) - Number(b));
    onChange(next.length ? next : "all");
  };
  const label =
    selected.length === 0
      ? "Все недели"
      : selected.length === 1
        ? `Нед. ${selected[0]}`
        : `Нед: ${selected.join(", ")}`;

  return (
    <div className="wf-root" ref={rootRef}>
      <button
        type="button"
        className={`shipment-panel__week-btn ${open ? "active" : ""}`}
        onClick={() => setOpen((x) => !x)}
      >
        <i className="ti ti-calendar" aria-hidden="true" />
        <span>{label}</span>
        <i className="ti ti-chevron-down" aria-hidden="true" />
      </button>
      {open && (
        <div className="wf-menu">
          <button
            type="button"
            className={selected.length === 0 ? "wf-opt active" : "wf-opt"}
            onClick={setAll}
          >
            Все недели
          </button>
          {weeks.map((week) => {
            const key = String(week || "").trim();
            const active = selectedSet.has(key);
            return (
              <button
                key={key}
                type="button"
                className={active ? "wf-opt active" : "wf-opt"}
                onClick={() => toggleWeek(key)}
              >
                {active && <i className="ti ti-check" aria-hidden="true" />}
                {!active && <span className="wf-opt__spacer" />}
                Неделя {key}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const SHIPMENT_STAGE_FILTERS = [
  { key: "showAwaiting", label: "Ожидаю заказ", dot: "#94a3b8" },
  { key: "showOnPilka", label: "На пиле", dot: "#3b82f6" },
  { key: "showOnKromka", label: "На кромке", dot: "#a855f7" },
  { key: "showOnPras", label: "На присадке", dot: "#d946ef" },
  { key: "showReadyAssembly", label: "К сборке", dot: "#eab308" },
  { key: "showAwaitShipment", label: "Ждёт отправку", dot: "#f97316" },
  { key: "showShipped", label: "Отправлено", dot: "#22c55e" },
];

export function ViewControls({
  view,
  overviewSubView,
  setOverviewSubView,
  tab,
  setTab,
  warehouseSubView,
  setWarehouseSubView,
  laborSubView,
  setLaborSubView,
  query,
  setQuery,
  weekFilter,
  setWeekFilter,
  weeks,
  statsSort,
  setStatsSort,
  shipmentSort,
  setShipmentSort,
  laborSort,
  setLaborSort,
  showAwaiting,
  setShowAwaiting,
  showOnPilka,
  setShowOnPilka,
  showOnKromka,
  setShowOnKromka,
  showOnPras,
  setShowOnPras,
  showReadyAssembly,
  setShowReadyAssembly,
  showAwaitShipment,
  setShowAwaitShipment,
  showShipped,
  setShowShipped,
  canOperateProduction,
  openStrapDialog,
  openCreatePlanDialog,
  selectedShipments,
  exportSelectedShipmentToExcel,
  importPlanFileRef,
  actionLoading,
  importShipmentPlanFromExcelFile,
  warehouseSyncLoading,
  loading,
  syncWarehouseFromGoogleSheet,
  leftoversSyncLoading,
  syncLeftoversToGoogleSheet,
  warehouseOrderPlanRows,
  printWarehouseOrderPlanPdf,
  exportLaborTotalToExcel,
  laborTableRows,
  importLaborFileRef,
  importLaborTotalFromExcelFile,
  laborImportedRows,
  setLaborImportedRows,
  setLaborSaveSelected,
  setLaborSavingByKey,
  setLaborSavedByKey,
  importMetalFileRef,
  importMetalFromExcelFile,
  canAdminSettings,
  openManualLaborDialog,
  packagingInboxCount,
  openPackagingDialog,
  showPackagingOnly,
  setShowPackagingOnly,
  canOperateWarehouse,
}) {
  const stageValues = {
    showAwaiting,
    showOnPilka,
    showOnKromka,
    showOnPras,
    showReadyAssembly,
    showAwaitShipment,
    showShipped,
  };
  const stageSetters = {
    showAwaiting: setShowAwaiting,
    showOnPilka: setShowOnPilka,
    showOnKromka: setShowOnKromka,
    showOnPras: setShowOnPras,
    showReadyAssembly: setShowReadyAssembly,
    showAwaitShipment: setShowAwaitShipment,
    showShipped: setShowShipped,
  };

  return (
    <section className="controls">
      {view === "overview" && (
        <div className="tabs tabs--overview-sub">
          <button
            type="button"
            className={overviewSubView === "kanban" ? "tab active" : "tab"}
            onClick={() => setOverviewSubView("kanban")}
          >
            Канбан
          </button>
          <button
            type="button"
            className={overviewSubView === "shipped" ? "tab active" : "tab"}
            onClick={() => setOverviewSubView("shipped")}
          >
            Отгружено
          </button>
        </div>
      )}
      {view === "workshop" && (
        <div className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "tab active" : "tab"}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {view === "warehouse" && (
        <div className="tabs tabs--overview-sub">
          <button
            type="button"
            className={warehouseSubView === "sheets" ? "tab active" : "tab"}
            onClick={() => setWarehouseSubView("sheets")}
          >
            Листы
          </button>
          <button
            type="button"
            className={warehouseSubView === "leftovers" ? "tab active" : "tab"}
            onClick={() => setWarehouseSubView("leftovers")}
          >
            Остатки
          </button>
          <button
            type="button"
            className={warehouseSubView === "history" ? "tab active" : "tab"}
            onClick={() => setWarehouseSubView("history")}
          >
            История списаний
          </button>
          <button
            type="button"
            className="mini ok"
            disabled={warehouseSyncLoading || loading || !canOperateWarehouse}
            onClick={syncWarehouseFromGoogleSheet}
            title="Синхронизировать материалы из основной Google-таблицы склада"
          >
            {warehouseSyncLoading ? "Синхронизация..." : "Синхр. склад"}
          </button>
          <button
            type="button"
            className="mini ok"
            disabled={leftoversSyncLoading || loading || !canOperateWarehouse}
            onClick={() => syncLeftoversToGoogleSheet()}
            title="Выгрузить остатки в лист 'Остатки' Google-таблицы"
          >
            {leftoversSyncLoading ? "Выгрузка..." : "Выгрузить остатки"}
          </button>
          <button
            type="button"
            className="mini"
            disabled={warehouseOrderPlanRows.length === 0 || !canOperateWarehouse}
            onClick={printWarehouseOrderPlanPdf}
            title="Сформировать PDF, что нужно заказать для закрытия плана"
          >
            Что заказать
          </button>
        </div>
      )}
      {view === "labor" && (
        <div className="tabs tabs--overview-sub">
          <button
            type="button"
            className={laborSubView === "total" ? "tab active" : "tab"}
            onClick={() => setLaborSubView("total")}
          >
            Общая
          </button>
          <button
            type="button"
            className={laborSubView === "orders" ? "tab active" : "tab"}
            onClick={() => setLaborSubView("orders")}
          >
            По заказам
          </button>
          <button
            type="button"
            className={laborSubView === "planner" ? "tab active" : "tab"}
            onClick={() => setLaborSubView("planner")}
          >
            Планировщик
          </button>
          <button
            type="button"
            className={laborSubView === "stages" ? "tab active" : "tab"}
            onClick={() => setLaborSubView("stages")}
          >
            Этапы
          </button>
        </div>
      )}
      {view === "metal" && (
        <div className="tabs tabs--overview-sub">
          <button type="button" className="tab active">Наличие</button>
        </div>
      )}
      {view === "metalProcess" && (
        <div className="tabs tabs--overview-sub">
          <button type="button" className="tab active">Металл-процесс</button>
        </div>
      )}
      {view === "shipment" && (
        <div className="shipment-toolbar-panel">
          <div className="shipment-toolbar-panel__main">
            <h2 className="shipment-toolbar-panel__title">Отгрузка</h2>
            <label className="shipment-toolbar-panel__search topbar-search">
              <i className="ti ti-search" aria-hidden="true" />
              <input
                type="search"
                placeholder="Название или ID…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <ShipmentWeekFilterTopbar value={weekFilter} onChange={setWeekFilter} weeks={weeks} />
            <select
              className="shipment-toolbar-panel__sort"
              value={shipmentSort}
              onChange={(e) => setShipmentSort(e.target.value)}
            >
              <option value="name">По названию</option>
              <option value="week">По неделе плана</option>
              <option value="color">По цвету</option>
            </select>
            <div className="shipment-toolbar-panel__actions">
              <button
                type="button"
                className="shipment-toolbar-panel__btn shipment-toolbar-panel__btn--primary"
                disabled={!canOperateProduction}
                onClick={openCreatePlanDialog}
              >
                <i className="ti ti-plus" aria-hidden="true" />
                Добавить план
              </button>
              <button
                type="button"
                className="shipment-toolbar-panel__btn"
                disabled={!canOperateProduction}
                onClick={openStrapDialog}
              >
                <i className="ti ti-link" aria-hidden="true" />
                Обвязку
              </button>
              <button
                type="button"
                className="shipment-toolbar-panel__btn shipment-toolbar-panel__btn--outline shipment-filters__pkg-btn"
                onClick={openPackagingDialog}
                title="Входящие заказы в секцию Упаковка"
              >
                <i className="ti ti-package" aria-hidden="true" />
                Упаковка
                {Number(packagingInboxCount || 0) > 0 && (
                  <span className="pkg-badge">{packagingInboxCount}</span>
                )}
              </button>
              <button
                type="button"
                className="shipment-toolbar-panel__btn"
                disabled={selectedShipments.length === 0}
                onClick={exportSelectedShipmentToExcel}
              >
                <i className="ti ti-download" aria-hidden="true" />
                Excel
              </button>
              <input
                ref={importPlanFileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files && e.target.files[0];
                  importShipmentPlanFromExcelFile(f);
                }}
              />
              <button
                type="button"
                className="shipment-toolbar-panel__btn"
                disabled={actionLoading === "shipment:import" || !canOperateProduction}
                onClick={() => importPlanFileRef.current?.click()}
              >
                <i className="ti ti-upload" aria-hidden="true" />
                {actionLoading === "shipment:import" ? "Импорт..." : "Импорт"}
              </button>
            </div>
          </div>
          <div className="shipment-toolbar-panel__stages">
            <span className="shipment-toolbar-panel__stage-hint">Этап:</span>
            <div className="shipment-toolbar-panel__pills">
              {SHIPMENT_STAGE_FILTERS.map(({ key, label, dot }) => {
                const on = Boolean(stageValues[key]);
                const set = stageSetters[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className={`shipment-stage-pill${on ? " is-on" : ""}`}
                    onClick={() => set(!on)}
                  >
                    <span className="shipment-stage-pill__dot" style={{ background: dot }} />
                    {label}
                  </button>
                );
              })}
              <button
                type="button"
                className={`shipment-stage-pill shipment-stage-pill--pack-only${showPackagingOnly ? " is-on" : ""}`}
                onClick={() => setShowPackagingOnly(!showPackagingOnly)}
              >
                <span className="shipment-stage-pill__dot" style={{ background: "#6366f1" }} />
                Только упаковка
              </button>
            </div>
          </div>
        </div>
      )}
      {view !== "shipment" && (
      <div className="filters">
        {view !== "furniture" && view !== "metalProcess" && (
          <input
            placeholder={view === "warehouse" ? (warehouseSubView === "leftovers" ? "Поиск по цвету или размеру" : warehouseSubView === "history" ? "Поиск: заказ, материал, комментарий" : "Поиск материала") : view === "metal" ? "Поиск по артикулу или названию металла" : "Поиск по названию или ID"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        {view !== "warehouse" && view !== "furniture" && view !== "metal" && view !== "metalProcess" && view !== "shipment" && !(view === "labor" && laborSubView === "stages") && (
          <>
          <WeekFilterDropdown value={weekFilter} onChange={setWeekFilter} weeks={weeks} />
          </>
        )}
        {view === "stats" && (
          <select value={statsSort} onChange={(e) => setStatsSort(e.target.value)}>
            <option value="stage">Сортировка: по этапам</option>
            <option value="readiness">Сортировка: по готовности</option>
            <option value="color">Сортировка: по цвету</option>
            <option value="weekday">Сортировка: по дням недели</option>
          </select>
        )}
        {view === "labor" && laborSubView === "total" && (
          <select value={laborSort} onChange={(e) => setLaborSort(e.target.value)}>
            <option value="total_desc">Трудоемкость: больше времени</option>
            <option value="total_asc">Трудоемкость: меньше времени</option>
            <option value="week">Трудоемкость: по неделе</option>
            <option value="item">Трудоемкость: по изделию</option>
          </select>
        )}
        {view === "labor" && laborSubView === "total" && (
          <div className="filters-right">
            <button className="mini" onClick={exportLaborTotalToExcel} disabled={!laborTableRows.length}>
              Экспорт Excel (общая)
            </button>
            <input
              ref={importLaborFileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                importLaborTotalFromExcelFile(f);
              }}
            />
            <button
              className="mini"
              disabled={actionLoading === "labor:import"}
              onClick={() => importLaborFileRef.current?.click()}
            >
              {actionLoading === "labor:import" ? "Импорт..." : "Импорт Excel (общая)"}
            </button>
            <button
              className="mini"
              disabled={!laborImportedRows.length}
              onClick={() => {
                setLaborImportedRows([]);
                setLaborSaveSelected({});
                setLaborSavingByKey({});
                setLaborSavedByKey({});
              }}
              title="Очистить только импортированные локальные строки"
            >
              Очистить импорт
            </button>
            {canAdminSettings && typeof openManualLaborDialog === "function" && (
              <button className="mini ok" type="button" onClick={openManualLaborDialog}>
                Добавить вручную
              </button>
            )}
          </div>
        )}
        {view === "metal" && (
          <div className="filters-right">
            <input
              ref={importMetalFileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                importMetalFromExcelFile(f);
              }}
            />
            <button
              className="mini"
              disabled={!canOperateProduction || actionLoading === "metal:import"}
              onClick={() => importMetalFileRef.current?.click()}
            >
              {actionLoading === "metal:import" ? "Импорт..." : "Импорт из Excel"}
            </button>
          </div>
        )}
      </div>
      )}
    </section>
  );
}


