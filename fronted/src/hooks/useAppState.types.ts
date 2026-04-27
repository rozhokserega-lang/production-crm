/**
 * Полный интерфейс возвращаемого значения useAppState().
 *
 * Сгенерирован из return-объекта useAppState.js (строки 1621–1856).
 * Все типы определены inline, т.к. sub-hooks не экспортируют свои интерфейсы.
 */

export interface ExecutorOptions {
  kromka?: string[];
  pras?: string[];
  [key: string]: unknown;
}

export interface UseAppStateReturn {
  // ===== View state =====
  view: string;
  setView: (v: string) => void;
  tab: string;
  setTab: (t: string) => void;
  overviewSubView: string;
  setOverviewSubView: (v: string) => void;
  warehouseSubView: string;
  setWarehouseSubView: (v: string) => void;
  laborSubView: string;
  setLaborSubView: (v: string) => void;
  statsSort: string;
  setStatsSort: (v: string) => void;
  orderDrawerId: string;
  setOrderDrawerId: (v: string) => void;
  actionLoading: string;
  setActionLoading: (v: string) => void;
  isOnline: boolean;
  error: string;
  setError: (v: string) => void;

  // ===== Auth & roles =====
  authEnabled: boolean;
  authEmail: string;
  setAuthEmail: (v: string) => void;
  authPassword: string;
  setAuthPassword: (v: string) => void;
  authSaving: boolean;
  authUser: Record<string, unknown> | null;
  authUserLabel: string;
  signInWithSupabase: () => Promise<void>;
  signOutSupabaseUser: () => Promise<void>;
  crmRole: string;
  crmRoleLabel: string;
  crmAuthStrict: boolean;
  crmAuthStrictSaving: boolean;
  canOperateProduction: boolean;
  canManageOrders: boolean;
  canAdminSettings: boolean;
  crmUsers: Array<{ id: string; email: string; role: string; note?: string }>;
  crmUsersLoading: boolean;
  crmUsersSaving: string;
  newCrmUserId: string;
  setNewCrmUserId: (v: string) => void;
  newCrmUserRole: string;
  setNewCrmUserRole: (v: string) => void;
  newCrmUserNote: string;
  setNewCrmUserNote: (v: string) => void;
  setAuditAction: (v: string) => void;
  setAuditEntity: (v: string) => void;
  auditLog: Array<Record<string, unknown>>;
  auditLoading: boolean;
  auditError: string;
  auditAction: string;
  auditEntity: string;
  auditLimit: number;
  auditOffset: number;
  toggleCrmAuthStrict: () => Promise<void>;
  loadCrmUsers: () => Promise<void>;
  loadAuditLog: (next?: Record<string, unknown>) => Promise<void>;
  updateCrmUserRole: (userId: string, role: string) => Promise<void>;
  removeCrmUserRole: (userId: string) => Promise<void>;
  createCrmUserRole: () => Promise<void>;

  // ===== Data loading =====
  load: () => Promise<void>;
  rows: unknown[];
  setRows: (v: unknown[]) => void;
  query: string;
  setQuery: (v: string) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;

