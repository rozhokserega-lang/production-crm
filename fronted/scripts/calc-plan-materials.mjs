/**
 * Универсальный расчёт материалов по плану производства (xlsx).
 *
 * Берёт любой файл плана: колонки определяются по заголовкам
 * («Артикул», «Название», «План производства»/«Количество»), поэтому
 * подходят и старый формат (артикул в 1-й колонке), и новый (с колонкой «Категория»).
 *
 * Запуск (через Vite-окружение, обычный node не резолвит импорты без расширений):
 *   cd fronted
 *   npx vite-node scripts/calc-plan-materials.mjs "<путь к плану.xlsx>" ["<путь к результату.xlsx>"]
 *
 * Результат — копия плана рядом с исходником: "<имя> — материалы.xlsx"
 * (колонки «Листов ЛДСП», «Декор», «ЛДСП детали», «Обвязка» + листы «Итого» и «Без нормы»).
 */
import ExcelJS from "exceljs";
import { basename, dirname, extname, join } from "node:path";
import { existsSync } from "node:fs";
import { parseStrapSize } from "../src/app/appUtils.js";
import { STRAP_SHEET_HEIGHT, STRAP_SHEET_WIDTH } from "../src/constants/views.js";
import {
  getResolvedWorkshopStrapNeeds,
  strapConsumeColorForOrder,
  strapDisplayNameForCode,
} from "../src/app/workshopStrapNeeds.js";
import { normalizeFurnitureKey } from "../src/utils/furnitureUtils.js";
import {
  calculateAugustPlanMaterials,
  fetchAugustPlanCalcData,
} from "./augustPlanMaterialCalc.js";

function cellText(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    if (value.richText) return value.richText.map((p) => p.text || "").join("").trim();
    if (value.text) return String(value.text).trim();
    if (value.result != null) return String(value.result).trim();
    if (value.formula) return "";
  }
  return String(value).trim();
}

function cellNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = cellText(value).replace(/\s+/g, "").replace(",", ".");
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

/** Ищем строку заголовков и колонки по названиям. */
function findPlanLayout(sheet) {
  const maxScan = Math.min(15, sheet.rowCount);
  for (let r = 1; r <= maxScan; r += 1) {
    const row = sheet.getRow(r);
    let articleCol = 0;
    let nameCol = 0;
    let qtyCol = 0;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = cellText(cell.value).toLowerCase();
      if (!articleCol && text.includes("артикул")) articleCol = colNumber;
      else if (!nameCol && text.includes("назван")) nameCol = colNumber;
      else if (
        !qtyCol &&
        (text.includes("план производства") || text.includes("количество") || text.includes("кол-во"))
      ) {
        qtyCol = colNumber;
      }
    });
    if (articleCol && qtyCol) {
      return { headerRow: r, articleCol, nameCol: nameCol || articleCol + 1, qtyCol };
    }
  }
  // Старый формат: артикул/название/количество в колонках 1/2/3, шапка в 3 строках
  return { headerRow: 3, articleCol: 1, nameCol: 2, qtyCol: 3 };
}

/** Обычный Donini 750/806 (не Grande / не R): обвязка белая. */
function isWhiteStrapDonini(article, planName) {
  const code = String(article || "").trim().toLowerCase();
  const name = String(planName || "")
    .toLowerCase()
    .replace(/ё/g, "е");
  if (!code && !name) return false;
  if (code.startsWith("gxkitchtabledo")) return true;
  if (name.includes("donini") && !name.includes("grande") && !/\bdonini\s+r\b/.test(name)) {
    return true;
  }
  return false;
}

function sheetsForStrapQty(name, qty) {
  const size = parseStrapSize(name);
  if (!size || !(qty > 0)) return { sheets: 0, perSheet: 0 };
  const stripsPerSheet = Math.floor(STRAP_SHEET_HEIGHT / size.width);
  const perStrip = Math.floor(STRAP_SHEET_WIDTH / size.length);
  const perSheet = stripsPerSheet * perStrip;
  if (perSheet <= 0) return { sheets: 0, perSheet };
  return { sheets: Math.ceil(qty / perSheet), perSheet };
}

