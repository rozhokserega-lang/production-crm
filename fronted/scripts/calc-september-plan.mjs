/**
 * Расчёт материалов на сентябрьский план:
 * - колонка C = кол-во изделий, D = листы ЛДСП
 * - Вотан = малый формат (уже в planSheetEstimation)
 * - нет нормы → красная ячейка D
 * - отдельный лист «Итого»
 * - обвязка; Donini со скрина → белая
 */
import ExcelJS from "exceljs";
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

// Локальная утилита, а НЕ тест: читает личный xlsx с рабочего стола и перезаписывает
// выходной файл. Запускать руками: node scripts/calc-september-plan.mjs [вход] [выход]
// Из vitest/`npm test` вызывать нельзя — иначе прогон тестов затирает рабочие файлы.
const INPUT_PATH =
  process.env.SEPTEMBER_PLAN_INPUT ||
  process.argv[2] ||
  "c:/Users/ПК/OneDrive/Desktop/план сентябрь2.xlsx";
const OUTPUT_PATH =
  process.env.SEPTEMBER_PLAN_OUTPUT ||
  process.argv[3] ||
  "c:/Users/ПК/OneDrive/Desktop/план сентябрь2 — материалы.xlsx";

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
  if (perSheet <= 0) return { sheets: 0, perSheet: 0 };
  return { sheets: Math.ceil(qty / perSheet), perSheet };
}

function resolveStrapColor(article, crmItem, planName) {
  if (isWhiteStrapDonini(article, planName) || isWhiteStrapDonini(article, crmItem)) {
    return "Белый";
  }
  return strapConsumeColorForOrder({ item: crmItem || planName });
}

async function main() {
  console.log("Читаю план…", INPUT_PATH);
  const wbIn = new ExcelJS.Workbook();
  await wbIn.xlsx.readFile(INPUT_PATH);
  const sheet = wbIn.getWorksheet("Лист2") || wbIn.worksheets[0];
  if (!sheet) throw new Error("Не найден Лист2");

  const plan = [];
  const rowMeta = []; // excel row number + plan index
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= 3) return; // заголовки
    const article = String(row.getCell(1).value || "").trim();
    const name = String(row.getCell(2).value || "").trim();
    const qtyRaw = row.getCell(3).value;
    const qty = Number(qtyRaw);
    if (!article || !(qty > 0)) return;
    plan.push({ article, name, qty, category: "" });
    rowMeta.push({ rowNumber, planIndex: plan.length - 1 });
  });

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

  // Обвязка с учётом белого Donini со скрина + листы ЛДСП на обвязку
  const strapByColorCode = new Map(); // key: color|code
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

  // Запись колонки D + красный если нет нормы
  const redFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFF6B6B" },
  };
  const okFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD1FAE5" },
  };

  sheet.getCell(1, 4).value = "Листов ЛДСП";
  sheet.getCell(1, 4).font = { bold: true };

  let missingCount = 0;
  rowMeta.forEach(({ rowNumber, planIndex }) => {
    const pos = report.positions[planIndex];
    const cell = sheet.getCell(rowNumber, 4);
    if (!pos?.hasSheets) {
      cell.value = "нет нормы";
      cell.fill = redFill;
      cell.font = { bold: true, color: { argb: "FF7F1D1D" } };
      missingCount += 1;
    } else {
      cell.value = pos.sheetsTotal;
      cell.fill = okFill;
      cell.font = { bold: true };
    }
    // доп. колонки для прозрачности
    sheet.getCell(rowNumber, 5).value = pos?.material || "";
    sheet.getCell(rowNumber, 6).value = pos?.materialText || "";
    const strapColor = resolveStrapColor(pos?.article, pos?.crmItem, pos?.planName);
    sheet.getCell(rowNumber, 7).value = pos?.strapText
      ? `${strapColor}: ${pos.strapText}`
      : "—";
  });

  sheet.getCell(1, 5).value = "Декор";
  sheet.getCell(1, 6).value = "ЛДСП детали";
  sheet.getCell(1, 7).value = "Обвязка";
  [5, 6, 7].forEach((c) => {
    sheet.getCell(1, c).font = { bold: true };
  });

  // Лист «Итого»
  let totals = wbIn.getWorksheet("Итого");
  if (totals) wbIn.removeWorksheet(totals.id);
  totals = wbIn.addWorksheet("Итого");

  totals.getCell(1, 1).value = "Расчёт материалов — план сентябрь2";
  totals.getCell(1, 1).font = { bold: true, size: 14 };
  totals.getCell(2, 1).value = `Дата: ${new Date().toLocaleString("ru-RU")}`;
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

  // Лист без нормы
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

  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 72;
  sheet.getColumn(3).width = 10;
  sheet.getColumn(4).width = 14;
  sheet.getColumn(5).width = 28;
  sheet.getColumn(6).width = 40;
  sheet.getColumn(7).width = 40;

  try {
    await wbIn.xlsx.writeFile(OUTPUT_PATH);
    console.log("Сохранено:", OUTPUT_PATH);
  } catch (error) {
    const alt = OUTPUT_PATH.replace(/\.xlsx$/i, `-${Date.now()}.xlsx`);
    await wbIn.xlsx.writeFile(alt);
    console.warn("Основной файл занят, сохранено в:", alt);
  }

  console.log("\n=== ЛДСП по материалам ===");
  report.materials.forEach((m) => console.log(`${m.material} [${m.sheetSize}]: ${m.sheets}`));
  console.log(`ИТОГО листов декора: ${report.totals.totalSheets}`);
  console.log(`Без нормы: ${missingCount}`);
  console.log("\n=== Обвязка → листы ===");
  strapSheetLines.forEach((l) =>
    console.log(`${l.color} | ${l.label}: ${l.pieces} шт → ${l.sheets} л`),
  );
  console.log(
    `Белая обвязка: ${strapPiecesWhite} планок / ${strapSheetsByColor["Белый"] || 0} листов`,
  );
  console.log(
    `Чёрная обвязка: ${strapPiecesBlack} планок / ${strapSheetsByColor["Черный"] || 0} листов`,
  );
}

export default main;

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
