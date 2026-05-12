import { useEffect, useMemo, useRef, useState } from "react";
import { TABS } from "../app/appConstants";
import { normalizeWeekFilter } from "../app/weekFilterUtils";

function WeekFilterDropdown({ value, onChange, weeks = [] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = useMemo(() => normalizeWeekFilter(value), [value]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (!rootRef.current || rootRef.current.contains(e.target)) return;
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
    ? "Все недели"
    : selected.length === 1
      ? `Нед. ${selected[0]}`
      : `Нед: ${selected.join(", ")}`;

  return (
    <div className="wf-root" ref={rootRef}>
      <button type="button" className={`topbar-select ${open ? "active" : ""}`} onClick={() => setOpen(x => !x)}>
        <i className="ti ti-calendar" aria-hidden="true" />
        <span>{label}</span>
        <i className="ti ti-chevron-down" aria-hidden="true" />
      </button>
      {open && (
        <div className="wf-menu">
          <button type="button" className={selected.length === 0 ? "wf-opt active" : "wf-opt"} onClick={setAll}>
            Все недели
          </button>
          {weeks.map((week) => {
            const key = String(week || "").trim();
            const active = selectedSet.has(key);
            return (
              <button key={key} type="button" className={active ? "wf-opt active" : "wf-opt"} onClick={() => toggleWeek(key)}>
                {active && <i className="ti ti-check" aria-hidden="true" />}
                {!active && <span style={{display:"inline-block",width:14}} />}
                Неделя {key}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const STAGE_FILTERS = [
  { key: "showAwaiting",     label: "Ожидаю заказ",   color: "#94a3b8" },
  { key: "showOnPilka",      label: "На пиле",         color: "#3b82f6" },
  { key: "showOnKromka",     label: "На кромке",       color: "#8b5cf6" },
  { key: "showOnPras",       label: "На присадке",     color: "#d946ef" },
  { key: "showReadyAssembly",label: "К сборке",        color: "#f59e0b" },
  { key: "showAwaitShipment",label: "Ждёт отправку",   color: "#f97316" },
  { key: "showShipped",      label: "Отправлено",      color: "#10b981" },
];

export function ViewControls({
  view,
  overviewSubView, setOverviewSubView,
  tab, setTab,
  warehouseSubView, setWarehouseSubView,
  laborSubView, setLaborSubView,
  query, setQuery,
  weekFilter, setWeekFilter,
  weeks,
  statsSort, setStatsSort,
  shipmentSort, setShipmentSort,
  laborSort, setLaborSort,
  showAwaiting, setShowAwaiting,
  showOnPilka, setShowOnPilka,
  showOnKromka, setShowOnKromka,
  showOnPras, setShowOnPras,
  showReadyAssembly, setShowReadyAssembly,
  showAwaitShipment, setShowAwaitShipment,
  showShipped, setShowShipped,
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
  const stageValues = { showAwaiting, showOnPilka, showOnKromka, showOnPras, showReadyAssembly, showAwaitShipment, showShipped };
  const stageSetters = { showAwaiting: setShowAwaiting, showOnPilka: setShowOnPilka, showOnKromka: setShowOnKromka, showOnPras: setShowOnPras, showReadyAssembly: setShowReadyAssembly, showAwaitShipment: setShowAwaitShipment, showShipped: setShowShipped };

  const VIEW_TITLES = {
    shipment: "Отгрузка",
    overview: "Обзор заказов",
    workshop: "Производство",
    warehouse: "Склад",
    strapStock: "Обвязка",
    metal: "Металл",
    labor: "Трудоёмкость",
    stats: "Статистика",
    furniture: "Мебель",
    admin: "Администрирование",
  };

  return (
    <div className="topbar-wrap">
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">{VIEW_TITLES[view] || ""}</span>

          {view === "overview" && (
            <div className="subtabs">
              <button type="button" className={overviewSubView === "kanban" ? "subtab active" : "subtab"} onClick={() => setOverviewSubView("kanban")}>Канбан</button>
              <button type="button" className={overviewSubView === "shipped" ? "subtab active" : "subtab"} onClick={() => setOverviewSubView("shipped")}>Отгружено</button>
            </div>
          )}
          {view === "workshop" && (
            <div className="subtabs">
              {TABS.map(t => (
                <button key={t.id} type="button" className={tab === t.id ? "subtab active" : "subtab"} onClick={() => setTab(t.id)}>{t.label}</button>
              ))}
            </div>
          )}
          {view === "warehouse" && (
            <div className="subtabs">
              <button type="button" className={warehouseSubView === "sheets" ? "subtab active" : "subtab"} onClick={() => setWarehouseSubView("sheets")}>Листы</button>
              <button type="button" className={warehouseSubView === "leftovers" ? "subtab active" : "subtab"} onClick={() => setWarehouseSubView("leftovers")}>Остатки</button>
              <button type="button" className={warehouseSubView === "history" ? "subtab active" : "subtab"} onClick={() => setWarehouseSubView("history")}>История</button>
              <button type="button" className={warehouseSubView === "missing" ? "subtab active" : "subtab"} onClick={() => setWarehouseSubView("missing")}>Замена деталей</button>
            </div>
          )}
          {view === "labor" && (
            <div className="subtabs">
              <button type="button" className={laborSubView === "total" ? "subtab active" : "subtab"} onClick={() => setLaborSubView("total")}>Общая</button>
              <button type="button" className={laborSubView === "orders" ? "subtab active" : "subtab"} onClick={() => setLaborSubView("orders")}>По заказам</button>
              <button type="button" className={laborSubView === "planner" ? "subtab active" : "subtab"} onClick={() => setLaborSubView("planner")}>Планировщик</button>
              <button type="button" className={laborSubView === "stages" ? "subtab active" : "subtab"} onClick={() => setLaborSubView("stages")}>Этапы</button>
            </div>
          )}
        </div>

        <div className="topbar-right">
          {view !== "furniture" && view !== "metalProcess" && (
            <div className="topbar-search">
              <i className="ti ti-search" aria-hidden="true" />
              <input
                type="text"
                placeholder={
                  view === "shipment" ? "Название или ID..." :
                  view === "warehouse" ? (warehouseSubView === "leftovers" ? "Цвет или размер..." : "Материал...") :
                  view === "metal" ? "Артикул или название..." :
                  "Поиск..."
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button type="button" className="search-clear" onClick={() => setQuery("")} aria-label="Очистить">
                  <i className="ti ti-x" aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          {view !== "warehouse" && view !== "furniture" && view !== "metal" && view !== "metalProcess" && !(view === "labor" && laborSubView === "stages") && (
            <WeekFilterDropdown value={weekFilter} onChange={setWeekFilter} weeks={weeks} />
          )}

          {view === "stats" && (
            <select className="topbar-select-plain" value={statsSort} onChange={(e) => setStatsSort(e.target.value)}>
              <option value="stage">По этапам</option>
              <option value="readiness">По готовности</option>
              <option value="color">По цвету</option>
              <option value="weekday">По дням недели</option>
            </select>
          )}
          {view === "shipment" && (
            <select className="topbar-select-plain" value={shipmentSort} onChange={(e) => setShipmentSort(e.target.value)}>
              <option value="name">По названию</option>
              <option value="week">По неделе</option>
              <option value="color">По цвету</option>
            </select>
          )}
          {view === "labor" && laborSubView === "total" && (
            <select className="topbar-select-plain" value={laborSort} onChange={(e) => setLaborSort(e.target.value)}>
              <option value="total_desc">Больше времени</option>
              <option value="total_asc">Меньше времени</option>
              <option value="week">По неделе</option>
              <option value="item">По изделию</option>
            </select>
          )}

          {view === "shipment" && (
            <>
              <button type="button" className="topbar-btn ok" disabled={!canOperateProduction} onClick={openCreatePlanDialog}>
                <i className="ti ti-plus" aria-hidden="true" /> Добавить план
              </button>
              <button type="button" className="topbar-btn" disabled={!canOperateProduction} onClick={openStrapDialog}>
                <i className="ti ti-link" aria-hidden="true" /> Обвязку
              </button>
              <button type="button" className="topbar-btn pkg-btn" onClick={openPackagingDialog}>
                <i className="ti ti-package" aria-hidden="true" />
                Упаковка
                {Number(packagingInboxCount) > 0 && <span className="topbar-badge">{packagingInboxCount}</span>}
              </button>
              <div className="topbar-sep" />
              <button type="button" className="topbar-btn" disabled={selectedShipments.length === 0} onClick={exportSelectedShipmentToExcel}>
                <i className="ti ti-download" aria-hidden="true" /> Excel
              </button>
              <input ref={importPlanFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; importShipmentPlanFromExcelFile(f); }} />
              <button type="button" className="topbar-btn" disabled={actionLoading === "shipment:import" || !canOperateProduction} onClick={() => importPlanFileRef.current?.click()}>
                <i className="ti ti-upload" aria-hidden="true" /> {actionLoading === "shipment:import" ? "Импорт..." : "Импорт"}
              </button>
            </>
          )}

          {view === "warehouse" && (
            <>
              <button type="button" className="topbar-btn ok" disabled={warehouseSyncLoading || loading || !canOperateWarehouse} onClick={syncWarehouseFromGoogleSheet}>
                <i className="ti ti-refresh" aria-hidden="true" /> {warehouseSyncLoading ? "Синхр..." : "Синхр. склад"}
              </button>
              <button type="button" className="topbar-btn" disabled={leftoversSyncLoading || loading || !canOperateWarehouse} onClick={() => syncLeftoversToGoogleSheet()}>
                <i className="ti ti-download" aria-hidden="true" /> {leftoversSyncLoading ? "Выгрузка..." : "Остатки"}
              </button>
              <button type="button" className="topbar-btn" disabled={warehouseOrderPlanRows.length === 0 || !canOperateWarehouse} onClick={printWarehouseOrderPlanPdf}>
                <i className="ti ti-file-text" aria-hidden="true" /> Что заказать
              </button>
            </>
          )}

          {view === "labor" && laborSubView === "total" && (
            <>
              <button type="button" className="topbar-btn" disabled={!laborTableRows.length} onClick={exportLaborTotalToExcel}>
                <i className="ti ti-download" aria-hidden="true" /> Excel
              </button>
              <input ref={importLaborFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; importLaborTotalFromExcelFile(f); }} />
              <button type="button" className="topbar-btn" disabled={actionLoading === "labor:import"} onClick={() => importLaborFileRef.current?.click()}>
                <i className="ti ti-upload" aria-hidden="true" /> {actionLoading === "labor:import" ? "Импорт..." : "Импорт"}
              </button>
              <button type="button" className="topbar-btn" disabled={!laborImportedRows.length} onClick={() => { setLaborImportedRows([]); setLaborSaveSelected({}); setLaborSavingByKey({}); setLaborSavedByKey({}); }}>
                <i className="ti ti-x" aria-hidden="true" /> Очистить
              </button>
              {canAdminSettings && typeof openManualLaborDialog === "function" && (
                <button type="button" className="topbar-btn ok" onClick={openManualLaborDialog}>
                  <i className="ti ti-plus" aria-hidden="true" /> Добавить
                </button>
              )}
            </>
          )}

          {view === "metal" && (
            <>
              <input ref={importMetalFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; importMetalFromExcelFile(f); }} />
              <button type="button" className="topbar-btn" disabled={!canOperateProduction || actionLoading === "metal:import"} onClick={() => importMetalFileRef.current?.click()}>
                <i className="ti ti-upload" aria-hidden="true" /> {actionLoading === "metal:import" ? "Импорт..." : "Импорт Excel"}
              </button>
            </>
          )}
        </div>
      </div>

      {view === "shipment" && (
        <div className="stage-filters">
          <span className="stage-filters-label">Этап:</span>
          {STAGE_FILTERS.map(({ key, label, color }) => (
            <button
              key={key}
              type="button"
              className={`stage-pill ${stageValues[key] ? "on" : ""}`}
              onClick={() => stageSetters[key](!stageValues[key])}
              style={{ "--pill-color": color }}
            >
              <span className="pill-dot" />
              {label}
            </button>
          ))}
          <div className="topbar-sep" />
          <button
            type="button"
            className={`stage-pill ${showPackagingOnly ? "on" : ""}`}
            style={{ "--pill-color": "#6366f1" }}
            onClick={() => setShowPackagingOnly(!showPackagingOnly)}
          >
            <span className="pill-dot" />
            Только упаковка
          </button>
        </div>
      )}
    </div>
  );
}
