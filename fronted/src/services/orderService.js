import { callBackend } from '../api';

export class OrderService {
  // Заказы
  static async getAllOrders() {
    return await callBackend('webGetOrdersAll');
  }

  static async getOrdersByStage(stage) {
    const actions = {
      pilka: 'webGetOrdersPilka',
      kromka: 'webGetOrdersKromka', 
      pras: 'webGetOrdersPras'
    };
    
    const action = actions[stage] || 'webGetOrdersAll';
    return await callBackend(action);
  }

  static async updateOrderStage(orderId, action, payload = {}) {
    return await callBackend(action, { orderId, ...payload });
  }

  static async deleteOrder(orderId) {
    return await callBackend('webDeleteOrderById', { orderId });
  }

  // Отгрузка
  static async getShipmentBoard() {
    try {
      return await callBackend('webGetShipmentBoard');
    } catch {
      return await callBackend('webGetShipmentTable');
    }
  }

  static async getShipmentTable() {
    return await callBackend('webGetShipmentTable');
  }

  static async sendShipmentToWork(row, col) {
    return await callBackend('webSendShipmentToWork', { row, col });
  }

  static async createShipmentPlan(data) {
    return await callBackend('webCreateShipmentPlanCell', data);
  }

  static async deleteShipmentPlan(source) {
    return await callBackend('webDeleteShipmentPlanCell', source);
  }

  // Материалы
  static async getMaterialsStock() {
    return await callBackend('webGetMaterialsStock');
  }

  static async getLeftovers() {
    return await callBackend('webGetLeftovers');
  }

  static async consumeMaterial(orderId, material, qty) {
    return await callBackend('webConsumeSheetsByOrderId', { orderId, material, qty });
  }

  // Трудоемкость
  static async getLaborTable() {
    return await callBackend('webGetLaborTable');
  }

  static async upsertLaborFact(data) {
    return await callBackend('webUpsertLaborFact', data);
  }

  // Статистика
  static async getOrderStats() {
    try {
      return await callBackend('webGetOrderStats');
    } catch {
      return await this.getAllOrders();
    }
  }

  // Аутентификация и роли
  static async getUserRole() {
    return await callBackend('webGetMyRole');
  }

  static async getCrmUsers() {
    return await callBackend('webListCrmUserRoles');
  }

  static async setUserRole(userId, role, note) {
    return await callBackend('webSetCrmUserRole', { userId, role, note });
  }

  static async removeUserRole(userId) {
    return await callBackend('webRemoveCrmUserRole', { userId });
  }

  // Каталоги
  static async getPlanCatalog() {
    return await callBackend('webGetPlanCatalog');
  }

  static async getSectionCatalog() {
    return await callBackend('webGetSectionCatalog');
  }

  static async getSectionArticles() {
    return await callBackend('webGetSectionArticles');
  }

  static async getFurnitureArticles() {
    return await callBackend('webGetFurnitureProductArticles');
  }

  static async getFurnitureDetailArticles() {
    return await callBackend('webGetFurnitureDetailArticles');
  }

  // Прочее
  static async getAuditLog(params = {}) {
    return await callBackend('webGetAuditLog', params);
  }

  static async upsertItemColorMap(itemName, colorName) {
    return await callBackend('webUpsertItemColorMap', { itemName, colorName });
  }

  static async previewPlanFromShipment(row, col) {
    return await callBackend('webPreviewPlanFromShipment', { row, col });
  }

  static async previewPlansBatch(items) {
    return await callBackend('webPreviewPlansBatch', { items });
  }
}
