import { resolveLaborGroup } from "./laborGroupHelpers";

export const SHOP_KROMKA_POOL = 2;
export const SHOP_PRAS_POOL = 2;

function toPositiveInt(value, fallback = 1, max = 2) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(max, Math.max(1, n));
}

function toPositiveNumber(value) {
  const n = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Минуты в поле формы: сохраняем доли (0.4), без округления до целых. */
export function formatMinutesForForm(value) {
  const n = toPositiveNumber(value);
  if (n <= 0) return "";
  return String(parseFloat(n.toFixed(2)));
}

/** Приводит короткие коды обвязки (1000_80) к группе нормативов. */
export function resolveKitGroupName(groupRaw = "") {
  const group = String(groupRaw || "").trim();
  if (!group) return "";
  if (/^\d{2,4}_\d{2,4}$/.test(group)) return `Обвязка ${group}`;
  if (/^обвязка/i.test(group)) return resolveLaborGroup(group) || group;
  return group;
}

export function normalizeKitItem(raw = {}, ratesByGroup = new Map()) {
  const group = resolveKitGroupName(raw.group || raw.groupName || "");
  const kind = String(raw.kind || raw.type || "").trim() === "strap" ? "strap" : "product";
  const qty = Math.max(0.01, toPositiveNumber(raw.qty) || 1);
  const rate = ratesByGroup.get(group) || null;
  const useCustomTimes = Boolean(raw.useCustomTimes || raw.use_custom_times);
  const pilkaMin = useCustomTimes
    ? toPositiveNumber(raw.pilkaMin ?? raw.pilka_min)
    : toPositiveNumber(rate?.pilka ?? rate?.pilkaMin ?? raw.pilkaMin ?? raw.pilka_min);
  const kromkaMin = useCustomTimes
    ? toPositiveNumber(raw.kromkaMin ?? raw.kromka_min)
    : toPositiveNumber(rate?.kromka ?? rate?.kromkaMin ?? raw.kromkaMin ?? raw.kromka_min);
  const prasMin = useCustomTimes
    ? toPositiveNumber(raw.prasMin ?? raw.pras_min)
    : toPositiveNumber(rate?.pras ?? rate?.prasMin ?? raw.prasMin ?? raw.pras_min);
  const assemblyMin = useCustomTimes
    ? toPositiveNumber(raw.assemblyMin ?? raw.assembly_min)
    : toPositiveNumber(rate?.assembly ?? rate?.assemblyMin ?? raw.assemblyMin ?? raw.assembly_min);

  return {
    group,
    kind,
    qty,
    useCustomTimes,
    pilkaMin,
    kromkaMin,
    prasMin,
    assemblyMin,
    kromkaMachines: toPositiveInt(raw.kromkaMachines ?? raw.kromka_machines, 1, SHOP_KROMKA_POOL),
    prasMachines: toPositiveInt(raw.prasMachines ?? raw.pras_machines, 1, SHOP_PRAS_POOL),
    parentGroup: String(raw.parentGroup || raw.parent_group || "").trim(),
  };
}

export function buildRatesByGroup(laborPlannerRows = []) {
  const map = new Map();
  (Array.isArray(laborPlannerRows) ? laborPlannerRows : []).forEach((row) => {
    const key = resolveKitGroupName(row?.group);
    if (!key) return;
    map.set(key, {
      pilka: Number(row.pilkaPerQtyMin || 0),
      kromka: Number(row.kromkaPerQtyMin || 0),
      pras: Number(row.prasPerQtyMin || 0),
      assembly: Number(row.assemblyPerQtyMin || 0),
      total: Number(row.laborPerQtyMin || 0),
    });
  });
  return map;
}

function expandStageJobs(items, stageKey, machinesKey) {
  const jobs = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const base = toPositiveNumber(item[`${stageKey}Min`]);
    const machines = toPositiveInt(item[machinesKey], 1, stageKey === "kromka" ? SHOP_KROMKA_POOL : SHOP_PRAS_POOL);
    const units = Math.max(1, Math.round(toPositiveNumber(item.qty)));
    if (base <= 0) return;
    const duration = base / machines;
    for (let i = 0; i < units; i += 1) {
      jobs.push({ duration, machines });
    }
  });
  return jobs;
}

