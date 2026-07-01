import { callBackend } from "../api";

/**
 * Единый сервисный слой для всех API-вызовов.
 * Все компоненты и хуки должны использовать OrderService, а не callBackend напрямую.
 */
export class OrderService {
  // ==================== Заказы ====================

  static async getAllOrders() {
    return await callBackend("webGetOrdersAll");
  }

  static async getWarehouseKitOrders() {
    return await callBackend("webGetWarehouseKitOrders");
  }

  static async setWarehouseKitInWork(orderId) {
    return await callBackend("webSetWarehouseKitInWork", { orderId });
  }

  static async setWarehouseKitDone(orderId) {
    return await callBackend("webSetWarehouseKitDone", { orderId });
  }

  static async getOrdersByStage(stage) {
    const actions = {
      pilka: "webGetOrdersPilka",
      kromka: "webGetOrdersKromka",
      pras: "webGetOrdersPras",
      shipped: "webGetOrdersShipped",
      post_workshop: "webGetOrdersPostWorkshop",
      warehouse_kit: "webGetWarehouseKitOrders",
    };
    const action = actions[stage] || "webGetOrdersAll";
    return await callBackend(action);
  }

  static async updateOrderStage(orderId, action, payload = {}) {
    return await callBackend(action, { orderId, ...payload });
  }

  static async completeReplacementForWorkshopOrder(orderId) {
    return await callBackend("webCompleteReplacementForWorkshopOrder", {
      p_workshop_order_id: orderId,
    });
  }

  static async consumeStrapStock({ strapType, color, qty }) {
    return await callBackend("webConsumeStrapStock", { strapType, color, qty });
  }

  // --- Cutting jobs ---
  static async getCuttingJobs() {
    return await callBackend("webGetCuttingJobs");
  }

  static async upsertCuttingJob({ id, name, settings, items }) {
    return await callBackend("webUpsertCuttingJob", {
      p_id: id || 0,
      p_name: name,
      p_settings: settings,
      p_items: items,
    });
  }

  static async deleteCuttingJob(id) {
    return await callBackend("webDeleteCuttingJob", { p_id: id });
  }

  static async getCuttingCatalogKits() {
    return await callBackend("webGetCuttingCatalogKits");
  }

  static async upsertCuttingCatalogKit({ id, name, items, sort_order }) {
    return await callBackend("webUpsertCuttingCatalogKit", {
      p_id: id ? Number(id) : 0,
      p_name: name,
      p_items: items,
      p_sort_order: sort_order ?? 0,
    });
  }

  static async deleteCuttingCatalogKit(id) {
    return await callBackend("webDeleteCuttingCatalogKit", { p_id: Number(id) || 0 });
  }

  static async getGxShelfCatalog() {
    return await callBackend("webGetGxShelfCatalog");
  }

  static async upsertGxShelfCatalogItem({ id, code, name, color, pairs, sort_order }) {
    return await callBackend("webUpsertGxShelfCatalogItem", {
      p_id: id ? Number(id) : 0,
      p_code: code,
      p_name: name,
      p_color: color || null,
      p_pairs: pairs,
      p_sort_order: sort_order ?? 0,
    });
  }

  static async deleteGxShelfCatalogItem(id) {
    return await callBackend("webDeleteGxShelfCatalogItem", { p_id: Number(id) || 0 });
  }

  // --- Overview plan months ---
  static async getOverviewPlanMonths() {
    return await callBackend("webGetOverviewPlanMonths");
  }

  static async upsertOverviewPlanMonth({ id, name, weeks }) {
    return await callBackend("webUpsertOverviewPlanMonth", {
      p_id: id ? Number(id) : 0,
      p_name: name,
      p_weeks: Array.isArray(weeks) ? weeks.map(String) : [],
    });
  }

  static async deleteOverviewPlanMonth({ id }) {
    return await callBackend("webDeleteOverviewPlanMonth", { p_id: Number(id) || 0 });
  }

  static async deleteOrder(orderId) {
    return await callBackend("webDeleteOrderById", { orderId });
  }

  static async setOrderAdminComment(orderId, text) {
    return await callBackend("webSetOrderAdminComment", { orderId, text });
  }

