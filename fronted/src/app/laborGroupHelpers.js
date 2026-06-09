export const LABOR_GROUP_ORDER = [
  "Avella",
  "Avella lite",
  "Cremona",
  "Donini",
  "Donini Grande",
  "Donini r",
  "Solito",
  "Solito2",
  "Stabile",
  "Премьер",
  "ТВ Лофт",
  "Классико",
  "Siena",
];

function normItemText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[ё]/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSizeToken(value) {
  const raw = String(value || "");
  const m = raw.match(/(\d{2,4})\s*[_xх]\s*(\d{2,4})/i);
  if (!m) return "";
  return `${m[1]}_${m[2]}`;
}

/** Группа изделия для агрегации трудоёмкости (как во вкладке «По заказам»). */
export function resolveLaborGroup(itemRaw) {
  const n = normItemText(itemRaw);
  const sizeToken = extractSizeToken(itemRaw);
  if (n.includes("обвязка")) {
    return sizeToken ? `Обвязка ${sizeToken}` : "Обвязка";
  }
  if (n.includes("1153") && n.includes("320")) return "";
  if (n.includes("avella lite") || n.includes("авелла лайт") || n.includes("авела лайт")) return "Avella lite";
  if (n.includes("avella") || n.includes("авелла") || n.includes("авела")) return "Avella";
  if (n.includes("cremona") || n.includes("кремона")) return "Cremona";
  if (n.includes("stabile") || n.includes("стабиле")) return "Stabile";
  if (n.includes("donini grande")) return "Donini Grande";
  if (n.includes("donini r")) return "Donini r";
  if (n.includes("donini")) return "Donini";
  if (n.includes("solito2")) return "Solito2";
  if (n.includes("solito") || n.includes("солито")) return "Solito";
  if (n.includes("премьер") || n.includes("premier")) return "Премьер";
  if (n.includes("тв лофт") || n.includes("tv loft") || n.includes("тумба под тв")) return "ТВ Лофт";
  if (n.includes("классико") || n.includes("classico")) return "Классико";
  if (n.includes("siena")) return "Siena";
  const first = String(itemRaw || "").split(".")[0].trim();
  return first || "Прочее";
}

export function sortLaborGroups(a, b) {
  const rank = new Map(LABOR_GROUP_ORDER.map((name, index) => [name, index]));
  const ra = rank.has(a) ? rank.get(a) : 9999;
  const rb = rank.has(b) ? rank.get(b) : 9999;
  if (ra !== rb) return ra - rb;
  return String(a).localeCompare(String(b), "ru");
}

export function normalizeLaborNormRow(raw = {}) {
  const qtyUnit = Math.max(1, Number(raw.qty_unit ?? raw.qtyUnit ?? 1) || 1);
  return {
    id: Number(raw.id || 0) || null,
    groupName: String(raw.group_name || raw.groupName || "").trim(),
    pilkaMin: Number(raw.pilka_min ?? raw.pilkaMin ?? 0) || 0,
    kromkaMin: Number(raw.kromka_min ?? raw.kromkaMin ?? 0) || 0,
    prasMin: Number(raw.pras_min ?? raw.prasMin ?? 0) || 0,
    assemblyMin: Number(raw.assembly_min ?? raw.assemblyMin ?? 0) || 0,
    qtyUnit,
    note: String(raw.note || "").trim(),
    updatedAt: String(raw.updated_at || raw.updatedAt || ""),
  };
}

export function laborNormHasValues(norm) {
  if (!norm) return false;
  return (
    Number(norm.pilkaMin || 0) > 0
    || Number(norm.kromkaMin || 0) > 0
    || Number(norm.prasMin || 0) > 0
    || Number(norm.assemblyMin || 0) > 0
  );
}

export function laborNormPerQty(norm) {
  const unit = Math.max(1, Number(norm?.qtyUnit || 1) || 1);
  const pilka = Number(norm?.pilkaMin || 0) / unit;
  const kromka = Number(norm?.kromkaMin || 0) / unit;
  const pras = Number(norm?.prasMin || 0) / unit;
  const assembly = Number(norm?.assemblyMin || 0) / unit;
  const total = pilka + kromka + pras + assembly;
  return { pilka, kromka, pras, assembly, total, unit };
}