/** Минимальное время этапа при ограниченном пуле станков. */
export function scheduleStageMakespan(jobs = [], pool = 1) {
  const safePool = Math.max(1, Math.round(Number(pool) || 1));
  const list = (Array.isArray(jobs) ? jobs : [])
    .map((job) => ({
      duration: Math.max(0, Number(job?.duration || 0)),
      machines: toPositiveInt(job?.machines, 1, safePool),
    }))
    .filter((job) => job.duration > 0)
    .sort((a, b) => b.duration - a.duration);

  if (!list.length) return 0;
  const freeAt = Array.from({ length: safePool }, () => 0);

  list.forEach((job) => {
    const need = Math.min(job.machines, safePool);
    if (need >= safePool) {
      const start = Math.max(...freeAt);
      const end = start + job.duration;
      for (let i = 0; i < safePool; i += 1) freeAt[i] = end;
      return;
    }
    const indices = [...freeAt.keys()]
      .sort((a, b) => freeAt[a] - freeAt[b])
      .slice(0, need);
    const start = Math.max(...indices.map((i) => freeAt[i]));
    const end = start + job.duration;
    indices.forEach((i) => {
      freeAt[i] = end;
    });
  });

  return Math.max(...freeAt);
}

export function calcKitLabor(
  rawItems = [],
  {
    kitCount = 1,
    ratesByGroup = new Map(),
    kromkaPool = SHOP_KROMKA_POOL,
    prasPool = SHOP_PRAS_POOL,
  } = {},
) {
  const items = (Array.isArray(rawItems) ? rawItems : []).map((x) => normalizeKitItem(x, ratesByGroup));
  const kits = Math.max(0, toPositiveNumber(kitCount));

  const pilkaSeq = items.reduce((sum, item) => sum + item.pilkaMin * item.qty, 0);
  const kromkaSeq = items.reduce((sum, item) => sum + item.kromkaMin * item.qty, 0);
  const prasSeq = items.reduce((sum, item) => sum + item.prasMin * item.qty, 0);
  const assemblySeq = items.reduce((sum, item) => sum + item.assemblyMin * item.qty, 0);
  const seqPerKit = pilkaSeq + kromkaSeq + prasSeq + assemblySeq;

  const kromkaJobs = expandStageJobs(items, "kromka", "kromkaMachines");
  const prasJobs = expandStageJobs(items, "pras", "prasMachines");
  const kromkaParallelPerKit = scheduleStageMakespan(kromkaJobs, kromkaPool);
  const prasParallelPerKit = scheduleStageMakespan(prasJobs, prasPool);
  const parallelPerKit = pilkaSeq + kromkaParallelPerKit + prasParallelPerKit + assemblySeq;

  const batchKromkaJobs = Array.from({ length: Math.max(1, Math.round(kits)) }, () => kromkaJobs)
    .flat();
  const batchPrasJobs = Array.from({ length: Math.max(1, Math.round(kits)) }, () => prasJobs)
    .flat();
  const batchKromka = kits > 0 ? scheduleStageMakespan(batchKromkaJobs, kromkaPool) : 0;
  const batchPras = kits > 0 ? scheduleStageMakespan(batchPrasJobs, prasPool) : 0;
  const batchPilka = pilkaSeq * kits;
  const batchAssembly = assemblySeq * kits;
  const batchParallel = batchPilka + batchKromka + batchPras + batchAssembly;
  const batchSeq = seqPerKit * kits;

  const missingItems = items
    .filter((item) => {
      const total = item.pilkaMin + item.kromkaMin + item.prasMin + item.assemblyMin;
      return total <= 0;
    })
    .map((item) => item.group);

  return {
    items,
    seqPerKit,
    parallelPerKit,
    pilkaSeq,
    kromkaSeq,
    prasSeq,
    assemblySeq,
    kromkaParallelPerKit,
    prasParallelPerKit,
    kits,
    batchSeq,
    batchParallel,
    missingItems,
  };
}

