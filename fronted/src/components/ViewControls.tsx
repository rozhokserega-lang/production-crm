import { TABS } from "../app/appConstants";

interface ViewControlsProps {
  view: string;
  overviewSubView: string;
  setOverviewSubView: (value: string) => void;
  tab: string;
  setTab: (value: string) => void;
  warehouseSubView: string;
  setWarehouseSubView: (value: string) => void;
  laborSubView: string;
  setLaborSubView: (value: string) => void;
  query: string;
  setQuery: (value: string) => void;
  weekFilter: string;
  setWeekFilter: (value: string) => void;
  weeks: string[];
  statsSort: string;
  setStatsSort: (value: string) => void;
  shipmentSort: string;
  setShipmentSort: (value: string) => void;
  shipmentViewMode: string;
  setShipmentViewMode: (value: string) => void;
  laborSort: string;
  setLaborSort: (value: string) => void;
  showAwaiting: boolean;
  setShowAwaiting: (value: boolean) => void;
  showOnPilka: boolean;
  setShowOnPilka: (value: boolean) => void;
  showOnKromka: boolean;
  setShowOnKromka: (value: boolean) => void;
  showOnPras: boolean;
  setShowOnPras: (value: boolean) => void;
  showReadyAssembly: boolean;
  setShowReadyAssembly: (value: boolean) => void;
  showAwaitShipment: boolean;
  setShowAwaitShipment: (value: boolean) => void;
  showShipped: boolean;
  setShowShipped: (value: boolean) => void;
  resetShipmentFilters: () => void;
  canOperateProduction: boolean;
  openStrapDialog: () => void;
  openCreatePlanDialog: () => void;
  selectedShipments: Record<string, unknown>[];
  exportSelectedShipmentToExcel: () => void;
  importPlanFileRef: React.RefObject<HTMLInputElement>;
  actionLoading: string;
  importShipmentPlanFromExcelFile: (file: File | null) => void;
  warehouseSyncLoading: boolean;
  loading: boolean;
  syncWarehouseFromGoogleSheet: () => void;
  leftoversSyncLoading: boolean;
  syncLeftoversToGoogleSheet: () => void;
  warehouseOrderPlanRows: Record<string, unknown>[];
  printWarehouseOrderPlanPdf: () => void;
  exportLaborTotalToExcel: () => void;
  laborTableRows: Record<string, unknown>[];
  importLaborFileRef: React.RefObject<HTMLInputElement>;
  importLaborTotalFromExcelFile: (file: File | null) => void;
  laborImportedRows: Record<string, unknown>[];
  setLaborImportedRows: (value: Record<string, unknown>[]) => void;
  setLaborSaveSelected: (value: Record<string, boolean>) => void;
  setLaborSavingByKey: (value: Record<string, boolean>) => void;
  setLaborSavedByKey: (value: Record<string, boolean>) => void;
  importMetalFileRef: React.RefObject<HTMLInputElement>;
  importMetalFromExcelFile: (file: File | null) => void;
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
  shipmentViewMode,
  setShipmentViewMode,
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
  resetShipmentFilters,
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
}: ViewControlsProps) {
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
            disabled={warehouseSyncLoading || loading}
            onClick={syncWarehouseFromGoogleSheet}
            title="Синхронизировать материалы из основной Google-таблицы склада"
          >
            {warehouseSyncLoading ? "Синхронизация..." : "Синхр. склад"}
          </button>
          <button
            type="button"
            className="mini ok"
            disabled={leftoversSyncLoading || loading}
            onClick={() => syncLeftoversToGoogleSheet()}
            title="Выгрузить остатки в лист 'Остатки' Google-таблицы"
          >
            {leftoversSyncLoading ? "Выгрузка..." : "Выгрузить остатки"}
          </button>
          <button
            type="button"
            className="mini"
            disabled={warehouseOrderPlanRows.length === 0}
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
      <div className="filters">
        {view !== "furniture" && (
          <input
            placeholder={view === "shipment" ? "Поиск отгрузки: название или ID" : view === "warehouse" ? (warehouseSubView === "leftovers" ? "Поиск по цвету или размеру" : warehouseSubView === "history" ? "Поиск: заказ, материал, комментарий" : "Поиск материала") : view === "metal" ? "Поиск по артикулу или названию металла" : "Поиск по названию или ID"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        {view !== "warehouse" && view !== "furniture" && view !== "metal" && !(view === "labor" && laborSubView === "stages") && (
          <select value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)}>
            <option value="all">Все недели</option>
            {weeks.map((w) => <option key={w} value={w}>Неделя {w}</option>)}
          </select>
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
        {view === "shipment" && (
          <select value={shipmentViewMode} onChange={(e) => setShipmentViewMode(e.target.value)}>
            <option value="table">Вид: таблица</option>
            <option value="cards">Вид: карточки</option>
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
            <button className="mini" onClick={resetShipmentFilters}>
              Сброс фильтров
            </button>
            <button className="mini" disabled={!canOperateProduction} onClick={openStrapDialog}>
              Добавить обвязку
            </button>
            <button className="mini ok" disabled={!canOperateProduction} onClick={openCreatePlanDialog}>
              Добавить план
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
