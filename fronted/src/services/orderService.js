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

  static async getOrdersByStage(stage) {
    const actions = {
      pilka: "webGetOrdersPilka",
      kromka: "webGetOrdersKromka",
      pras: "webGetOrdersPras",
    };
    const action = actions[stage] || "webGetOrdersAll";
    return await callBackend(action);
  }

  static async updateOrderStage(orderId, action, payload = {}) {
    return await callBackend(action, { orderId, ...payload });
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

  static async upsertFurnitureCustomTemplate(productName, details) {
    return await callBackend("webUpsertFurnitureCustomTemplate", {
      p_product_name: productName,
      p_details: details,
    });
  }

  static async upsertItemArticleMap(payload) {
    return await callBackend("webUpsertItemArticleMap", payload);
  }

  static async getArticlesForImport() {
    return await callBackend("webGetArticlesForImport");
  }

  static async previewPlanFromShipment(row, col) {
    return await callBackend("webPreviewPlanFromShipment", { row, col });
  }

  static async previewPlansBatch(items) {
    return await callBackend("webPreviewPlansBatch", { items });
  }

  static async getConsumeOptions(orderId) {
    return await callBackend("webGetConsumeOptions", { orderId });
  }

  // ==================== Материалы / Склад ====================

  static async getMaterialsStock() {
    return await callBackend("webGetMaterialsStock");
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

  static async logConsumeSheetsFailed(orderId, material, qty, error) {
    return await callBackend("webLogConsumeSheetsFailed", { orderId, material, qty, error });
  }

  // ==================== Трудоёмкость (Labor) ====================

  static async getLaborTable() {
    return await callBackend("webGetLaborTable");
  }

  static async getLaborKits() {
    return await callBackend("webGetLaborKits");
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

  // ==================== График работы ====================

  static async getWorkSchedule() {
    return await callBackend("webGetWorkSchedule");
  }

  static async setWorkSchedule(data) {
    return await callBackend("webSetWorkSchedule", data);
  }

  // ==================== Зеркало Google Sheets ====================

  static async getSheetOrdersMirror(sheetGid) {
    return await callBackend("webGetSheetOrdersMirror", { p_sheet_gid: sheetGid });
  }

  // ==================== Этапы производства (Stage actions) ====================

  static async setStageInWork(orderId, executor) {
    return await callBackend("webSetPilkaInWork", { orderId, executor });
  }

  static async setStageDone(orderId, stage) {
    const actionMap = {
      pilka: "webSetPilkaDone",
      kromka: "webSetKromkaDone",
      pras: "webSetPrasDone",
      assembly: "webSetAssemblyDone",
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