  // ==================== Отгрузка (Shipment) ====================

  static async getShipmentBoard() {
    try {
      return await callBackend("webGetShipmentBoard");
    } catch {
      return await callBackend("webGetShipmentTable");
    }
  }

  static async getShipmentTable() {
    return await callBackend("webGetShipmentTable");
  }

  static async sendShipmentToWork(row, col) {
    return await callBackend("webSendShipmentToWork", { row, col });
  }

  static async createShipmentPlanCell(data) {
    return await callBackend("webCreateShipmentPlanCell", data);
  }

  static async deleteShipmentPlanCell(source) {
    return await callBackend("webDeleteShipmentPlanCell", source);
  }

  static async splitShipmentPlanCell(source) {
    return await callBackend("webSplitShipmentPlanCell", source);
  }

  static async updateShipmentPlanCell(source) {
    return await callBackend("webUpdateShipmentPlanCell", source);
  }

  static async getPlanCatalog() {
    return await callBackend("webGetPlanCatalog");
  }

  static async getSectionCatalog() {
    return await callBackend("webGetSectionCatalog");
  }

  static async getSectionArticles() {
    return await callBackend("webGetSectionArticles");
  }

  static async getFurnitureCustomTemplates() {
    return await callBackend("webGetFurnitureCustomTemplates");
  }

  static async upsertFurnitureCustomTemplate(productName, details, kitsPerSheet = 0, materialYields = []) {
    return await callBackend("webUpsertFurnitureCustomTemplate", {
      p_product_name: productName,
      p_details: details,
      p_kits_per_sheet: kitsPerSheet,
      p_material_yields: Array.isArray(materialYields) ? materialYields : [],
    });
  }

  static async deleteFurnitureCustomTemplate(productName) {
    return await callBackend("webDeleteFurnitureCustomTemplate", {
      productName,
    });
  }

  static async upsertItemArticleMap(payload) {
    return await callBackend("webUpsertItemArticleMap", payload);
  }

  static async getItemArticleMapByArticle(article) {
    return await callBackend("webGetItemArticleMapByArticle", { p_article: article });
  }

  static async getManualItemArticleVariants(itemName) {
    return await callBackend("webGetManualItemArticleVariants", { p_item_name: itemName });
  }

  static async upsertItemArticleMapVariants(sectionName, itemName, variants, sortOrder = 999) {
    return await callBackend("webUpsertItemArticleMapVariants", {
      p_section_name: sectionName,
      p_item_name: itemName,
      p_variants: variants,
      p_sort_order: sortOrder,
    });
  }

  /** Админ: полный справочник item_article_map (артикул ↔ изделие, секция, цвет). */
  static async getItemArticleMapAdmin() {
    return await callBackend("webGetItemArticleMapAdmin");
  }

  /** Админ: создать/обновить одну строку (артикул уникален). prevArticle — старый код при переименовании артикула. */
  static async adminUpsertItemArticleMapRow({
    prevArticle = "",
    article,
    itemName,
    source = "manual",
    sectionName = "",
    tableColor = "",
    sortOrder = 999,
  }) {
    return await callBackend("webAdminUpsertItemArticleMapRow", {
      prevArticle,
      article,
      itemName,
      source,
      sectionName,
      tableColor,
      sortOrder,
    });
  }

  static async adminDeleteItemArticleMapRow(article) {
    return await callBackend("webAdminDeleteItemArticleMapRow", { article });
  }

  static async getArticlesForImport() {
    return await callBackend("webGetArticlesForImport");
  }

  static async previewPlanFromShipment(row, col) {
    const res = await callBackend("webPreviewPlanFromShipment", { row, col });
    // Backend returns jsonb and the REST RPC wrapper may serialize it as:
    // - { preview: <plan> }
    // - [ { preview: <plan> } ]
    // - <plan>
    // Normalize to the actual plan object.
    if (Array.isArray(res)) {
      const first = res[0];
      if (first && typeof first === "object" && first.preview && typeof first.preview === "object") return first.preview;
      if (first && typeof first === "object" && (first.qty != null || first.rows != null)) return first;
      return null;
    }
    if (res && typeof res === "object" && res.preview && typeof res.preview === "object") return res.preview;
    if (res && typeof res === "object" && (res.qty != null || res.rows != null)) return res;
    return null;
  }

