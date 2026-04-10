/**
 * Единая модель этапа заказа (pipeline). Все экраны должны опираться на pipelineStage,
 * а не на разбор русских подстрок в разных местах.
 *
 * Если API вернёт pipeline_stage / pipelineStage — оно имеет приоритет (нормализация в App).
 */

export const PipelineStage = {
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

function lc(s) {
  return String(s ?? "").toLowerCase();
}

function isDoneLine(status) {
  const v = lc(status);
  return v.includes("готов") || v.includes("собрано");
}

/** Финальная отгрузка клиенту; «Отправлен на пилу» и «Готово к отправке» сюда не входят. */
export function isCustomerShippedOverall(overallRaw) {
  const s = lc(overallRaw);
  if (s.includes("на пилу")) return false;
  // В «готово к отправке» есть подстрока «отправ» — это ещё не отгрузка клиенту.
  if (s.includes("готово к отправке")) return false;
  return s.includes("отгруж") || s.includes("упаков") || s.includes("отправ");
}

/**
 * Вычисляет этап только из полей заказа. Порядок веток важен.
 * @param {Record<string, unknown>} order — уже с camelCase-полями как после normalizeOrder
 */
export function inferPipelineStage(order) {
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

  if (pras.includes("в работе") || pras.includes("пауза") || (pkD && krD && !prD)) return PipelineStage.PRAS;
  if (kromka.includes("в работе") || kromka.includes("пауза") || (pkD && !krD)) return PipelineStage.KROMKA;

  if (overall.includes("на пилу")) return PipelineStage.PILKA;
  return PipelineStage.PILKA;
}

/** Подпись этапа для UI (карточки, статистика, обзор). */
export function getOrderStageDisplayLabel(order) {
  const ps = order?.pipelineStage ?? inferPipelineStage(order);
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

/** Колонка канбана «Обзор заказов». */
export function getOverviewLaneId(order) {
  const ps = order?.pipelineStage ?? inferPipelineStage(order);
  switch (ps) {
    case PipelineStage.PILKA:
      return "pilka";
    case PipelineStage.KROMKA:
      return "kromka";
    case PipelineStage.PRAS:
      return "pras";
    case PipelineStage.WORKSHOP_COMPLETE:
    case PipelineStage.ASSEMBLED:
      return "assembly";
    case PipelineStage.READY_TO_SHIP:
    case PipelineStage.SHIPPED:
      return "done";
    default:
      return "pilka";
  }
}

export function isOrderCustomerShipped(order) {
  return (order?.pipelineStage ?? inferPipelineStage(order)) === PipelineStage.SHIPPED;
}
