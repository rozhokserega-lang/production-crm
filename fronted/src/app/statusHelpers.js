import { PipelineStage, resolvePipelineStage } from "../orderPipeline";
import { mapPipelineStageToShipmentKey } from "../utils/shipmentUtils";

export function statusClass(order) {
  const ps = resolvePipelineStage(order);
  if (ps === PipelineStage.SHIPPED || ps === PipelineStage.READY_TO_SHIP || ps === PipelineStage.ASSEMBLED) {
    return "done";
  }
  const a = String(order?.assemblyStatus || "");
  if (a.includes("СОБРАНО") || a.toLowerCase().includes("собрано")) return "done";
  const pilka = String(order?.pilkaStatus || order?.pilka || "");
  const kromka = String(order?.kromkaStatus || order?.kromka || "");
  const pras = String(order?.prasStatus || order?.pras || "");
  const lc = (s) => String(s || "").toLowerCase();
  const inWork = (s) => lc(s).includes("в работе");
  const onPause = (s) => lc(s).includes("пауза");
  if (ps === PipelineStage.PILKA && onPause(pilka)) return "pause";
  if (ps === PipelineStage.KROMKA && onPause(kromka)) return "pause";
  if (ps === PipelineStage.PRAS && onPause(pras)) return "pause";
  if (ps === PipelineStage.PILKA && inWork(pilka)) return "work";
  if (ps === PipelineStage.KROMKA && inWork(kromka)) return "work";
  if (ps === PipelineStage.PRAS && inWork(pras)) return "work";
  return "wait";
}

export function stageLabel(stageKey) {
  if (stageKey === "awaiting") return "Ожидаю заказ";
  if (stageKey === "on_pilka_wait") return "На пиле (ожидает запуск)";
  if (stageKey === "on_pilka_work") return "На пиле";
  if (stageKey === "on_kromka_wait") return "Ожидает кромку";
  if (stageKey === "on_kromka_work") return "На кромке";
  if (stageKey === "on_pras_wait") return "Ожидает присадку";
  if (stageKey === "on_pras_work") return "На присадке";
  if (stageKey === "ready_assembly") return "Готово к сборке";
  if (stageKey === "assembled_wait_ship") return "Собран, ждет отправку";
  if (stageKey === "shipped") return "Отправлен";
  return "Статус неизвестен";
}

export function stageBg(stageKey, rawBg = "#ffffff") {
  if (stageKey === "awaiting") return "#ffffff";
  if (stageKey === "on_pilka_wait") return "#fff7cc";
  if (stageKey === "on_pilka_work") return "#ffe066";
  if (stageKey === "on_kromka_wait") return "#dbeafe";
  if (stageKey === "on_kromka_work") return "#3b82f6";
  if (stageKey === "on_pras_wait") return "#ffddb5";
  if (stageKey === "on_pras_work") return "#8b5a2b";
  if (stageKey === "ready_assembly") return "#f59e0b";
  if (stageKey === "assembled_wait_ship") return "#22c55e";
  if (stageKey === "shipped") return "#d31d1d";
  return rawBg || "#ffffff";
}

export function getOverallStatusDisplay(order) {
  const raw = String(order?.overallStatus || order?.overall || "").trim();
  const stageKey = mapPipelineStageToShipmentKey(order);
  const computed = stageLabel(stageKey);
  if (!raw) return computed;

  // If legacy overall_status is stale (e.g. still "Отправлен на пилу"),
  // trust the current pipeline-derived status for UI consistency.
  const rawLc = raw.toLowerCase();
  const isLegacyPilka = rawLc.includes("на пилу");
  const isPilkaStage = stageKey === "on_pilka_wait" || stageKey === "on_pilka_work";
  if (isLegacyPilka && !isPilkaStage) return computed;

  return raw;
}
