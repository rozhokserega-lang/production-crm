import { callBackend, supabaseCall } from "../api";

/**
 * Единый сервисный слой для всех API-вызовов.
 * Все компоненты и хуки должны использовать OrderService, а не callBackend напрямую.
 */
export class OrderService {
  // ==================== Заказы ====================

  static async getAllOrders(): Promise<unknown> {
    return await callBackend("webGetOrdersAll");
  }

  static async getOrdersByStage(stage: string): Promise<unknown> {
    const actions: Record<string, string> = {
      pilka: "webGetOrdersPilka",
      kromka: "webGetOrdersKromka",
      pras: "webGetOrdersPras",
    };
    const action = actions[stage] || "webGetOrdersAll";
    return await callBackend(action);
  }

  static async updateOrderStage(
    orderId: string,
    action: string,
    payload: Record<string, unknown> = {},
  ): Promise<unknown> {
    return await callBackend(action, { orderId, ...payload });
  }

  static async deleteOrder(orderId: string): Promise<unknown> {
    return await callBackend("webDeleteOrderById", { orderId });
  }

  static async setOrderAdminComment(orderId: string, text: string): Promise<unknown> {
    return await callBackend("webSetOrderAdminComment", { orderId, text });
  }

  // ==================== Отгрузка (Shipment) ====================

  static async getShipmentBoard(): Promise<unknown> {
    try {
      return await callBackend("webGetShipmentBoard");
    } catch {
      return await callBackend("webGetShipmentTable");
    }
  }

  static async getShipmentTable(): Promise<unknown> {
    return await callBackend("webGetShipmentTable");
  }

  static async sendShipmentToWork(row: string | number, col: string | number): Promise<unknown> {
    return await callBackend("webSendShipmentToWork", { row, col });
  }

  static async createShipmentPlanCell(data: Record<string, unknown>): Promise<unknown> {
    return await callBackend("webCreateShipmentPlanCell", data);
  }

  static async deleteShipmentPlanCell(source: Record<string, unknown>): Promise<unknown> {
    return await callBackend("webDeleteShipmentPlanCell", source);
  }

  static async getPlanCatalog(): Promise<unknown> {
    return await callBackend("webGetPlanCatalog");
  }

  static async getSectionCatalog(): Promise<unknown> {
    return await callBackend("webGetSectionCatalog");
  }

  static async getSectionArticles(): Promise<unknown> {
    return await callBackend("webGetSectionArticles");
  }

  static async getArticlesForImport(): Promise<unknown> {
    return await callBackend("webGetArticlesForImport");
  }

  static async previewPlanFromShipment(
    row: string | number,
    col: string | number,
  ): Promise<unknown> {
    return await callBackend("webPreviewPlanFromShipment", { row, col });
  }

  static async previewPlansBatch(
    items: Array<Record<string, unknown>>,
  ): Promise<unknown> {
    return await callBackend("webPreviewPlansBatch", { items });
  }

  static async getConsumeOptions(orderId: string): Promise<unknown> {
    return await callBackend("webGetConsumeOptions", { orderId });
  }

  // ==================== Материалы / Склад ====================

  static async getMaterialsStock(): Promise<unknown> {
    return await callBackend("webGetMaterialsStock");
  }

  static async getLeftovers(): Promise<unknown> {
    return await callBackend("webGetLeftovers");
  }

  static async getLeftoversHistory(limit = 500): Promise<unknown> {
    return await callBackend("webGetLeftoversHistory", { limit });
  }

  static async getConsumeHistory(limit = 300): Promise<unknown> {
    return await callBackend("webGetConsumeHistory", { limit });
  }

  static async consumeSheetsByOrderId(
    orderId: string,
    material: string,
    qty: number,
  ): Promise<unknown> {
    return await callBackend("webConsumeSheetsByOrderId", { orderId, material, qty });
  }

  static async logConsumeSheetsFailed(
    orderId: string,
    material: string,
    qty: number,
    error: string,
  ): Promise<unknown> {
    return await callBackend("webLogConsumeSheetsFailed", { orderId, material, qty, error });
  }

  // ==================== Трудоёмкость (Labor) ====================

  static async getLaborTable(): Promise<unknown> {
    return await callBackend("webGetLaborTable");
  }

  static async getLaborKits(): Promise<unknown> {
    return await callBackend("webGetLaborKits");
  }

  static async upsertLaborFact(data: Record<string, unknown>): Promise<unknown> {
    return await callBackend("webUpsertLaborFact", data);
  }

  static async upsertLaborKit(data: Record<string, unknown>): Promise<unknown> {
    return await callBackend("webUpsertLaborKit", data);
  }

  static async deleteLaborKit(id: number): Promise<unknown> {
    return await callBackend("webDeleteLaborKit", { id });
  }

  // ==================== Статистика ====================

  static async getOrderStats(): Promise<unknown> {
    try {
      return await callBackend("webGetOrderStats");
    } catch {
      return await this.getAllOrders();
    }
  }

  // ==================== Аутентификация и роли ====================

  static async getMyRole(): Promise<unknown> {
    return await callBackend("webGetMyRole");
  }

  static async getCrmAuthStrict(): Promise<unknown> {
    return await callBackend("webGetCrmAuthStrict");
  }