  static async previewPlansBatch(items) {
    const res = await callBackend("webPreviewPlansBatch", { items });
    // Normalize to { plans, failedCount, batchError } shape expected by buildShipmentPreviewPlans().
    // Backend may return:
    // - { plans: [...] }
    // - [ { batch: { plans: [...] } } ]
    // - { batch: { plans: [...] } }
    const unwrap = (v) => {
      if (!v) return null;
      if (Array.isArray(v)) return unwrap(v[0]);
      if (typeof v !== "object") return null;
      if (v.batch && typeof v.batch === "object") return v.batch;
      return v;
    };
    const normalized = unwrap(res) || {};
    return normalized;
  }

  static async getConsumeOptions(orderId) {
    return await callBackend("webGetConsumeOptions", { orderId });
  }

  // ==================== Материалы / Склад ====================

  static async getMaterialsStock() {
    return await callBackend("webGetMaterialsStock");
  }

  static async updateMaterialsStockSheetSize(material, sizeLabel) {
    return await callBackend("webUpdateMaterialsStockSheetSize", {
      material,
      sizeLabel,
    });
  }

  static async getLeftovers() {
    return await callBackend("webGetLeftovers");
  }

  static async getLeftoversHistory(limit = 500) {
    return await callBackend("webGetLeftoversHistory", { limit });
  }

  static async getConsumeHistory(limit = 300) {
    return await callBackend("webGetConsumeHistory", { limit });
  }

  static async consumeSheetsByOrderId(orderId, material, qty) {
    return await callBackend("webConsumeSheetsByOrderId", { orderId, material, qty });
  }

  static async consumeSheetsLinesByOrderId(orderId, lines) {
    return await callBackend("webConsumeSheetsLinesByOrderId", {
      p_order_id: orderId,
      p_lines: Array.isArray(lines) ? lines : [],
    });
  }

  static async logConsumeSheetsFailed(orderId, material, qty, error) {
    return await callBackend("webLogConsumeSheetsFailed", { orderId, material, qty, error });
  }

  // ==================== Трудоёмкость (Labor) ====================

  static async getLaborTable() {
    return await callBackend("webGetLaborTable");
  }

  // ==================== Загрузка цеха (Workshop Load) ====================

  static async getWorkshopQueue() {
    const rows = await callBackend("webGetWorkshopQueue");
    return Array.isArray(rows) ? rows : [];
  }

  static async getLaborKits() {
    return await callBackend("webGetLaborKits");
  }

  static async getLaborKitPlanQty() {
    const rows = await callBackend("webGetLaborKitPlanQty");
    return Array.isArray(rows) ? rows : [];
  }

  static async upsertLaborKitPlanQty({ kitId, qty }) {
    return await callBackend("webUpsertLaborKitPlanQty", { kitId, qty });
  }

  static async getLaborNorms() {
    const rows = await callBackend("webGetLaborNorms");
    return Array.isArray(rows) ? rows : [];
  }

  static async upsertLaborFact(data) {
    return await callBackend("webUpsertLaborFact", data);
  }

  static async upsertLaborKit(data) {
    return await callBackend("webUpsertLaborKit", data);
  }

  static async deleteLaborKit(id) {
    return await callBackend("webDeleteLaborKit", { id });
  }

  static async upsertLaborNorm(data) {
    return await callBackend("webUpsertLaborNorm", data);
  }

  static async deleteLaborNorm(id) {
    return await callBackend("webDeleteLaborNorm", { id });
  }

  // ==================== Статистика ====================

  static async getOrderStats() {
    try {
      return await callBackend("webGetOrderStats");
    } catch {
      return await this.getAllOrders();
    }
  }

  // ==================== Аутентификация и роли ====================

  static async getMyRole() {
    return await callBackend("webGetMyRole");
  }

  static async getCrmAuthStrict() {
    return await callBackend("webGetCrmAuthStrict");
  }

  static async setCrmAuthStrict(enabled) {
    return await callBackend("webSetCrmAuthStrict", { enabled });
  }