  // ===== Shipment data =====
  shipmentBoard: Record<string, unknown>;
  setShipmentBoard: (v: Record<string, unknown>) => void;
  planCatalogRows: Record<string, unknown>[];
  setPlanCatalogRows: (v: Record<string, unknown>[]) => void;
  sectionCatalogRows: Record<string, unknown>[];
  setSectionCatalogRows: (v: Record<string, unknown>[]) => void;
  sectionArticleRows: Record<string, unknown>[];
  setSectionArticleRows: (v: Record<string, unknown>[]) => void;
  shipmentOrders: Record<string, unknown>[];
  setShipmentOrders: (v: Record<string, unknown>[]) => void;
  materialsStockRows: Record<string, unknown>[];
  setMaterialsStockRows: (v: Record<string, unknown>[]) => void;
  selectedShipments: unknown[];
  setSelectedShipments: (v: unknown[]) => void;
  planPreviews: unknown[];
  setPlanPreviews: (v: unknown[]) => void;
  hoverTip: { visible: boolean; text: string; x: number; y: number };
  setHoverTip: (v: { visible: boolean; text: string; x: number; y: number } | ((prev: { visible: boolean; text: string; x: number; y: number }) => { visible: boolean; text: string; x: number; y: number })) => void;
  weekFilter: string;
  setWeekFilter: (v: string) => void;
  showAwaiting: boolean;
  setShowAwaiting: (v: boolean) => void;
  showOnPilka: boolean;
  setShowOnPilka: (v: boolean) => void;
  showOnKromka: boolean;
  setShowOnKromka: (v: boolean) => void;
  showOnPras: boolean;
  setShowOnPras: (v: boolean) => void;
  showReadyAssembly: boolean;
  setShowReadyAssembly: (v: boolean) => void;
  showAwaitShipment: boolean;
  setShowAwaitShipment: (v: boolean) => void;
  showShipped: boolean;
  setShowShipped: (v: boolean) => void;
  hiddenShipmentGroups: Record<string, boolean>;
  setHiddenShipmentGroups: (v: Record<string, boolean>) => void;
  shipmentSort: string;
  setShipmentSort: (v: string) => void;
  shipmentViewMode: string;
  setShipmentViewMode: (v: string) => void;
  resetShipmentFilters: () => void;
  isSectionCollapsed: (name: string) => boolean;
  toggleSectionCollapsed: (name: string) => void;