function resolveStrapColor(article, crmItem, planName) {
  if (isWhiteStrapDonini(article, planName) || isWhiteStrapDonini(article, crmItem)) {
    return "Белый";
  }
  return strapConsumeColorForOrder({ item: crmItem || planName });
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Укажите файл плана: calc-plan-materials.mjs <план.xlsx> [результат.xlsx]");
    process.exit(1);
  }
  if (!existsSync(inputPath)) {
    console.error("Файл не найден:", inputPath);
    process.exit(1);
  }
  const base = basename(inputPath, extname(inputPath));
  const outputPath =
    process.argv[3] || join(dirname(inputPath), `${base} — материалы.xlsx`);

  console.log("Читаю план:", inputPath);
  const wbIn = new ExcelJS.Workbook();
  await wbIn.xlsx.readFile(inputPath);
  const sheet = wbIn.getWorksheet("Лист2") || wbIn.worksheets[0];
  if (!sheet) throw new Error("В файле нет листов");

  const layout = findPlanLayout(sheet);
  if (layout.headerRow <= 3) {
    // старый формат: шапка в первых строках, данные с 4-й
  }
  console.log(
    `Лист «${sheet.name}»: шапка в строке ${layout.headerRow}, ` +
      `артикул — колонка ${layout.articleCol}, название — ${layout.nameCol}, количество — ${layout.qtyCol}`,
  );

  const plan = [];
  const rowMeta = [];
  for (let rowNumber = layout.headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const article = cellText(row.getCell(layout.articleCol).value);
    const name = cellText(row.getCell(layout.nameCol).value);
    const qty = cellNumber(row.getCell(layout.qtyCol).value);
    if (!article || !(qty > 0)) continue;
    plan.push({ article, name, qty, category: "" });
    rowMeta.push({ rowNumber, planIndex: plan.length - 1 });
  }
  if (!plan.length) throw new Error("В плане не найдено строк с артикулом и количеством");
  console.log(`Позиций с количеством: ${plan.length}`);

  console.log("Тяну шаблоны/артикулы из CRM…");
  const data = await fetchAugustPlanCalcData();
  const report = calculateAugustPlanMaterials(plan, data);

  const deps = {
    furnitureTemplates: data.templates,
    furnitureCustomTemplates: data.templates,
    furnitureDetailArticleRows: data.details,
    normalizeFurnitureKey,
  };

  // Обвязка с учётом белого Donini + листы ЛДСП на обвязку
  const strapByColorCode = new Map();
  let strapPiecesWhite = 0;
  let strapPiecesBlack = 0;
  report.positions.forEach((pos) => {
    const order = { item: pos.crmItem || pos.planName, qty: pos.qty };
    const color = resolveStrapColor(pos.article, pos.crmItem, pos.planName);
    const needs = getResolvedWorkshopStrapNeeds(order, deps);
    needs.forEach((n) => {
      const code = String(n.code || "").trim();
      const needed = Math.round(Number(n.needed || 0));
      if (!code || !(needed > 0)) return;
      if (color === "Белый") strapPiecesWhite += needed;
      else strapPiecesBlack += needed;
      const key = `${color}|${code}`;
      const prev = strapByColorCode.get(key) || {
        color,
        code,
        label: strapDisplayNameForCode(code),
        pieces: 0,
      };
      prev.pieces += needed;
      strapByColorCode.set(key, prev);
    });
  });

  const strapSheetLines = [...strapByColorCode.values()]
    .map((entry) => {
      const { sheets, perSheet } = sheetsForStrapQty(entry.label, entry.pieces);
      return { ...entry, perSheet, sheets };
    })
    .sort(
      (a, b) =>
        a.color.localeCompare(b.color, "ru") ||
        b.pieces - a.pieces ||
        a.label.localeCompare(b.label, "ru"),
    );

  const strapSheetsByColor = { Белый: 0, Черный: 0 };
  strapSheetLines.forEach((line) => {
    strapSheetsByColor[line.color] = (strapSheetsByColor[line.color] || 0) + line.sheets;
  });

  // Колонки результата — после последней занятой колонки листа,
  // чтобы не затирать собственные колонки плана (в т.ч. объединённые «План по цехам»).
  let lastUsedCol = 0;
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    row.eachCell({ includeEmpty: false }, (_cell, colNumber) => {
      if (colNumber > lastUsedCol) lastUsedCol = colNumber;
    });
  }
  const sheetsCol = lastUsedCol + 1;
  const decorCol = sheetsCol + 1;
  const detailCol = sheetsCol + 2;
  const strapCol = sheetsCol + 3;
  const statusCol = sheetsCol + 4;

  const redFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF6B6B" } };
  const okFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };

  sheet.getCell(layout.headerRow, sheetsCol).value = "Листов ЛДСП";
  sheet.getCell(layout.headerRow, decorCol).value = "Декор";
  sheet.getCell(layout.headerRow, detailCol).value = "ЛДСП детали";
  sheet.getCell(layout.headerRow, strapCol).value = "Обвязка";
  sheet.getCell(layout.headerRow, statusCol).value = "Проверка";
  [sheetsCol, decorCol, detailCol, strapCol, statusCol].forEach((c) => {
    sheet.getCell(layout.headerRow, c).font = { bold: true };
  });

  let missingCount = 0;
  rowMeta.forEach(({ rowNumber, planIndex }) => {
    const pos = report.positions[planIndex];
    const cell = sheet.getCell(rowNumber, sheetsCol);
    if (!pos?.hasSheets) {
      cell.value = "нет нормы";
      cell.fill = redFill;
      cell.font = { bold: true, color: { argb: "FF7F1D1D" } };
      sheet.getCell(rowNumber, statusCol).value = "проверить артикул";
      missingCount += 1;
    } else {
      cell.value = pos.sheetsTotal;
      cell.fill = okFill;
      cell.font = { bold: true };
      sheet.getCell(rowNumber, statusCol).value = "ок";
    }
    sheet.getCell(rowNumber, decorCol).value = pos?.material || "";
    sheet.getCell(rowNumber, detailCol).value = pos?.materialText || "";
    const strapColor = resolveStrapColor(pos?.article, pos?.crmItem, pos?.planName);
    sheet.getCell(rowNumber, strapCol).value = pos?.strapText
      ? `${strapColor}: ${pos.strapText}`
      : "—";
  });

  sheet.getColumn(layout.articleCol).width = 26;
  if (layout.nameCol !== layout.articleCol) sheet.getColumn(layout.nameCol).width = 62;
  sheet.getColumn(layout.qtyCol).width = 12;
  sheet.getColumn(sheetsCol).width = 14;
  sheet.getColumn(decorCol).width = 26;
  sheet.getColumn(detailCol).width = 38;
  sheet.getColumn(strapCol).width = 38;
  sheet.getColumn(statusCol).width = 18;

  // Лист «Итого»
  let totals = wbIn.getWorksheet("Итого");
  if (totals) wbIn.removeWorksheet(totals.id);
  totals = wbIn.addWorksheet("Итого");

  totals.getCell(1, 1).value = `Расчёт материалов — ${base}`;
  totals.getCell(1, 1).font = { bold: true, size: 14 };
  totals.getCell(2, 1).value = `Дата расчёта: ${new Date().toLocaleString("ru-RU")}`;
  totals.getCell(3, 1).value = `Позиций: ${report.totals.planRows}`;
  totals.getCell(4, 1).value = `Изделий: ${report.totals.totalQty}`;
  totals.getCell(5, 1).value = `Листов ЛДСП (декор): ${report.totals.totalSheets}`;
  totals.getCell(6, 1).value = `Без нормы (красные): ${missingCount}`;

  let r = 8;
  totals.getCell(r, 1).value = "ЛДСП по материалам (декор столешниц/корпусов)";
  totals.getCell(r, 1).font = { bold: true, size: 12 };
  r += 1;
  totals.getCell(r, 1).value = "Материал";
  totals.getCell(r, 2).value = "Формат листа";
  totals.getCell(r, 3).value = "Листов";
  ["A", "B", "C"].forEach((col) => {
    totals.getCell(`${col}${r}`).font = { bold: true };
  });
  r += 1;
  report.materials.forEach((m) => {
    totals.getCell(r, 1).value = m.material;
    totals.getCell(r, 2).value = m.sheetSize;
    totals.getCell(r, 3).value = m.sheets;
    r += 1;
  });
  totals.getCell(r, 1).value = "ИТОГО декор";
  totals.getCell(r, 1).font = { bold: true };
  totals.getCell(r, 3).value = report.totals.totalSheets;
  totals.getCell(r, 3).font = { bold: true };
  r += 2;

  totals.getCell(r, 1).value = "Обвязка — планки и листы ЛДСП 2800×2070";
  totals.getCell(r, 1).font = { bold: true, size: 12 };
  r += 1;
  totals.getCell(r, 1).value =
    "Обычный Donini 750/806 (GXkitchtableDo*) учтён с БЕЛОЙ обвязкой; Grande и Donini R — по правилам CRM.";
  r += 1;
  totals.getCell(r, 1).value = "Цвет";
  totals.getCell(r, 2).value = "Код";
  totals.getCell(r, 3).value = "Тип";
  totals.getCell(r, 4).value = "Планок, шт";
  totals.getCell(r, 5).value = "Шт/лист";
  totals.getCell(r, 6).value = "Листов";
  for (let c = 1; c <= 6; c += 1) totals.getCell(r, c).font = { bold: true };
  r += 1;
  strapSheetLines.forEach((line) => {
    totals.getCell(r, 1).value = line.color;
    totals.getCell(r, 2).value = line.code;
    totals.getCell(r, 3).value = line.label;
    totals.getCell(r, 4).value = line.pieces;
    totals.getCell(r, 5).value = line.perSheet || "—";
    totals.getCell(r, 6).value = line.sheets;
    if (line.color === "Белый") {
      totals.getCell(r, 1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF1F5F9" },
      };
    }
    r += 1;
  });
  r += 1;
  totals.getCell(r, 1).value = "ИТОГО планок белых";
  totals.getCell(r, 4).value = strapPiecesWhite;
  r += 1;
  totals.getCell(r, 1).value = "ИТОГО планок чёрных";
  totals.getCell(r, 4).value = strapPiecesBlack;
  r += 1;
  totals.getCell(r, 1).value = "ИТОГО листов ЛДСП на белую обвязку";
  totals.getCell(r, 6).value = strapSheetsByColor["Белый"] || 0;
  totals.getCell(r, 1).font = { bold: true };
  totals.getCell(r, 6).font = { bold: true };
  r += 1;
  totals.getCell(r, 1).value = "ИТОГО листов ЛДСП на чёрную обвязку";
  totals.getCell(r, 6).value = strapSheetsByColor["Черный"] || 0;
  totals.getCell(r, 1).font = { bold: true };
  totals.getCell(r, 6).font = { bold: true };

  totals.getColumn(1).width = 48;
  totals.getColumn(2).width = 16;
  totals.getColumn(3).width = 28;
  totals.getColumn(4).width = 14;
  totals.getColumn(5).width = 12;
  totals.getColumn(6).width = 12;

  // Лист «Без нормы»
  if (report.missing.length) {
    let miss = wbIn.getWorksheet("Без нормы");
    if (miss) wbIn.removeWorksheet(miss.id);
    miss = wbIn.addWorksheet("Без нормы");
    miss.addRow(["Артикул", "Название", "Кол-во", "Изделие CRM", "Декор"]);
    report.missing.forEach((m) => {
      miss.addRow([m.article, m.name, m.qty, m.item, m.material]);
    });
    miss.getRow(1).font = { bold: true };
    miss.columns.forEach((col) => {
      col.width = 28;
    });
  }

  try {
    await wbIn.xlsx.writeFile(outputPath);
    console.log("Сохранено:", outputPath);
  } catch (error) {
    const alt = outputPath.replace(/\.xlsx$/i, `-${Date.now()}.xlsx`);
    await wbIn.xlsx.writeFile(alt);
    console.warn("Основной файл занят, сохранено в:", alt);
    console.log("Сохранено:", alt);
  }

  console.log("\n=== ЛДСП по материалам ===");
  report.materials.forEach((m) => console.log(`${m.material} [${m.sheetSize}]: ${m.sheets}`));
  console.log(`ИТОГО листов декора: ${report.totals.totalSheets}`);
  console.log(`Без нормы: ${missingCount}`);
  console.log("\n=== Обвязка → листы ===");
  strapSheetLines.forEach((l) =>
    console.log(`${l.color} | ${l.label}: ${l.pieces} шт → ${l.sheets} л`),
  );
  console.log(`Белая обвязка: ${strapPiecesWhite} планок / ${strapSheetsByColor["Белый"] || 0} листов`);
  console.log(`Чёрная обвязка: ${strapPiecesBlack} планок / ${strapSheetsByColor["Черный"] || 0} листов`);
}

main().catch((error) => {
  console.error("\nОШИБКА:", error?.message || error);
  process.exit(1);
});
