import { useEffect, useMemo, useRef, useState } from "react";
import { TABS } from "../app/appConstants";
import { findPlanMonthByWeekFilter } from "../app/overviewPlansHelpers";
import {
  isShipmentSpecialWeek,
  normalizeWeekFilter,
  SHIPMENT_SPECIAL_WEEKS,
} from "../app/weekFilterUtils";
import { useWorkshopQrScan } from "../hooks/useWorkshopQrScan";

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

function sortWeekFilterKeys(keys) {
  return [...keys].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return String(a).localeCompare(String(b), "ru", { numeric: true });
  });
}

function formatNumericWeekFilterLabel(selected) {
  if (!selected.length) return "Все недели";
  if (selected.length === 1) return `Нед. ${selected[0]}`;
  const nums = selected.map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (nums.length === selected.length && nums.length >= 2) {
    const consecutive = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
    if (consecutive) return `Нед. ${nums[0]}–${nums[nums.length - 1]}`;
  }
  if (selected.length > 2) return `Нед: ${selected.length} шт.`;
  return `Нед: ${selected.join(", ")}`;
}

function ShipmentSpecialWeekButtons({ value, onChange }) {
  const selected = useMemo(() => normalizeWeekFilter(value), [value]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggleWeek = (week) => {
    const key = String(week || "").trim();
    if (!key) return;
    const next = selectedSet.has(key)
      ? selected.filter((x) => x !== key)
      : sortWeekFilterKeys([...selected, key]);
    onChange(next.length ? next : "all");
  };

  return (
    <div className="shipment-toolbar-panel__special-weeks">
      {SHIPMENT_SPECIAL_WEEKS.map((key) => (
        <button
          key={key}
          type="button"
          className={`shipment-toolbar-panel__week-chip${selectedSet.has(key) ? " is-active" : ""}`}
          onClick={() => toggleWeek(key)}
          title={key === "обвязка" ? "Неделя обвязка" : "Неделя X (упаковка)"}
        >
          {key}
        </button>
      ))}
    </div>
  );
}

/** Недели в стиле topbar (иконки Tabler) — только для панели отгрузки */
function ShipmentWeekFilterTopbar({ value, onChange, weeks = [] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = useMemo(() => normalizeWeekFilter(value), [value]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const numericWeeks = useMemo(
    () =>
      weeks
        .map((week) => String(week || "").trim())
        .filter((week) => week && !isShipmentSpecialWeek(week))
        .sort((a, b) => Number(a) - Number(b)),
    [weeks],
  );
  const numericSelected = useMemo(
    () => selected.filter((week) => !isShipmentSpecialWeek(week)),
    [selected],
  );

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
      : sortWeekFilterKeys([...selected, key]);
    onChange(next.length ? next : "all");
  };
  const label = formatNumericWeekFilterLabel(numericSelected);
  const labelTitle =
    numericSelected.length > 2 ? `Недели: ${numericSelected.join(", ")}` : undefined;

  return (
    <div className="wf-root" ref={rootRef}>
      <button
        type="button"
        className={`shipment-panel__week-btn shipment-panel__week-btn--filter ${open ? "active" : ""}`}
        onClick={() => setOpen((x) => !x)}
        title={labelTitle}
      >
        <i className="ti ti-calendar" aria-hidden="true" />
        <span className="shipment-panel__week-btn-label">{label}</span>
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
          {numericWeeks.map((week) => {
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

function ShipmentMonthFilterTopbar({ months = [], loading = false, weekFilter, setWeekFilter }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const activeMonth = useMemo(() => findPlanMonthByWeekFilter(months, weekFilter), [months, weekFilter]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!rootRef.current || rootRef.current.contains(event.target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const label = loading && !months.length
    ? "Месяцы…"
    : activeMonth?.name || "Все месяцы";

  return (
    <div className="wf-root shipment-month-filter" ref={rootRef}>
      <button
        type="button"
        className={`shipment-panel__week-btn shipment-panel__month-btn ${open ? "active" : ""}${activeMonth ? " is-selected" : ""}`}
        onClick={() => setOpen((x) => !x)}
        title="Фильтр по месяцу плана"
      >
        <i className="ti ti-calendar-month" aria-hidden="true" />
        <span>{label}</span>
        <i className="ti ti-chevron-down" aria-hidden="true" />
      </button>
      {open && (
        <div className="wf-menu wf-menu--months">
          <button
            type="button"
            className={!activeMonth ? "wf-opt active" : "wf-opt"}
            onClick={() => {
              setWeekFilter("all");
              setOpen(false);
            }}
          >
            Все месяцы
          </button>
          {months.map((month) => {
            const active = String(activeMonth?.id) === String(month.id);
            const weeksLabel = (month.weeks || []).join(", ");
            return (
              <button
                key={month.id}
                type="button"
                className={active ? "wf-opt active wf-opt--month" : "wf-opt wf-opt--month"}
                onClick={() => {
                  setWeekFilter(month.weeks?.length ? [...month.weeks] : "all");
                  setOpen(false);
                }}
              >
                {active && <i className="ti ti-check" aria-hidden="true" />}
                {!active && <span className="wf-opt__spacer" />}
                <span className="wf-opt__month-body">
                  <span className="wf-opt__month-name">{month.name}</span>
                  {weeksLabel ? (
                    <span className="wf-opt__month-weeks">Планы {weeksLabel}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
          {!loading && !months.length ? (
            <div className="wf-opt wf-opt--hint">
              Месяцы создаются в разделе «Обзор заказов» → «Планы»
            </div>
          ) : null}
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
  setWorkshopQrScan,
  weekFilter,
  setWeekFilter,
  weeks,
  planMonths,
  planMonthsLoading,
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
  const workshopQrSearchInputRef = useRef(null);
  const {
    show: showWorkshopQr,
    active: workshopQrActive,
    toggle: toggleWorkshopQr,
    scanHint: workshopQrScanHint,
    searchPlaceholder: workshopQrSearchPlaceholder,
    searchClassName: workshopQrSearchClassName,
    handleSearchKeyDown: handleWorkshopQrSearchKeyDown,
    handleSearchChange: handleWorkshopQrSearchChange,
  } = useWorkshopQrScan({
    view,
    tab,
    setQuery,
    setWorkshopQrScan,
    searchInputRef: workshopQrSearchInputRef,
  });

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
          <button
            type="button"
            className={overviewSubView === "plans" ? "tab active" : "tab"}
            onClick={() => setOverviewSubView("plans")}
          >
            Планы
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
            disabled={warehouseSyncLoading || !canOperateWarehouse}
            onClick={syncWarehouseFromGoogleSheet}
            title={
              !canOperateWarehouse
                ? "Нужны роль «Админ» или «Склад» и действующая сессия. Выйдите и войдите снова при зависшей авторизации."
                : "Синхронизировать материалы из основной Google-таблицы склада"
            }
          >
            {warehouseSyncLoading ? "Синхронизация..." : "Синхр. склад"}
          </button>
          <button
            type="button"
            className="mini ok"
            disabled={leftoversSyncLoading || !canOperateWarehouse}
            onClick={() => syncLeftoversToGoogleSheet()}
            title={
              !canOperateWarehouse
                ? "Нужны роль «Админ» или «Склад» и действующая сессия. Выйдите и войдите снова при зависшей авторизации."
                : "Выгрузить остатки в лист 'Остатки' Google-таблицы"
            }
          >
            {leftoversSyncLoading ? "Выгрузка..." : "Выгрузить остатки"}
          </button>
          <button
            type="button"
            className="mini"
            disabled={warehouseOrderPlanRows.length === 0 || !canOperateWarehouse}
            onClick={printWarehouseOrderPlanPdf}
            title={
              !canOperateWarehouse
                ? "Нужны роль «Админ» или «Склад» и действующая сессия."
                : warehouseOrderPlanRows.length === 0
                  ? "Нет позиций в плане заказа для этого отчёта."
                  : "Сформировать PDF, что нужно заказать для закрытия плана"
            }
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
            className={laborSubView === "forecast" ? "tab active" : "tab"}
            onClick={() => setLaborSubView("forecast")}
          >
            Прогноз
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
            <div className="shipment-toolbar-panel__filters">
              <label className="shipment-toolbar-panel__search topbar-search">
                <i className="ti ti-search" aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Поиск…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <ShipmentMonthFilterTopbar
                months={planMonths}
                loading={planMonthsLoading}
                weekFilter={weekFilter}
                setWeekFilter={setWeekFilter}
              />
              <ShipmentWeekFilterTopbar value={weekFilter} onChange={setWeekFilter} weeks={weeks} />
              <select
                className="shipment-toolbar-panel__sort"
                value={shipmentSort}
                onChange={(e) => setShipmentSort(e.target.value)}
              >
                <option value="name">По названию</option>
                <option value="week">По неделе</option>
                <option value="color">По цвету</option>
              </select>
              <ShipmentSpecialWeekButtons value={weekFilter} onChange={setWeekFilter} />
            </div>
            <div className="shipment-toolbar-panel__actions">
              <button
                type="button"
                className="shipment-toolbar-panel__btn shipment-toolbar-panel__btn--primary"
                disabled={!canOperateProduction}
                onClick={openCreatePlanDialog}
                title="Добавить план"
              >
                <i className="ti ti-plus" aria-hidden="true" />
                План
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
        {view !== "furniture" && view !== "metalProcess" && view !== "db" && (
          <input
            ref={workshopQrSearchInputRef}
            className={workshopQrSearchClassName}
            placeholder={
              view === "warehouse"
                ? warehouseSubView === "leftovers"
                  ? "Поиск по цвету или размеру"
                  : warehouseSubView === "history"
                    ? "Поиск: заказ, материал, комментарий"
                    : "Поиск материала"
                : view === "metal"
                  ? "Поиск по артикулу или названию металла"
                  : workshopQrActive
                    ? workshopQrSearchPlaceholder
                    : "Поиск по названию или ID"
            }
            value={query}
            onChange={(e) => handleWorkshopQrSearchChange(e.target.value)}
            onKeyDown={handleWorkshopQrSearchKeyDown}
          />
        )}
        {view !== "warehouse" && view !== "furniture" && view !== "metal" && view !== "metalProcess" && view !== "shipment" && view !== "db" && !(view === "labor" && laborSubView === "stages") && (
          <>
          <WeekFilterDropdown value={weekFilter} onChange={setWeekFilter} weeks={weeks} />
          {showWorkshopQr && (
            <button
              type="button"
              className={`workshop-qr-scan-toggle${workshopQrActive ? " is-active" : ""}`}
              onClick={toggleWorkshopQr}
              title={workshopQrActive ? "Выключить сканирование QR" : "Сканировать QR-код заказа"}
              aria-pressed={workshopQrActive}
              aria-label={workshopQrActive ? "Выключить сканирование QR" : "Сканировать QR-код заказа"}
            >
              <i className="ti ti-qrcode" aria-hidden="true" />
            </button>
          )}
          {workshopQrScanHint && (
            <span className="workshop-qr-scan-hint" role="status">
              {workshopQrScanHint}
            </span>
          )}
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

