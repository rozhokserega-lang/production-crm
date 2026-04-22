function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[ё]/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNum(value) {
  const parsed = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveHeaderIndexes(headers = []) {
  return {
    code: headers.findIndex((h) => h === "код" || h.includes("артикул")),
    name: headers.findIndex((h) => h === "наименование" || h.includes("название")),
    qty: headers.findIndex((h) => h === "готово к отгрузке" || h.includes("налич") || h.includes("кол")),
  };
}

export function parseMetalImportRows(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const headers = Array.isArray(rows[0]) ? rows[0].map(normalizeHeader) : [];
  const idx = resolveHeaderIndexes(headers);
  const hasHeader = idx.code >= 0 || idx.name >= 0 || idx.qty >= 0;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const parsedRows = [];

  dataRows.forEach((raw) => {
    const row = Array.isArray(raw) ? raw : [];
    const metalArticle = String((idx.code >= 0 ? row[idx.code] : row[0]) || "").trim();
    const metalName = String((idx.name >= 0 ? row[idx.name] : row[1]) || "").trim();
    const qtyAvailable = toNum(idx.qty >= 0 ? row[idx.qty] : row[2]);
    if (!metalArticle) return;
    parsedRows.push({
      metalArticle,
      metalName,
      qtyAvailable: Math.max(0, qtyAvailable),
    });
  });

  return parsedRows;
}

export function getMetalImportNoValidRowsError() {
  return "Не найдено валидных строк. Используйте шаблон с колонками: Код, Наименование, Готово к отгрузке.";
}

export function formatMetalImportError(errorText = "") {
  return `Ошибка импорта металла: ${String(errorText || "").trim()}`;
}
