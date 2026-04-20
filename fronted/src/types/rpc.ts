export interface OrderRow {
  orderId?: string;
  order_id?: string;
  item?: string;
  week?: string;
  qty?: number;
  pilkaStatus?: string;
  kromkaStatus?: string;
  prasStatus?: string;
  assemblyStatus?: string;
  overallStatus?: string;
  pipeline_stage?: string;
  adminComment?: string;
  admin_comment?: string;
  [key: string]: unknown;
}

export interface CrmUserRoleRow {
  user_id: string;
  email?: string;
  role: "viewer" | "operator" | "manager" | "admin";
  note?: string;
  assigned_by?: string;
  updated_at?: string;
}

export interface AuditLogRow {
  id: number;
  created_at: string;
  actor_user_id?: string;
  actor_db_role?: string;
  actor_crm_role?: string;
  action: string;
  entity: string;
  entity_id?: string;
  details?: Record<string, unknown> | null;
}

export interface CrmExecutorsPayload {
  kromka: string[];
  pras: string[];
}

export interface ConsumeOptionsPayload {
  options?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface RpcPayloadMap {
  webGetShipmentBoard: Record<string, never>;
  webGetShipmentTable: Record<string, never>;
  webGetOrdersAll: Record<string, never>;
  webGetOrdersPilka: Record<string, never>;
  webGetOrdersKromka: Record<string, never>;
  webGetOrdersPras: Record<string, never>;
  webGetMaterialsStock: Record<string, never>;
  webGetConsumeHistory: { limit?: number; p_limit?: number };
  webGetSectionCatalog: Record<string, never>;
  webGetSectionArticles: Record<string, never>;
  webGetArticlesForImport: Record<string, never>;
  webGetFurnitureProductArticles: Record<string, never>;
  webGetFurnitureDetailArticles: Record<string, never>;
  webGetLeftovers: Record<string, never>;
  webGetLaborTable: Record<string, never>;
  webUpsertLaborFact: {
    orderId?: string;
    p_order_id?: string;
    item?: string;
    p_item?: string;
    week?: string;
    p_week?: string;
    qty?: number;
    p_qty?: number;
    pilkaMin?: number;
    p_pilka_min?: number;
    kromkaMin?: number;
    p_kromka_min?: number;
    prasMin?: number;
    p_pras_min?: number;
    assemblyMin?: number;
    p_assembly_min?: number;
    dateFinished?: string;
    p_date_finished?: string;
  };
  webGetOrderStats: Record<string, never>;
  webGetMyRole: Record<string, never>;
  webGetCrmAuthStrict: Record<string, never>;
  webGetCrmExecutors: Record<string, never>;
  webSetCrmAuthStrict: { enabled: boolean };
  webListCrmUserRoles: Record<string, never>;
  webSetCrmUserRole: { userId: string; role: string; note?: string };
  webRemoveCrmUserRole: { userId: string };
  webGetAuditLog: { action?: string | null; limit?: number; offset?: number };
  webUpsertItemColorMap: { itemName: string; colorName: string };
  webGetConsumeOptions: { orderId: string };
  webPreviewPlanFromShipment: { row: string | number; col: string | number };
  webPreviewPlansBatch: { items: Array<{ row: string | number; col: string | number }> };
  webCreateShipmentPlanCell: {
    sectionName?: string | null;
    item: string;
    material?: string | null;
    week: string;
    qty: number;
  };
  webDeleteShipmentPlanCell: { row?: string | number; col?: string | number; source?: string };
  webDeleteOrderById: { orderId: string };
  webSetOrderAdminComment: { orderId: string; text?: string; p_comment?: string };
  webGetPlanCatalog: Record<string, never>;
  webSetPilkaInWork: { orderId: string; executor?: string };
  webSetKromkaInWork: { orderId: string; executor?: string };
  webSetPrasInWork: { orderId: string; executor?: string };
  webSetPilkaDone: { orderId: string };
  webSetKromkaDone: { orderId: string };
  webSetPrasDone: { orderId: string };
  webSetAssemblyDone: { orderId: string };
  webSetShippingDone: { orderId: string };
  webSetPilkaPause: { orderId: string };
  webSetKromkaPause: { orderId: string };
  webSetPrasPause: { orderId: string };
  webSendShipmentToWork: { row: string | number; col: string | number };
  webSendPlanksToWork: { items: Array<Record<string, unknown>> };
  webConsumeSheetsByOrderId: { orderId: string; material: string; qty: number };
}

export type RpcAction = keyof RpcPayloadMap;

export interface RpcResponseMap {
  webGetShipmentBoard: Record<string, unknown>;
  webGetShipmentTable: Record<string, unknown>;
  webGetOrdersAll: OrderRow[];
  webGetOrdersPilka: OrderRow[];
  webGetOrdersKromka: OrderRow[];
  webGetOrdersPras: OrderRow[];
  webGetMaterialsStock: Array<Record<string, unknown>>;
  webGetConsumeHistory: Array<Record<string, unknown>>;
  webGetSectionCatalog: Array<Record<string, unknown>>;
  webGetSectionArticles: Array<Record<string, unknown>>;
  webGetArticlesForImport: Array<Record<string, unknown>>;
  webGetFurnitureProductArticles: Array<Record<string, unknown>>;
  webGetFurnitureDetailArticles: Array<Record<string, unknown>>;
  webGetLeftovers: Array<Record<string, unknown>>;
  webGetLaborTable: Array<Record<string, unknown>>;
  webUpsertLaborFact: Record<string, unknown>;
  webGetOrderStats: OrderRow[];
  webGetMyRole: string | Array<Record<string, unknown>> | Record<string, unknown>;
  webGetCrmAuthStrict: boolean | Array<Record<string, unknown>> | Record<string, unknown>;
  webGetCrmExecutors: CrmExecutorsPayload | Array<Record<string, unknown>>;
  webSetCrmAuthStrict: boolean | Record<string, unknown>;
  webListCrmUserRoles: CrmUserRoleRow[];
  webSetCrmUserRole: Record<string, unknown>;
  webRemoveCrmUserRole: Record<string, unknown>;
  webGetAuditLog: AuditLogRow[];
  webUpsertItemColorMap: Record<string, unknown>;
  webGetConsumeOptions: ConsumeOptionsPayload;
  webPreviewPlanFromShipment: Record<string, unknown>;
  webPreviewPlansBatch: Array<Record<string, unknown>>;
  webCreateShipmentPlanCell: Record<string, unknown>;
  webDeleteShipmentPlanCell: Record<string, unknown>;
  webDeleteOrderById: Record<string, unknown>;
  webGetPlanCatalog: Array<Record<string, unknown>>;
  webSetPilkaInWork: Record<string, unknown>;
  webSetKromkaInWork: Record<string, unknown>;
  webSetPrasInWork: Record<string, unknown>;
  webSetPilkaDone: Record<string, unknown>;
  webSetKromkaDone: Record<string, unknown>;
  webSetPrasDone: Record<string, unknown>;
  webSetAssemblyDone: Record<string, unknown>;
  webSetShippingDone: Record<string, unknown>;
  webSetPilkaPause: Record<string, unknown>;
  webSetKromkaPause: Record<string, unknown>;
  webSetPrasPause: Record<string, unknown>;
  webSendShipmentToWork: Record<string, unknown>;
  webSendPlanksToWork: Record<string, unknown>;
  webConsumeSheetsByOrderId: Record<string, unknown>;
}
