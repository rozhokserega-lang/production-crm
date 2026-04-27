/**
 * Domain types derived from current RPC/database contracts.
 */

export type PipelineStage =
  | "pilka"
  | "kromka"
  | "pras"
  | "assembly"
  | "assembled"
  | "ready_to_ship"
  | "shipped";

export type StageStatus =
  | "ожидает"
  | "в работе"
  | "пауза"
  | "готово"
  | "собрано"
  | (string & {});

export type CrmRole = "viewer" | "operator" | "manager" | "admin";

export interface OrderRow {
  order_id: string;
  item: string;
  material: string | null;
  week: string | null;
  qty: number;
  pilka_status: StageStatus | null;
  kromka_status: StageStatus | null;
  pras_status: StageStatus | null;
  assembly_status: StageStatus | null;
  overall_status: string | null;
  pipeline_stage: PipelineStage | null;
  color_name: string | null;
  sheets_needed: number;
  admin_comment?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderStatRow {
  order_id: string;
  item: string;
  week: string | null;
  qty: number;
  pilka_status: StageStatus | null;
  kromka_status: StageStatus | null;
  pras_status: StageStatus | null;
  assembly_status: StageStatus | null;
  overall_status: string | null;
  pipeline_stage: PipelineStage | null;
  color_name: string | null;
  updated_at: string;
}

export interface ShipmentRow {
  section_name: string;
  row_ref: string;
  item: string;
  material: string | null;
  week: string | null;
  qty: number;
  bg: string | null;
  can_send_to_work: boolean;
  in_work: boolean;
  sheets_needed: number;
  available_sheets: number;
  material_enough_for_order: boolean;
  source_row_id: string;
  source_col_id: string;
  note: string | null;
}

export interface LeftoverRow {
  order_id: string | null;
  item: string | null;
  material: string | null;
  sheets_needed: number;
  leftover_format: string | null;
  leftovers_qty: number;
  created_at: string;
}

export type AuditAction =
  | "set_stage"
  | "delete_order"
  | "assign_role"
  | "remove_role"
  | "consume_sheets"
  | "toggle_strict_mode"
  | (string & {});

export type AuditEntity =
  | "orders"
  | "crm_user_roles"
  | "materials_moves"
  | "crm_runtime_settings"
  | (string & {});

export interface AuditLogRow {
  id: number;
  created_at: string;
  actor_user_id: string | null;
  actor_db_role: string;
  actor_crm_role: CrmRole;
  action: AuditAction;
  entity: AuditEntity;
  entity_id: string | null;
  details: Record<string, unknown> | null;
}

export interface CrmUserRow {
  userId: string;
  email: string | null;
  role: CrmRole;
  note: string | null;
  updatedAt: string | null;
}

export interface LaborRow {
  orderId: string;
  item: string;
  week: string | null;
  qty: number;
  pilkaMin: number;
  kromkaMin: number;
  prasMin: number;
  totalMin: number;
  dateFinished: string | null;
  importedLocal?: boolean;
  importKey?: string;
}

export interface NormalizedOrder {
  orderId: string;
  item: string;
  material: string | null;
  week: string | null;
  qty: number;
  pilkaStatus: StageStatus | null;
  kromkaStatus: StageStatus | null;
  prasStatus: StageStatus | null;
  assemblyStatus: StageStatus | null;
  overallStatus: string | null;
  pipelineStage: PipelineStage | null;
  colorName: string | null;
  sheetsNeeded: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogParams {
  limit?: number;
  offset?: number;
  action?: AuditAction | null;
  entity?: AuditEntity | null;
  [key: string]: unknown;
}
