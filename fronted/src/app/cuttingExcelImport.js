/**
 * Импорт деталей для раскроя из Excel-файла формата BAZIS/КроватьМебель.
 *
 * Ожидаемые колонки (1-based, как в Excel):
 *   A  (0)  — «Кроить» ("Да" / "Нет") — если есть, пропускаем "Нет"
 *   B  (1)  — «Тип материала»
 *   C  (2)  — «Позиция»
 *   D  (3)  — «Наименование»
 *   G  (6)  — «Длина распиловочная» (ширина детали, мм)
 *   H  (7)  — «Ширина распиловочная» (высота детали, мм)
 *   I  (8)  — «Кол-во»
 *   W  (22) — «Материал» (полное название листа)
 *
 * Если структура не совпадает — парсер автоматически ищет числовые колонки.
 */

import * as XLSX from "xlsx";

// ─── column indices ───────────────────────────────────────────────────────────
const COL_CUT      = 0;  // A — «Кроить»
const COL_POS      = 2;  // C — позиция
const COL_NAME     = 3;  // D — наименование
const COL_LEN      = 6;  // G — длина распиловочная
const COL_WID      = 7;  // H — ширина распиловочная
const COL_QTY      = 8;  // I — количество
const COL_MATERIAL = 22; // W — материал (полное имя листа)

// ─── helpers ─────────────────────────────────────────────────────────────────

function toNum(v) {
  if (v === null || v === undefined || v === "") return NaN;
  const n = parseFloat(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : NaN;
}

function toStr(v) {
  return String(v ?? "").trim();
}

/** Извлекаем краткое имя материала из строки вида "ЛДСП Графит 665 PO (2800*2070*16 мм) BYSPAN" */
function shortMaterial(raw) {
  if (!raw) return "";
  // Обрезаем скобки и размеры листа в конце
  return raw.replace(/\s*\(\d+[*×x]\d+[*×x]?\d*\s*мм?\).*$/i, "").trim();
}

// ─── detector: is this a header row? ─────────────────────────────────────────

function looksLikeHeader(row) {
  const g = toStr(row[COL_LEN]).toLowerCase();
  const h = toStr(row[COL_WID]).toLowerCase();
  return (
    g.includes("длин") || g.includes("распил") ||
    h.includes("ширин") || h.includes("распил") ||
    g === "g" || h === "h"
  );
}

// ─── main parser ─────────────────────────────────────────────────────────────

/**
 * Парсит ArrayBuffer Excel-файла.
 * @param {ArrayBuffer} buffer
 * @returns {{ items: Array, warnings: string[] }}
 *   items: [{itemName, w, h, qty, material}]
 *   warnings: строки с предупреждениями (пропущенные строки и т.п.)
 */
export function parseExcelForCutting(buffer) {
  const wb = XLSX.read(buffer, { type: "array" });
  const wsName = wb.SheetNames[0];
  const ws = wb.Sheets[wsName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const items = [];
  const warnings = [];
  let skipped = 0;
  let headerFound = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // Пропускаем строку-заголовок
    if (!headerFound && looksLikeHeader(row)) {
      headerFound = true;
      continue;
    }

    const cutFlag = toStr(row[COL_CUT]).toLowerCase();
    // Если колонка A заполнена и явно "нет" — пропускаем
    if (cutFlag && cutFlag !== "да" && cutFlag !== "yes" && cutFlag !== "1") {
      skipped++;
      continue;
    }

    const w = toNum(row[COL_LEN]);
    const h = toNum(row[COL_WID]);
    const qty = toNum(row[COL_QTY]);

    // Обязательные поля — размеры
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) continue;

    const qtyFinal = isNaN(qty) || qty <= 0 ? 1 : Math.round(qty);

    const pos  = toStr(row[COL_POS]);
    const name = toStr(row[COL_NAME]);
    const label = [pos, name].filter(Boolean).join(" ") || `${w}×${h}`;

    const matRaw = toStr(row[COL_MATERIAL]);
    const material = shortMaterial(matRaw);

    // Merge identical pieces (same label + material)
    const existing = items.find(
      (it) => it.itemName === label && it.material === material
    );
    if (existing) {
      existing.qty += qtyFinal;
    } else {
      items.push({ itemName: label, w, h, qty: qtyFinal, material });
    }
  }

  if (skipped > 0) {
    warnings.push(`Пропущено ${skipped} строк (колонка «Кроить» ≠ «Да»)`);
  }
  if (items.length === 0) {
    warnings.push("Не найдено деталей с корректными размерами в колонках G и H");
  }

  return { items, warnings };
}

/**
 * Читает File (из <input type="file">) и возвращает Promise<{items, warnings}>.
 * @param {File} file
 */
export function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(parseExcelForCutting(e.target.result));
      } catch (err) {
        reject(new Error(`Ошибка чтения файла: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsArrayBuffer(file);
  });
}