function formatHhMm(totalMin) {
  const safe = Math.max(0, Number(totalMin || 0));
  const hours = Math.floor(safe / 60);
  const minutes = Math.round(safe % 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

/** План по одной группе: N заказов по 1 станку → делятся между 2 станками. */
export function calcGroupPlanLabor(
  {
    pilkaPerQtyMin = 0,
    kromkaPerQtyMin = 0,
    prasPerQtyMin = 0,
    assemblyPerQtyMin = 0,
    kromkaMachines = 1,
    prasMachines = 1,
  },
  qty = 0,
  { kromkaPool = SHOP_KROMKA_POOL, prasPool = SHOP_PRAS_POOL } = {},
) {
  const units = Math.max(0, Math.round(toPositiveNumber(qty)));
  if (units <= 0) {
    return { seqTotal: 0, parallelTotal: 0, hhmmSeq: "0:00", hhmmParallel: "0:00" };
  }

  const pilka = toPositiveNumber(pilkaPerQtyMin) * units;
  const assembly = toPositiveNumber(assemblyPerQtyMin) * units;
  const kromkaSeq = toPositiveNumber(kromkaPerQtyMin) * units;
  const prasSeq = toPositiveNumber(prasPerQtyMin) * units;
  const seqTotal = pilka + kromkaSeq + prasSeq + assembly;

  const km = toPositiveInt(kromkaMachines, 1, kromkaPool);
  const pm = toPositiveInt(prasMachines, 1, prasPool);
  const kromkaJobs = Array.from({ length: units }, () => ({
    duration: toPositiveNumber(kromkaPerQtyMin) / km,
    machines: km,
  })).filter((job) => job.duration > 0);
  const prasJobs = Array.from({ length: units }, () => ({
    duration: toPositiveNumber(prasPerQtyMin) / pm,
    machines: pm,
  })).filter((job) => job.duration > 0);

  const kromkaParallel = scheduleStageMakespan(kromkaJobs, kromkaPool);
  const prasParallel = scheduleStageMakespan(prasJobs, prasPool);
  const parallelTotal = pilka + kromkaParallel + prasParallel + assembly;

  return {
    units,
    seqTotal,
    parallelTotal,
    pilka,
    kromkaSeq,
    prasSeq,
    assembly,
    kromkaParallel,
    prasParallel,
    hhmmSeq: formatHhMm(seqTotal),
    hhmmParallel: formatHhMm(parallelTotal),
  };
}

/**
 * Сводный план: все группы и комплекты в одной очереди на 2 кромочника и 2 присадочных.
 * Если над заказом 1 станок — второй может в это время работать над другим заказом.
 */
export function calcTotalProductionPlan({
  groupPlans = [],
  kitPlans = [],
  ratesByGroup = new Map(),
  kromkaPool = SHOP_KROMKA_POOL,
  prasPool = SHOP_PRAS_POOL,
} = {}) {
  let pilkaTotal = 0;
  let assemblyTotal = 0;
  let kromkaSeq = 0;
  let prasSeq = 0;
  const kromkaJobs = [];
  const prasJobs = [];

  (Array.isArray(groupPlans) ? groupPlans : []).forEach((plan) => {
    const qty = Math.max(0, Math.round(toPositiveNumber(plan.qty)));
    if (qty <= 0) return;
    const key = resolveKitGroupName(plan.group);
    const rate = ratesByGroup.get(key) || plan;
    const pilka = toPositiveNumber(rate.pilka ?? rate.pilkaPerQtyMin ?? plan.pilkaPerQtyMin);
    const kromka = toPositiveNumber(rate.kromka ?? rate.kromkaPerQtyMin ?? plan.kromkaPerQtyMin);
    const pras = toPositiveNumber(rate.pras ?? rate.prasPerQtyMin ?? plan.prasPerQtyMin);
    const assembly = toPositiveNumber(rate.assembly ?? rate.assemblyPerQtyMin ?? plan.assemblyPerQtyMin);
    const km = toPositiveInt(plan.kromkaMachines, 1, kromkaPool);
    const pm = toPositiveInt(plan.prasMachines, 1, prasPool);

    pilkaTotal += pilka * qty;
    assemblyTotal += assembly * qty;
    kromkaSeq += kromka * qty;
    prasSeq += pras * qty;

    for (let i = 0; i < qty; i += 1) {
      if (kromka > 0) kromkaJobs.push({ duration: kromka / km, machines: km, source: key });
      if (pras > 0) prasJobs.push({ duration: pras / pm, machines: pm, source: key });
    }
  });

  (Array.isArray(kitPlans) ? kitPlans : []).forEach((plan) => {
    const qty = Math.max(0, Math.round(toPositiveNumber(plan.qty)));
    if (qty <= 0 || !Array.isArray(plan.items) || !plan.items.length) return;
    const perKit = calcKitLabor(plan.items, { kitCount: 1, ratesByGroup, kromkaPool, prasPool });
    pilkaTotal += perKit.pilkaSeq * qty;
    assemblyTotal += perKit.assemblySeq * qty;
    kromkaSeq += perKit.kromkaSeq * qty;
    prasSeq += perKit.prasSeq * qty;

    const kitKromkaJobs = expandStageJobs(perKit.items, "kromka", "kromkaMachines");
    const kitPrasJobs = expandStageJobs(perKit.items, "pras", "prasMachines");
    for (let i = 0; i < qty; i += 1) {
      kromkaJobs.push(...kitKromkaJobs);
      prasJobs.push(...kitPrasJobs);
    }
  });

  const kromkaParallel = scheduleStageMakespan(kromkaJobs, kromkaPool);
  const prasParallel = scheduleStageMakespan(prasJobs, prasPool);
  const seqTotal = pilkaTotal + kromkaSeq + prasSeq + assemblyTotal;
  const parallelTotal = pilkaTotal + kromkaParallel + prasParallel + assemblyTotal;

  return {
    pilkaTotal: Math.round(pilkaTotal),
    kromkaSeq: Math.round(kromkaSeq),
    prasSeq: Math.round(prasSeq),
    assemblyTotal: Math.round(assemblyTotal),
    kromkaParallel: Math.round(kromkaParallel),
    prasParallel: Math.round(prasParallel),
    seqTotal: Math.round(seqTotal),
    parallelTotal: Math.round(parallelTotal),
    savingsMin: Math.round(Math.max(0, seqTotal - parallelTotal)),
    kromkaJobCount: kromkaJobs.length,
    prasJobCount: prasJobs.length,
    hhmmSeq: formatHhMm(seqTotal),
    hhmmParallel: formatHhMm(parallelTotal),
    hasPlan: seqTotal > 0,
  };
}

export function formatKitItemLabel(item = {}) {
  const prefix = item.kind === "strap" ? "обвязка " : "";
  return `${prefix}${item.group} x ${item.qty} [К${item.kromkaMachines}/П${item.prasMachines}]`;
}

export function formatKitItemShort(item = {}) {
  const prefix = item.kind === "strap" ? "обв. " : "";
  const group = String(item.group || "").replace(/^Обвязка /, "");
  return `${prefix}${group}×${item.qty}`;
}

function inferUseCustomTimes(rawItem = {}, ratesByGroup = new Map()) {
  if (Boolean(rawItem.useCustomTimes || rawItem.use_custom_times)) return true;
  const group = resolveKitGroupName(rawItem.group || rawItem.groupName || "");
  const rate = ratesByGroup.get(group);
  if (!rate) return false;
  const near = (left, right) => Math.abs(toPositiveNumber(left) - toPositiveNumber(right)) <= 0.01;
  const fields = [
    ["pilkaMin", "pilka_min", "pilka"],
    ["kromkaMin", "kromka_min", "kromka"],
    ["prasMin", "pras_min", "pras"],
    ["assemblyMin", "assembly_min", "assembly"],
  ];
  return fields.some(([minKey, snakeKey, rateKey]) => {
    const stored = toPositiveNumber(rawItem[minKey] ?? rawItem[snakeKey]);
    if (stored <= 0) return false;
    return !near(stored, rate[rateKey]);
  });
}

function itemToTimeFormFields(rawItem = {}, ratesByGroup = new Map()) {
  const useCustomTimes = inferUseCustomTimes(rawItem, ratesByGroup);
  const normalized = normalizeKitItem({ ...rawItem, useCustomTimes }, ratesByGroup);
  return {
    useCustomTimes,
    pilkaMin: formatMinutesForForm(normalized.pilkaMin),
    kromkaMin: formatMinutesForForm(normalized.kromkaMin),
    prasMin: formatMinutesForForm(normalized.prasMin),
    assemblyMin: formatMinutesForForm(normalized.assemblyMin),
  };
}

export function kitItemToStrapDraft(rawItem = {}, ratesByGroup = new Map(), id = "") {
  const item = normalizeKitItem(rawItem, ratesByGroup);
  return {
    id: id || `strap-${item.group}-${Math.random().toString(36).slice(2, 7)}`,
    group: item.group,
    qty: String(item.qty),
    ...itemToTimeFormFields(rawItem, ratesByGroup),
    kromkaMachines: String(item.kromkaMachines),
    prasMachines: String(item.prasMachines),
  };
}

export function kitItemsToSectionDrafts(items = [], ratesByGroup = new Map()) {
  const normalized = (Array.isArray(items) ? items : []).map((raw) => normalizeKitItem(raw, ratesByGroup));
  const sections = [];
  for (let i = 0; i < normalized.length; i += 1) {
    const item = normalized[i];
    if (item.kind === "strap") continue;
    const rawItem = Array.isArray(items) ? items[i] : item;
    const straps = [];
    let j = i + 1;
    while (j < normalized.length && normalized[j].kind === "strap") {
      straps.push(kitItemToStrapDraft(items[j], ratesByGroup));
      j += 1;
    }
    sections.push({
      id: `sec-${sections.length}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      group: item.group,
      qty: String(item.qty),
      ...itemToTimeFormFields(rawItem, ratesByGroup),
      kromkaMachines: String(item.kromkaMachines),
      prasMachines: String(item.prasMachines),
      straps,
    });
    i = j - 1;
  }
  return sections;
}

export function sectionDraftToKitItems(sectionDraft = {}, ratesByGroup = new Map()) {
  const group = resolveKitGroupName(sectionDraft.group);
  const qty = Math.max(0.01, toPositiveNumber(sectionDraft.qty) || 1);
  if (!group) return [];

  const useCustomTimes = Boolean(sectionDraft.useCustomTimes);
  const productItem = normalizeKitItem({
    group,
    kind: "product",
    qty,
    useCustomTimes,
    pilkaMin: useCustomTimes ? toPositiveNumber(sectionDraft.pilkaMin) : 0,
    kromkaMin: useCustomTimes ? toPositiveNumber(sectionDraft.kromkaMin) : 0,
    prasMin: useCustomTimes ? toPositiveNumber(sectionDraft.prasMin) : 0,
    assemblyMin: useCustomTimes ? toPositiveNumber(sectionDraft.assemblyMin) : 0,
    kromkaMachines: sectionDraft.kromkaMachines,
    prasMachines: sectionDraft.prasMachines,
  }, ratesByGroup);

  const items = [productItem];
  (Array.isArray(sectionDraft.straps) ? sectionDraft.straps : []).forEach((strap) => {
    if (!strap?.group) return;
    const strapGroup = resolveKitGroupName(strap.group);
    const strapQty = Math.max(0.01, toPositiveNumber(strap.qty) || 1);
    const strapCustom = Boolean(strap.useCustomTimes);
    items.push(normalizeKitItem({
      group: strapGroup,
      kind: "strap",
      qty: strapQty,
      parentGroup: group,
      useCustomTimes: strapCustom,
      pilkaMin: strapCustom ? toPositiveNumber(strap.pilkaMin) : 0,
      kromkaMin: strapCustom ? toPositiveNumber(strap.kromkaMin) : 0,
      prasMin: strapCustom ? toPositiveNumber(strap.prasMin) : 0,
      assemblyMin: strapCustom ? toPositiveNumber(strap.assemblyMin) : 0,
      kromkaMachines: strap.kromkaMachines,
      prasMachines: strap.prasMachines,
    }, ratesByGroup));
  });
  return items;
}

export function sectionDraftsToKitItems(sections = [], ratesByGroup = new Map()) {
  return (Array.isArray(sections) ? sections : []).flatMap((section) => sectionDraftToKitItems(section, ratesByGroup));
}