  static async getCrmExecutors() {
    return await callBackend("webGetCrmExecutors");
  }

  static async listCrmUserRoles() {
    return await callBackend("webListCrmUserRoles");
  }

  static async setCrmUserRole(userId, role, note) {
    return await callBackend("webSetCrmUserRole", { userId, role, note });
  }

  static async removeCrmUserRole(userId) {
    return await callBackend("webRemoveCrmUserRole", { userId });
  }

  static async getAuditLog(params = {}) {
    return await callBackend("webGetAuditLog", params);
  }

  static async getOrderTimelineAudit(orderId) {
    const id = String(orderId || "").trim();
    if (!id) return [];
    const [orderEvents, materialEvents] = await Promise.all([
      this.getAuditLog({ limit: 1000, offset: 0, action: null, entity: "orders" }).catch(() => []),
      this.getAuditLog({ limit: 1000, offset: 0, action: null, entity: "materials_moves" }).catch(() => []),
    ]);
    const all = [
      ...(Array.isArray(orderEvents) ? orderEvents : []),
      ...(Array.isArray(materialEvents) ? materialEvents : []),
    ];
    return all.filter((row) => {
      const details = row?.details && typeof row.details === "object" ? row.details : {};
      const eventOrderId = String(row?.entity_id || details?.order_id || details?.orderId || "").trim();
      return eventOrderId === id;
    });
  }

  // ==================== Мебель (Furniture) ====================

  static async getFurnitureProductArticles() {
    return await callBackend("webGetFurnitureProductArticles");
  }

  static async getFurnitureDetailArticles() {
    return await callBackend("webGetFurnitureDetailArticles");
  }

  static async getMetalForFurniture(furnitureArticle) {
    return await callBackend("webGetMetalForFurniture", { furnitureArticle });
  }

  static async upsertItemColorMap(itemName, colorName) {
    return await callBackend("webUpsertItemColorMap", { itemName, colorName });
  }

  // ==================== Металл ====================

  static async getMetalStock() {
    return await callBackend("webGetMetalStock");
  }

  static async setMetalStock(metalArticle, metalName, qtyAvailable) {
    return await callBackend("webSetMetalStock", { metalArticle, metalName, qtyAvailable });
  }

  static async getMetalWorkQueue() {
    return await callBackend("webGetMetalWorkQueue");
  }

  static async enqueueMetalWorkOrder(data) {
    return await callBackend("webEnqueueMetalWorkOrder", data);
  }

  static async setMetalWorkQueueStatus(id, status) {
    return await callBackend("webSetMetalWorkQueueStatus", { id, status });
  }

  static async listMetalProcessCatalog(activeOnly = true) {
    return await callBackend("webListMetalProcessCatalog", { activeOnly });
  }

  static async listMetalCatalogCategories() {
    return await callBackend("webListMetalCatalogCategories");
  }

  static async upsertMetalProcessCatalogItem(
    article,
    name,
    isActive = true,
    stageRoute = null,
    processGraph = null,
    category = null,
  ) {
    return await callBackend("webUpsertMetalProcessCatalogItem", {
      article,
      name,
      isActive,
      stageRoute,
      processGraph,
      category,
    });
  }

  static async upsertMetalCatalogCategory(
    name,
    { isHidden = null, stageRoute = null, processGraph = null, applyRouteToItems = false } = {},
  ) {
    return await callBackend("webUpsertMetalCatalogCategory", {
      name,
      isHidden,
      stageRoute,
      processGraph,
      applyRouteToItems,
    });
  }

  static async deleteMetalCatalogItem(article) {
    return await callBackend("webDeleteMetalCatalogItem", { article });
  }

  static async listMetalProcessItems(status = null) {
    return await callBackend("webListMetalProcessItems", { status });
  }

  static async listMetalStageEvents(itemId) {
    return await callBackend("webListMetalStageEvents", { id: itemId });
  }

  static async createMetalProcessItem({ article, name, week, qty }) {
    return await callBackend("webCreateMetalProcessItem", { article, name, week, qty });
  }

