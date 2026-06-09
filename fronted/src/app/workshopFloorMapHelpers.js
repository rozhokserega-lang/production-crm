import { PipelineStage, resolvePipelineStage } from "../orderPipeline";
import { stripPlanItemMeta } from "./orderHelpers";

export const FLOOR_ZONES = {
  wait_pilka: "wait_pilka",
  pilka: "pilka",
  wait_kromka: "wait_kromka",
  kromka_top: "kromka_top",
  kromka_bottom: "kromka_bottom",
  wait_pras: "wait_pras",
  pras_top: "pras_top",
  pras_bottom: "pras_bottom",
  assembly_ready: "assembly_ready",
  ready_to_ship: "ready_to_ship",
};

export const FLOOR_ZONE_LABELS = {
  wait_pilka: "Ожидают пилу",
  pilka: "Пила",
  wait_kromka: "Ожидают кромку",
  kromka_top: "Кромочник (верх)",
  kromka_bottom: "Кромочник (низ)",
  wait_pras: "Ожидают присадку",
  pras_top: "Присадка (верх)",
  pras_bottom: "Присадка (низ)",
  assembly_ready: "Готовы к сборке",
  ready_to_ship: "Готовы к отправке",
};

function lc(value) {
  return String(value || "").toLowerCase();
}

function readExecutorFromStatus(status, patterns) {
  const text = lc(status);
  for (const { re, name } of patterns) {
    if (re.test(text)) return name;
  }
  return "";
}

export function readKromkaExecutor(order, executorByOrder = {}, kromkaExecutors = []) {
  const orderId = String(order?.orderId || order?.order_id || "").trim();
  const fromPicker = String(executorByOrder[orderId] || "").trim();
  if (fromPicker) return fromPicker;
  const fromStatus = readExecutorFromStatus(order?.kromkaStatus || order?.kromka, [
    { re: /сереж/, name: "Сережа" },
    { re: /слава/, name: "Слава" },
  ]);
  if (fromStatus) return fromStatus;
  return String(kromkaExecutors[0] || "").trim();
}

export function readPrasExecutor(order, executorByOrder = {}, prasExecutors = []) {
  const orderId = String(order?.orderId || order?.order_id || "").trim();
  const fromPicker = String(executorByOrder[`${orderId}:pras`] || "").trim();
  if (fromPicker) return fromPicker;
  const fromStatus = readExecutorFromStatus(order?.prasStatus || order?.pras, [
    { re: /лех|лёх|алекс/, name: "Леха" },
    { re: /виталик/, name: "Виталик" },
  ]);
  if (fromStatus) return fromStatus;
  return String(prasExecutors[0] || "").trim();
}

function isTopKromkaExecutor(name, kromkaExecutors = []) {
  const top = String(kromkaExecutors[1] || "Сережа").trim();
  const n = String(name || "").trim();
  if (!n) return false;
  if (n === top) return true;
  return /сереж/i.test(n);
}

function isTopPrasExecutor(name, prasExecutors = []) {
  const top = String(prasExecutors[0] || "Леха").trim();
  const n = String(name || "").trim();
  if (!n) return false;
  if (n === top) return true;
  return /лех|лёх|алекс/i.test(n);
}

export function classifyWorkshopFloorZone(
  order,
  { isDone, isInWork, executorByOrder = {}, kromkaExecutors = [], prasExecutors = [] },
) {
  const stage = resolvePipelineStage(order);
  if (stage === PipelineStage.READY_TO_SHIP || stage === PipelineStage.ASSEMBLED) {
    return FLOOR_ZONES.ready_to_ship;
  }
  if (stage === PipelineStage.WORKSHOP_COMPLETE) return FLOOR_ZONES.assembly_ready;
  if (stage === PipelineStage.SHIPPED || stage === PipelineStage.WAREHOUSE_KIT) {
    return null;
  }

  const pilka = String(order?.pilkaStatus || order?.pilka_status || order?.pilka || "");
  const kromka = String(order?.kromkaStatus || order?.kromka_status || order?.kromka || "");
  const pras = String(order?.prasStatus || order?.pras_status || order?.pras || "");

  const pilkaDone = isDone(pilka);
  const kromkaDone = isDone(kromka);
  const prasDone = isDone(pras);

  if (!pilkaDone) {
    if (isInWork(pilka)) return FLOOR_ZONES.pilka;
    return FLOOR_ZONES.wait_pilka;
  }

  if (!kromkaDone) {
    if (isInWork(kromka)) {
      const exec = readKromkaExecutor(order, executorByOrder, kromkaExecutors);
      return isTopKromkaExecutor(exec, kromkaExecutors)
        ? FLOOR_ZONES.kromka_top
        : FLOOR_ZONES.kromka_bottom;
    }
    return FLOOR_ZONES.wait_kromka;
  }

  if (!prasDone) {
    if (isInWork(pras)) {
      const exec = readPrasExecutor(order, executorByOrder, prasExecutors);
      return isTopPrasExecutor(exec, prasExecutors)
        ? FLOOR_ZONES.pras_top
        : FLOOR_ZONES.pras_bottom;
    }
    return FLOOR_ZONES.wait_pras;
  }

  return null;
}

export function formatFloorOrderLabel(order) {
  const id = String(order?.orderId || order?.order_id || "").trim();
  const item = stripPlanItemMeta(String(order?.item || "")).trim() || "—";
  const qty = Number(order?.qty || 0);
  const week = String(order?.week || "").trim();
  const parts = [`#${id || "?"}`, item];
  if (qty > 0) parts.push(`${qty} шт`);
  if (week) parts.push(`план ${week}`);
  return parts.join(" · ");
}

export function buildWorkshopFloorMap(
  orders = [],
  options = {},
) {
  const buckets = Object.fromEntries(Object.values(FLOOR_ZONES).map((z) => [z, []]));
  const { isDone, isInWork } = options;

  (Array.isArray(orders) ? orders : []).forEach((order) => {
    if (typeof isDone !== "function" || typeof isInWork !== "function") return;
    const zone = classifyWorkshopFloorZone(order, options);
    if (!zone || !buckets[zone]) return;
    buckets[zone].push({
      orderId: String(order?.orderId || order?.order_id || "").trim(),
      label: formatFloorOrderLabel(order),
      order,
    });
  });

  Object.values(buckets).forEach((list) => {
    list.sort((a, b) => String(a.label).localeCompare(String(b.label), "ru"));
  });

  const kromkaTopExec = String(options.kromkaExecutors?.[1] || "Сережа").trim();
  const kromkaBottomExec = String(options.kromkaExecutors?.[0] || "Слава").trim();
  const prasTopExec = String(options.prasExecutors?.[0] || "Леха").trim();
  const prasBottomExec = String(options.prasExecutors?.[1] || "Виталик").trim();

  return {
    zones: buckets,
    counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
    machineLabels: {
      kromka_top: kromkaTopExec,
      kromka_bottom: kromkaBottomExec,
      pras_top: prasTopExec,
      pras_bottom: prasBottomExec,
    },
  };
}