  // ===== Dialogs state =====
  consumeDialogOpen: boolean;
  setConsumeDialogOpen: (v: boolean) => void;
  consumeEditMode: boolean;
  setConsumeEditMode: (v: boolean) => void;
  consumeDialogData: Record<string, unknown> | null;
  setConsumeDialogData: (v: Record<string, unknown> | null) => void;
  consumeMaterial: string;
  setConsumeMaterial: (v: string) => void;
  consumeQty: string;
  setConsumeQty: (v: string) => void;
  consumeSaving: boolean;
  setConsumeSaving: (v: boolean) => void;
  consumeError: string;
  setConsumeError: (v: string) => void;
  consumeLoading: boolean;
  setConsumeLoading: (v: boolean) => void;
  strapDialogOpen: boolean;
  setStrapDialogOpen: (v: boolean) => void;
  strapTargetProduct: string;
  setStrapTargetProduct: (v: string) => void;
  strapPlanWeek: string;
  setStrapPlanWeek: (v: string) => void;
  strapDraft: Record<string, string>;
  setStrapDraft: (v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  strapItems: unknown[];
  setStrapItems: (v: unknown[]) => void;
  planDialogOpen: boolean;
  setPlanDialogOpen: (v: boolean) => void;
  planSection: string;
  setPlanSection: (v: string) => void;
  planArticle: string;
  setPlanArticle: (v: string) => void;
  planMaterial: string;
  setPlanMaterial: (v: string) => void;
  planWeek: string;
  setPlanWeek: (v: string) => void;
  planQty: string;
  setPlanQty: (v: string) => void;
  planSaving: boolean;
  setPlanSaving: (v: boolean) => void;

  // ===== Labor state =====
  laborSort: string;
  setLaborSort: (v: string) => void;
  laborPlannerQtyByGroup: Record<string, number>;
  setLaborPlannerQtyByGroup: (v: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  laborRows: unknown[];
  setLaborRows: (v: unknown[]) => void;
  laborImportedRows: unknown[];
  setLaborImportedRows: (v: unknown[]) => void;
  laborSaveSelected: Record<string, boolean>;
  setLaborSaveSelected: (v: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  laborSavingByKey: Record<string, boolean>;
  setLaborSavingByKey: (v: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  laborSavedByKey: Record<string, boolean>;
  setLaborSavedByKey: (v: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;

  // ===== Warehouse data =====
  warehouseRows: Record<string, unknown>[];
  setWarehouseRows: (v: Record<string, unknown>[]) => void;
  leftoversRows: Record<string, unknown>[];
  setLeftoversRows: (v: Record<string, unknown>[]) => void;
  leftoversHistoryRows: Record<string, unknown>[];
  setLeftoversHistoryRows: (v: Record<string, unknown>[]) => void;
  consumeHistoryRows: Record<string, unknown>[];
  setConsumeHistoryRows: (v: Record<string, unknown>[]) => void;
  pilkaDoneHistoryRows: Record<string, unknown>[];
  setPilkaDoneHistoryRows: (v: Record<string, unknown>[]) => void;
  warehouseSyncLoading: boolean;
  leftoversSyncLoading: boolean;

  // ===== Furniture data =====
  furnitureLoading: boolean;
  setFurnitureLoading: (v: boolean) => void;
  furnitureError: string;
  setFurnitureError: (v: string) => void;
  furnitureWorkbook: Record<string, unknown> | null;
  setFurnitureWorkbook: (v: Record<string, unknown> | null) => void;
  furnitureActiveSheet: string;
  setFurnitureActiveSheet: (v: string) => void;
  furnitureShowFormulas: boolean;
  setFurnitureShowFormulas: (v: boolean) => void;
  furnitureArticleRows: Record<string, unknown>[];
  setFurnitureArticleRows: (v: Record<string, unknown>[]) => void;
  furnitureDetailArticleRows: Record<string, unknown>[];
  setFurnitureDetailArticleRows: (v: Record<string, unknown>[]) => void;
  furnitureSelectedProduct: string;
  setFurnitureSelectedProduct: (v: string) => void;
  furnitureSelectedQty: string;
  setFurnitureSelectedQty: (v: string) => void;

  // ===== Refs =====
  importPlanFileRef: React.MutableRefObject<HTMLInputElement | null>;
  importMetalFileRef: React.MutableRefObject<HTMLInputElement | null>;

  // ===== Derived data =====
  weeks: string[];
  sectionOptions: Array<{ value: string; label: string }>;
  sectionArticles: Array<{ value: string; label: string }>;
  articleLookupByItemKey: Record<string, string>;
  resolvedPlanItem: Record<string, unknown> | null;
  furnitureSheetData: Array<Record<string, unknown>>;
  furnitureTemplates: Array<Record<string, unknown>>;
  furnitureSelectedTemplate: Record<string, unknown> | null;
  furnitureQtyNumber: number;
  furnitureGeneratedDetails: Array<Record<string, unknown>>;
  strapOptionsByProduct: Array<{ product: string; options: Array<{ value: string; label: string }> }>;
  strapProductBySizeToken: Record<string, string>;
  strapProductsByArticleCode: Record<string, string>;
  strapProductNames: string[];
  strapOptionsForSelectedProduct: Array<{ value: string; label: string }>;
  workScheduleLoading: boolean;
  workScheduleSaving: boolean;
  workSchedule: Array<{ day: string; start: string; end: string; lunchStart: string; lunchEnd: string; isWorking: boolean }>;
  setWorkSchedule: (v: Array<{ day: string; start: string; end: string; lunchStart: string; lunchEnd: string; isWorking: boolean }>) => void;
  loadWorkSchedule: () => Promise<void>;
  saveWorkSchedule: () => Promise<void>;
  metalStockRows: Array<Record<string, unknown>>;
  metalSavingArticle: string;
  setMetalSavingArticle: (v: string) => void;
  selectedShipmentMetal: { rows: Array<Record<string, unknown>> };
  loadMetalStock: () => Promise<void>;
  loadMetalQueue: () => Promise<void>;
  adjustMetalStock: (article: string, delta: number) => Promise<void>;
  shipmentOrderMaps: Record<string, unknown>;
  orderIndexById: Record<string, unknown>;
  runAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  isActionPending: (key: string) => boolean;
  denyActionByRole: (message: string) => void;
  callBackend: (action: string, payload?: Record<string, unknown>) => Promise<unknown>;
  filtered: unknown[];
  orderDrawerLines: Array<Record<string, unknown>>;
  overviewShippedOnly: boolean;
  visibleCellsForItem: (item: string) => Array<Record<string, unknown>>;
  sortItemsForShipment: (items: string[]) => string[];
  shipmentRenderSections: Array<Record<string, unknown>>;
  kpi: Record<string, unknown>;
  statsGroups: Array<Record<string, unknown>>;
  statsList: Array<Record<string, unknown>>;
  overviewColumns: Array<Record<string, unknown>>;
  shipmentKpi: Record<string, unknown>;
  workshopRows: unknown[];
  shipmentMaterialBalance: Record<string, number>;
  shipmentTableRowsWithStockStatus: Array<Record<string, unknown>>;
  shipmentTableGroupNames: string[];
  shipmentPlanDeficits: Array<Record<string, unknown>>;
  warehouseOrderPlanRows: Array<Record<string, unknown>>;
  laborTableRows: Array<Record<string, unknown>>;
  laborOrdersRows: Array<Record<string, unknown>>;
  laborStageTimelineRows: Array<Record<string, unknown>>;
  laborPlannerRows: Array<Record<string, unknown>>;
  laborKpi: Record<string, unknown>;
  warehouseTableRows: Array<Record<string, unknown>>;
  leftoversTableRows: Array<Record<string, unknown>>;
  consumeHistoryTableRows: Array<Record<string, unknown>>;
  selectedShipmentSummary: Record<string, unknown>;
  sendableSelectedCount: number;
  selectedShipmentStockCheck: Array<Record<string, unknown>>;
  strapCalculation: Array<Record<string, unknown>>;

  // ===== Actions =====
  overrideOrderStageFromDrawer: (orderId: string, stage: string, status: string) => Promise<void>;
  sendSelectedShipmentToWork: () => Promise<void>;
  deleteSelectedShipmentPlan: () => Promise<void>;
  deleteStatsOrder: (order: Record<string, unknown>) => Promise<void>;
  toggleShipmentSelection: (payload: Record<string, unknown>) => void;
  createShelfPlanOrder: (payload: Record<string, unknown>) => Promise<void>;
  previewSelectedShipmentPlan: () => Promise<void>;
  exportSelectedShipmentToExcel: () => void;
  importShipmentPlanFromExcelFile: (file: File) => Promise<void>;
  importMetalFromExcelFile: (file: File) => Promise<void>;
  printWarehouseOrderPlanPdf: () => void;
  saveOrderAdminComment: (text: string) => Promise<void>;
  adminCommentSaving: boolean;

  // ===== Dialog actions =====
  closeConsumeDialog: () => void;
  submitConsume: (materialRaw: string, qtyRaw: string) => Promise<void>;
  openPilkaDoneConsumeDialog: (orderId: string, meta?: Record<string, unknown>) => void;
  openPilkaDoneConsumeDialogOnError: (orderId: string, meta: Record<string, unknown>, error: unknown) => void;
  handlePlanSectionChange: (nextSection: string) => void;
  handlePlanArticleChange: (nextArticle: string) => void;
  openCreatePlanDialog: () => void;
  closeCreatePlanDialog: () => void;
  saveCreatePlanDialog: () => Promise<void>;
  previewCreatePlanDialog: () => void;
  openStrapDialog: () => void;
  saveStrapDialog: () => Promise<void>;

  // ===== Labor actions =====
  importLaborFileRef: React.MutableRefObject<HTMLInputElement | null>;
  exportLaborTotalToExcel: () => void;
  importLaborTotalFromExcelFile: (file: File) => Promise<void>;
  saveImportedLaborRowToDb: (row: Record<string, unknown>) => Promise<void>;

  // ===== Edge sync =====
  syncWarehouseFromGoogleSheet: (params: Record<string, unknown>) => Promise<void>;
  syncLeftoversToGoogleSheet: (params: Record<string, unknown>) => Promise<void>;
  logConsumeToGoogleSheet: (params: Record<string, unknown>) => Promise<void>;
  syncPlanCellToGoogleSheet: (params: Record<string, unknown>) => Promise<void>;

  // ===== Executors =====
  executorByOrder: Record<string, string>;
  setExecutorByOrder: (v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  executorOptions: ExecutorOptions;
}