  static async setCrmAuthStrict(enabled: boolean): Promise<unknown> {
    return await callBackend("webSetCrmAuthStrict", { enabled });
  }

  static async getCrmExecutors(): Promise<unknown> {
    return await callBackend("webGetCrmExecutors");
  }

  static async listCrmUserRoles(): Promise<unknown> {
    return await callBackend("webListCrmUserRoles");
  }

  static async setCrmUserRole(
    userId: string,
    role: string,
    note?: string,
  ): Promise<unknown> {
    return await callBackend("webSetCrmUserRole", { userId, role, note });
  }

  static async removeCrmUserRole(userId: string): Promise<unknown> {
    return await callBackend("webRemoveCrmUserRole", { userId });
  }

  static async getAuditLog(params: Record<string, unknown> = {}): Promise<unknown> {
    return await callBackend("webGetAuditLog", params);
  }

  // ==================== Мебель (Furniture) ====================

  static async getFurnitureProductArticles(): Promise<unknown> {
    return await callBackend("webGetFurnitureProductArticles");
  }

  static async getFurnitureDetailArticles(): Promise<unknown> {
    return await callBackend("webGetFurnitureDetailArticles");
  }

  static async getMetalForFurniture(furnitureArticle: string): Promise<unknown> {
    return await callBackend("webGetMetalForFurniture", { furnitureArticle });
  }

  static async upsertItemColorMap(itemName: string, colorName: string): Promise<unknown> {
    return await callBackend("webUpsertItemColorMap", { itemName, colorName });
  }

  // ==================== Металл ====================

  static async getMetalStock(): Promise<unknown> {
    return await callBackend("webGetMetalStock");
  }

  static async setMetalStock(
    metalArticle: string,
    metalName: string,
    qtyAvailable: number,
  ): Promise<unknown> {
    return await callBackend("webSetMetalStock", { metalArticle, metalName, qtyAvailable });
  }

  static async getMetalWorkQueue(): Promise<unknown> {
    return await callBackend("webGetMetalWorkQueue");
  }

  static async enqueueMetalWorkOrder(data: Record<string, unknown>): Promise<unknown> {
    return await callBackend("webEnqueueMetalWorkOrder", data);
  }

  static async setMetalWorkQueueStatus(id: number, status: string): Promise<unknown> {
    return await callBackend("webSetMetalWorkQueueStatus", { id, status });
  }

  // ==================== График работы ====================

  static async getWorkSchedule(): Promise<unknown> {
    return await callBackend("webGetWorkSchedule");
  }

  static async setWorkSchedule(data: Record<string, unknown>): Promise<unknown> {
    return await callBackend("webSetWorkSchedule", data);
  }

  // ==================== Зеркало Google Sheets ====================

  static async getSheetOrdersMirror(sheetGid: string): Promise<unknown> {
    return await callBackend("webGetSheetOrdersMirror", { p_sheet_gid: sheetGid });
  }

  // ==================== Этапы производства (Stage actions) ====================

  static async setStageInWork(orderId: string, executor: string): Promise<unknown> {
    return await callBackend("webSetPilkaInWork", { orderId, executor });
  }

  static async setStageDone(orderId: string, stage: string): Promise<unknown> {
    const actionMap: Record<string, string> = {
      pilka: "webSetPilkaDone",
      kromka: "webSetKromkaDone",
      pras: "webSetPrasDone",
      assembly: "webSetAssemblyDone",
      shipping: "webSetShippingDone",
    };
    const action = actionMap[stage] || "webSetPilkaDone";
    return await callBackend(action, { orderId });
  }

  static async setStagePause(orderId: string, stage: string): Promise<unknown> {
    const actionMap: Record<string, string> = {
      pilka: "webSetPilkaPause",
      kromka: "webSetKromkaPause",
      pras: "webSetPrasPause",
    };
    const action = actionMap[stage] || "webSetPilkaPause";
    return await callBackend(action, { orderId });
  }

  static async setStageWait(orderId: string, stage: string): Promise<unknown> {
    const actionMap: Record<string, string> = {
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
  static async loadShipmentDomainData(): Promise<Record<string, unknown>> {
    const [board, table, catalog, sections, articles, detailArticles, stock, orders] =
      await Promise.all([
        this.getShipmentBoard().catch(() => null),
        this.getShipmentTable().catch(() => null),
        this.getPlanCatalog().catch(() => []),
        this.getSectionCatalog().catch(() => []),
        this.getSectionArticles().catch(() => []),
        this.getFurnitureDetailArticles().catch(() => []),
        this.getMaterialsStock().catch(() => []),
        this.getAllOrders().catch(() => []),
      ]);
    return { board, table, catalog, sections, articles, detailArticles, stock, orders };
  }

  /**
   * Загружает все данные для вкладки "Склад".
   */
  static async loadWarehouseDomainData(): Promise<Record<string, unknown>> {
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
  static async loadFurnitureDomainData(): Promise<Record<string, unknown>> {
    const [articles, detailArticles] = await Promise.all([
      this.getFurnitureProductArticles().catch(() => []),
      this.getFurnitureDetailArticles().catch(() => []),
    ]);
    return { articles, detailArticles };
  }
}
