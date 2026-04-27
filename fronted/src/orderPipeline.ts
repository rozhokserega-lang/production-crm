/**
 * Единая модель этапа заказа (pipeline). Все экраны должны опираться на pipelineStage,
 * а не на разбор русских подстрок в разных местах.
 *
 * Если API вернёт pipeline_stage / pipelineStage — оно имеет приоритет (нормализация в App).
 */

interface OrderLike {
  pipelineStage?: string | null;
  pipeline_stage?: string | null;
  overallStatus?: string | null;
  overall_status?: string | null;
  overall?: string | null;
  assemblyStatus?: string | null;
  assembly_status?: string | null;
  pilkaStatus?: string | null;
  pilka_status?: string | null;
  pilka?: string | null;
  kromkaStatus?: string | null;
  kromka_status?: string | null;
  kromka?: string | null;
  prasStatus?: string | null;
  pras_status?: string | null;
  pras?: string | null;
  [key: string]: unknown;
}

export const PipelineStage: Record<string, string> = {
  PILKA: "pilka",
  KROMKA: "kromka",
  PRAS: "pras",
  /** Все три линии цеха готовы, сборка ещё не «собрано». */
  WORKSHOP_COMPLETE: "workshop_complete",
  /** В assembly_status есть «собрано», но ещё не финальная отгрузка. */
  ASSEMBLED: "assembled",
  /** Готово к отправке клиенту (по overall). */
  READY_TO_SHIP: "ready_to_ship",
  /** Отгружено / упаковано (финал). */
  SHIPPED: "shipped",
};

const KNOWN_PIPELINE_STAGES: Set<string> = new Set(Object.values(PipelineStage));

function lc(s: unknown): string {
  return String(s ?? "").toLowerCase();
}

function isDoneLine(status: unknown): boolean {
  const v = lc(status);
  return v.includes("готов") || v.includes("собрано");
}

/**
 * Этап для UI и канбана: доверяем `pipeline_stage` из БД только если значение из известного набора,
 * иначе пересчитываем из статусов (защита от устаревших/ошибочных значений).
 */
export function resolvePipelineStage(order: OrderLike): string {
  const raw = order?.pipelineStage ?? order?.pipeline_stage;
  if (raw != null && KNOWN_PIPELINE_STAGES.has(String(raw))) return String(raw);
  return inferPipelineStage(order);
}

/** Линия цеха (пила/кромка/присадка) закрыта по статусу — для последовательности этапов и подсветки карточек. */
export function isWorkshopLineDone(status: unknown): boolean {
  return isDoneLine(status);
}

/** Финальная отгрузка клиенту; «Отправлен на пилу» и «Готово к отправке» сюда не входят. */
export function isCustomerShippedOverall(overallRaw: unknown): boolean {
  const s = lc(overallRaw);
  if (s.includes("на пилу")) return false;
  // В «готово к отправке» есть подстрока «отправ» — это ещё не отгрузка клиенту.
  if (s.includes("готово к отправке")) return false;
  return s.includes("отгруж") || s.includes("упаков") || s.includes("отправ");
}

/**
 * Вычисляет этап только из полей заказа.
 * Цех — строго по цепочке: пила → кромка → присадка; не относим заказ к кромке/присадке, пока предыдущая линия не закрыта
 * (даже если в БД на следующей строке стоит «в работе» из‑за ошибки ввода).
 */
export function inferPipelineStage(order: OrderLike): string {
  const overall = lc(order?.overallStatus ?? order?.overall_status ?? order?.overall);
  const assembly = lc(order?.assemblyStatus ?? order?.assembly_status);
  const pilka = lc(order?.pilkaStatus ?? order?.pilka_status ?? order?.pilka);
  const kromka = lc(order?.kromkaStatus ?? order?.kromka_status ?? order?.kromka);
  const pras = lc(order?.prasStatus ?? order?.pras_status ?? order?.pras);

  if (isCustomerShippedOverall(overall)) return PipelineStage.SHIPPED;
  if (overall.includes("готово к отправке")) return PipelineStage.READY_TO_SHIP;
  if (assembly.includes("собрано")) return PipelineStage.ASSEMBLED;

  const pkD = isDoneLine(pilka);
  const krD = isDoneLine(kromka);
  const prD = isDoneLine(pras);

  if (pkD && krD && prD) return PipelineStage.WORKSHOP_COMPLETE;

  if (pkD && krD && !prD) return PipelineStage.PRAS;
  if (pkD && !krD) return PipelineStage.KROMKA;
  return PipelineStage.PILKA;
}

/** Подпись этапа для UI (карточки, статистика, обзор). */
export function getOrderStageDisplayLabel(order: OrderLike): string {
  const ps = resolvePipelineStage(order);
  switch (ps) {
    case PipelineStage.SHIPPED:
      return "Отгружено";
    case PipelineStage.READY_TO_SHIP:
      return "Готово к отправке";
    case PipelineStage.ASSEMBLED:
      return "Собран";
    case PipelineStage.WORKSHOP_COMPLETE:
      return "Готов";
    case PipelineStage.PRAS:
      return "Присадка";
    case PipelineStage.KROMKA:
      return "Кромка";
    default:
      return "Пила";
  }
}

/** Id колонок канбана после сборки (раздельно, без путаницы «готово» vs «отгружено»). */
export const OVERVIEW_LANE_READY_TO_SHIP = "ready_to_ship";
export const OVERVIEW_LANE_SHIPPED = "shipped";

/** Цех закончил три линии, изделие ещё не «собрано» в assembly — отдельно от уже собранного. */
export const OVERVIEW_LANE_WORKSHOP_COMPLETE = "workshop_complete";
/** В assembly_status отмечено «собрано». */
export const OVERVIEW_LANE_ASSEMBLED = "assembled";

/** Колонки финала: не в активном производстве по смыслу KPI «В производстве». */
export const OVERVIEW_POST_PRODUCTION_LANE_IDS: string[] = [OVERVIEW_LANE_READY_TO_SHIP, OVERVIEW_LANE_SHIPPED];

/** Колонка канбана «Обзор заказов» (id колонки = id дорожки). */
export function getOverviewLaneId(order: OrderLike): string {
  const ps = resolvePipelineStage(order);
  switch (ps) {
    case PipelineStage.PILKA:
      return "pilka";
    case PipelineStage.KROMKA:
      return "kromka";
    case PipelineStage.PRAS:
      return "pras";
    case PipelineStage.WORKSHOP_COMPLETE:
      return OVERVIEW_LANE_WORKSHOP_COMPLETE;
    case PipelineStage.ASSEMBLED:
      return OVERVIEW_LANE_ASSEMBLED;
    case PipelineStage.READY_TO_SHIP:
      return OVERVIEW_LANE_READY_TO_SHIP;
    case PipelineStage.SHIPPED:
      return OVERVIEW_LANE_SHIPPED;
    default:
      return "pilka";
  }
}

export function isOrderCustomerShipped(order: OrderLike): boolean {
  return resolvePipelineStage(order) === PipelineStage.SHIPPED;
}
