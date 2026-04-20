function toNum(v) {
  const n = Number(String(v ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

function normalizeHeader(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[ё]/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveHeaderIndexes(headers = []) {
  return {
    orderId: headers.findIndex((h) => h === "id заказа" || h === "id"),
    item: headers.findIndex((h) => h === "изделие" || h === "наименование"),
    week: headers.findIndex((h) => h === "план" || h === "неделя"),
    qty: headers.findIndex((h) => h.includes("кол") && h.includes("во")),
    pilka: headers.findIndex((h) => h.includes("пилка")),
    kromka: headers.findIndex((h) => h.includes("кромка")),
    pras: headers.findIndex((h) => h.includes("присад")),
    total: headers.findIndex((h) => h.includes("итого")),
    date: headers.findIndex((h) => h.includes("дата")),
  };
}

export function parseLaborImportRows(rows = [], nowKey = Date.now()) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const headers = Array.isArray(rows[0]) ? rows[0].map(normalizeHeader) : [];
  const idx = resolveHeaderIndexes(headers);
  const hasHeader = idx.item >= 0 || idx.total >= 0 || idx.pilka >= 0 || idx.kromka >= 0 || idx.pras >= 0;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const imported = [];
  dataRows.forEach((rawRow, i) => {
    const row = Array.isArray(rawRow) ? rawRow : [];
    const item = String((idx.item >= 0 ? row[idx.item] : row[1]) || "").trim();
    const orderId = String((idx.orderId >= 0 ? row[idx.orderId] : row[0]) || "").trim();
    const week = String((idx.week >= 0 ? row[idx.week] : row[2]) || "").trim();
    const qty = toNum(idx.qty >= 0 ? row[idx.qty] : row[3]);
    const pilkaMin = toNum(idx.pilka >= 0 ? row[idx.pilka] : row[4]);
    const kromkaMin = toNum(idx.kromka >= 0 ? row[idx.kromka] : row[5]);
    const prasMin = toNum(idx.pras >= 0 ? row[idx.pras] : row[6]);
    const totalRaw = toNum(idx.total >= 0 ? row[idx.total] : row[7]);
    const totalMin = totalRaw > 0 ? totalRaw : pilkaMin + kromkaMin + prasMin;
    const dateFinished = String((idx.date >= 0 ? row[idx.date] : row[8]) || "").trim();
    if (!item && !orderId) return;
    if (totalMin <= 0 && pilkaMin <= 0 && kromkaMin <= 0 && prasMin <= 0) return;
    imported.push({
      order_id: orderId || `IMPORT-${Date.now()}-${i + 1}`,
      item: item || "Импортированная позиция",
      week,
      qty,
      pilka_min: pilkaMin,
      kromka_min: kromkaMin,
      pras_min: prasMin,
      total_min: totalMin,
      date_finished: dateFinished,
      imported_local: true,
      import_key: `labor-import-${nowKey}-${i + 1}`,
    });
  });
  return imported;
}

export function buildLaborFactPayload(row = {}) {
  return {
    orderId: row.orderId,
    item: row.item,
    week: row.week,
    qty: row.qty,
    pilkaMin: row.pilkaMin,
    kromkaMin: row.kromkaMin,
    prasMin: row.prasMin,
    assemblyMin: row.assemblyMin,
    dateFinished: row.dateFinished || null,
  };
}

export function markLaborImportRowSaved(rows = [], importKey = "") {
  const key = String(importKey || "");
  if (!key) return rows;
  return rows.map((x) =>
    String(x.import_key || "") === key
      ? { ...x, imported_local: false, imported_saved: true }
      : x,
  );
}

export function getLaborImportNoValidRowsError() {
  return "Не найдено валидных строк. Используйте экспорт из раздела 'Трудоемкость -> Общая' как шаблон.";
}

export function formatLaborImportError(errMsg = "") {
  return `Ошибка импорта трудоемкости: ${String(errMsg || "").trim()}`;
}

export function formatLaborSaveRowError(errMsg = "") {
  return `Не удалось сохранить строку трудоемкости: ${String(errMsg || "").trim()}`;
}