  static async transitionMetalProcessStage(id, action, startStage = null, doneQty = null, note = null) {
    return await callBackend("webTransitionMetalProcessStage", { id, action, startStage, doneQty, note });
  }

  static async setMetalProcessComment(id, comment) {
    return await callBackend("webSetMetalProcessComment", { id, comment });
  }

  static async deleteMetalProcessItem(id) {
    return await callBackend("webDeleteMetalProcessItem", { id });
  }

  // ==================== Склад готовой металлической продукции ====================

  static async receiveMetalFinished(workItemId) {
    return await callBackend("webReceiveMetalFinished", { workItemId });
  }

  static async listMetalFinishedStock() {
    return await callBackend("webListMetalFinishedStock");
  }

  static async listMetalFinishedMoves(limit = 300) {
    return await callBackend("webListMetalFinishedMoves", { limit });
  }

  static async shipMetalFinished(article, qty, note = null) {
    return await callBackend("webShipMetalFinished", { article, qty, note });
  }

  static async adjustMetalFinishedStock(article, qty) {
    return await callBackend("webAdjustMetalFinishedStock", { article, qty });
  }

  static async addMetalFinishedManual(article, qty, note = null) {
    return await callBackend("webAddMetalFinishedManual", { article, qty, note });
  }

  static async deleteMetalFinishedStock(article, note = null) {
    return await callBackend("webDeleteMetalFinishedStock", { article, note });
  }

  // ==================== График работы ====================

  static async getWorkSchedule() {
    return await callBackend("webGetWorkSchedule");
  }

  static async setWorkSchedule(data) {
    return await callBackend("webSetWorkSchedule", data);
  }

  static async getConsumeLogSheetName() {
    return await callBackend("webGetConsumeLogSheetName");
  }

  static async setConsumeLogSheetName(sheetName) {
    return await callBackend("webSetConsumeLogSheetName", { sheetName });
  }

  static async getPilkaQueueOrder() {
    return await callBackend("webGetPilkaQueueOrder");
  }

  static async setPilkaQueueOrder(orderIds) {
    return await callBackend("webSetPilkaQueueOrder", { orderIds });
  }

  // ==================== Этапы производства (Stage actions) ====================

  static async finalizeWorkshopOrder(orderId, qtyReady) {
    return await callBackend("webFinalizeWorkshopOrder", { orderId, qtyReady });
  }

  static async finalizeAssemblyOrder(orderId, qtyReady) {
    return await callBackend("webFinalizeAssemblyOrder", { orderId, qtyReady });
  }

  static async getProductionPlanDebts() {
    return await callBackend("webGetProductionPlanDebts");
  }

  static async setStageInWork(orderId, executor) {
    return await callBackend("webSetPilkaInWork", { orderId, executor });
  }

  static async setStageDone(orderId, stage) {
    const actionMap = {
      pilka: "webSetPilkaDone",
      kromka: "webSetKromkaDone",
      pras: "webSetPrasDone",
      assembly: "webSetAssemblyDone",
      warehouse_kit: "webSetWarehouseKitReady",
      shipping: "webSetShippingDone",
    };
    const action = actionMap[stage] || "webSetPilkaDone";
    return await callBackend(action, { orderId });
  }

  static async setStagePause(orderId, stage) {
    const actionMap = {
      pilka: "webSetPilkaPause",
      kromka: "webSetKromkaPause",
      pras: "webSetPrasPause",
    };
    const action = actionMap[stage] || "webSetPilkaPause";
    return await callBackend(action, { orderId });
  }

  static async setStageWait(orderId, stage) {
    const actionMap = {
      pilka: "webSetPilkaWait",
      kromka: "webSetKromkaWait",
      pras: "webSetPrasWait",
    };
    const action = actionMap[stage] || "webSetPilkaWait";
    return await callBackend(action, { orderId });
  }

  // ==================== Загрузка доменных данных (композитные) ====================

