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
  canOperateWarehouse,
}) {
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
      <div className="filters">
        {view !== "furniture" && view !== "metalProcess" && (
          <input
            placeholder={view === "shipment" ? "Поиск отгрузки: название или ID" : view === "warehouse" ? (warehouseSubView === "leftovers" ? "Поиск по цвету или размеру" : warehouseSubView === "history" ? "Поиск: заказ, материал, комментарий" : "Поиск материала") : view === "metal" ? "Поиск по артикулу или названию металла" : "Поиск по названию или ID"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        {view !== "warehouse" && view !== "furniture" && view !== "metal" && view !== "metalProcess" && !(view === "labor" && laborSubView === "stages") && (
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
        {view === "shipment" && (
          <select value={shipmentSort} onChange={(e) => setShipmentSort(e.target.value)}>
            <option value="name">Сортировка: по названию</option>
            <option value="week">Сортировка: по неделе плана</option>
            <option value="color">Сортировка: по цвету</option>
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
        {view === "shipment" && (
          <div className="filters-right">
            <label className="empty-only-toggle">
              <input
                type="checkbox"
                checked={showAwaiting}
                onChange={(e) => setShowAwaiting(e.target.checked)}
              />
              <span>Ожидаю заказ</span>
            </label>
            <label className="empty-only-toggle">
              <input
                type="checkbox"
                checked={showOnPilka}
                onChange={(e) => setShowOnPilka(e.target.checked)}
              />
              <span>На пиле</span>
            </label>
            <label className="empty-only-toggle">
              <input
                type="checkbox"
                checked={showOnKromka}
                onChange={(e) => setShowOnKromka(e.target.checked)}
              />
              <span>На кромке</span>
            </label>
            <label className="empty-only-toggle">
              <input
                type="checkbox"
                checked={showOnPras}
                onChange={(e) => setShowOnPras(e.target.checked)}
              />
              <span>На присадке</span>
            </label>
            <label className="empty-only-toggle">
              <input
                type="checkbox"
                checked={showReadyAssembly}
                onChange={(e) => setShowReadyAssembly(e.target.checked)}
              />
              <span>Готовы к сборке</span>
            </label>
            <label className="empty-only-toggle">
              <input
                type="checkbox"
                checked={showAwaitShipment}
                onChange={(e) => setShowAwaitShipment(e.target.checked)}
              />
              <span>Ждёт отправку</span>
            </label>
            <label className="empty-only-toggle">
              <input
                type="checkbox"
                checked={showShipped}
                onChange={(e) => setShowShipped(e.target.checked)}
              />
              <span>Отправленные</span>
            </label>
            <button className="mini" disabled={!canOperateProduction} onClick={openStrapDialog}>
              Добавить обвязку
            </button>
            <button className="mini ok" disabled={!canOperateProduction} onClick={openCreatePlanDialog}>
              Добавить план
            </button>
            <button
              className="mini"
              type="button"
              onClick={openPackagingDialog}
              title="Входящие заказы в секцию Упаковка"
            >
              Упаковка{Number(packagingInboxCount || 0) > 0 ? ` (${packagingInboxCount})` : ""}
            </button>
            <button
              className="mini"
              disabled={selectedShipments.length === 0}
              onClick={exportSelectedShipmentToExcel}
            >
              Экспорт в Excel
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
              className="mini"
              disabled={actionLoading === "shipment:import" || !canOperateProduction}
              onClick={() => importPlanFileRef.current?.click()}
            >
              {actionLoading === "shipment:import" ? "Импорт..." : "Импорт из Excel"}
            </button>
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
    </section>
  );
}