  /**
   * Загружает все данные для вкладки "Отгрузка" одним вызовом.
   */
  static async loadShipmentDomainData() {
    const [board, table, catalog, sections, articles, detailArticles, customTemplates, stock, orders] =
      await Promise.all([
        this.getShipmentBoard().catch(() => null),
        this.getShipmentTable().catch(() => null),
        this.getPlanCatalog().catch(() => []),
        this.getSectionCatalog().catch(() => []),
        this.getSectionArticles().catch(() => []),
        this.getFurnitureDetailArticles().catch(() => []),
        this.getFurnitureCustomTemplates().catch(() => []),
        this.getMaterialsStock().catch(() => []),
        this.getAllOrders().catch(() => []),
      ]);
    return { board, table, catalog, sections, articles, detailArticles, customTemplates, stock, orders };
  }

  // ==================== Фурнитура (Hardware) ====================

  static async getHardwareStock() {
    return await callBackend("webGetHardwareStock");
  }

  static async setHardwareStock(itemId, qty) {
    return await callBackend("webSetHardwareStock", { itemId, qty });
  }

  static async addHardwareStock(itemId, delta, note = "") {
    return await callBackend("webAddHardwareStock", { itemId, delta, note: String(note || "").trim() || undefined });
  }

  static async upsertHardwareItem(data) {
    return await callBackend("webUpsertHardwareItem", data);
  }

  static async getHardwareBom() {
    return await callBackend("webGetHardwareBom");
  }

  static async upsertHardwareBomRow(data) {
    return await callBackend("webUpsertHardwareBomRow", data);
  }

  static async deleteHardwareBomRow(id) {
    return await callBackend("webDeleteHardwareBomRow", { id });
  }

  static async renameHardwareBomProduct(oldName, newName) {
    return await callBackend("webRenameHardwareBomProduct", { oldName, newName });
  }

  static async getHardwareProductMap() {
    return await callBackend("webGetHardwareProductMap");
  }

  static async upsertHardwareProductMapRow(data) {
    return await callBackend("webUpsertHardwareProductMapRow", data);
  }

  static async deleteHardwareProductMapRow(id) {
    return await callBackend("webDeleteHardwareProductMapRow", { id });
  }

  static async getHardwareConsumeHistory(limit = 300) {
    return await callBackend("webGetHardwareConsumeHistory", { limit });
  }

  static async getHardwarePlanRequirement(scope, planKey) {
    return await callBackend("webGetHardwarePlanRequirement", { scope, planKey });
  }

  static async getHardwarePlanBoard(scope, planKey) {
    return await callBackend("webGetHardwarePlanBoard", { scope, planKey });
  }

  static async getHardwareItemRequirement(sectionName, item, qty) {
    return await callBackend("webGetHardwareItemRequirement", { sectionName, item, qty });
  }

  static async getHardwareConsumeOptions(orderId) {
    return await callBackend("webGetHardwareConsumeOptions", { orderId });
  }

  static async consumeHardwareByOrderId(orderId, lines) {
    return await callBackend("webConsumeHardwareByOrderId", {
      orderId,
      lines: Array.isArray(lines) ? lines : [],
    });
  }

  /**
   * Загружает все данные для вкладки "Фурнитура".
   */
  static async loadHardwareDomainData() {
    const [stock, productMap, consumeHistory] = await Promise.all([
      this.getHardwareStock().catch(() => []),
      this.getHardwareProductMap().catch(() => []),
      this.getHardwareConsumeHistory().catch(() => []),
    ]);
    return { stock, productMap, consumeHistory };
  }

  /**
   * Загружает все данные для вкладки "Склад".
   */
  static async loadWarehouseDomainData() {
    const [stock, leftovers, leftoversHistory, consumeHistory] = await Promise.all([
      this.getMaterialsStock().catch(() => []),
      this.getLeftovers().catch(() => []),
      this.getLeftoversHistory().catch(() => []),
      this.getConsumeHistory().catch(() => []),
    ]);
    return { stock, leftovers, leftoversHistory, consumeHistory };
  }

  /**
   * Загружает все данные для вкладки "Мебель".
   */
  static async loadFurnitureDomainData() {
    const [articles, detailArticles, customTemplates] = await Promise.all([
      this.getFurnitureProductArticles().catch(() => []),
      this.getFurnitureDetailArticles().catch(() => []),
      this.getFurnitureCustomTemplates().catch(() => []),
    ]);
    return { articles, detailArticles, customTemplates };
  }
}
