import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { buildAugustPlanMaterialReport } from "./augustPlanMaterialCalc.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const outDir = join(repoRoot, "docs");
const outPath = join(outDir, "august-2026-plan-materials.xlsx");

function sheetFromRows(rows, sheetName) {
  const ws = XLSX.utils.json_to_sheet(rows);
  return { ws, name: sheetName };
}

function autoWidth(ws, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  ws["!cols"] = headers.map((key) => {
    const maxLen = Math.max(
      key.length,
      ...rows.map((row) => String(row[key] ?? "").length),
    );
    return { wch: Math.min(60, Math.max(10, maxLen + 2)) };
  });
}

function buildWorkbook(report) {
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    { Показатель: "План", Значение: "Август 2026 (plan_by_prod2)" },
    { Показатель: "Дата расчёта", Значение: new Date().toLocaleString("ru-RU") },
    { Показатель: "Позиций в плане", Значение: report.totals.planRows },
    { Показатель: "Изделий (шт)", Значение: report.totals.totalQty },
    { Показатель: "ЛДСП (листов)", Значение: report.totals.totalSheets },
    { Показатель: "Обвязка (шт)", Значение: report.totals.totalStraps },
    { Показатель: "Без расчёта листов", Значение: report.totals.missingCount },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 28 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Сводка");

  const positionRows = report.positions.map((row) => ({
    "№": row.no,
    "Категория": row.category,
    "Артикул": row.article,
    "Название (план)": row.planName,
    "Кол-во": row.qty,
    "Изделие (CRM)": row.crmItem,
    "Секция": row.section,
    "Декор": row.material,
    "Листов": row.sheetsTotal || "—",
    "Выход/лист": row.outputPerSheet || "—",
    "ЛДСП (детали)": row.materialText,
    "Планок (шт)": row.strapTotal || 0,
    "Обвязка (детали)": row.strapText,
  }));
  const wsPositions = XLSX.utils.json_to_sheet(positionRows);
  autoWidth(wsPositions, positionRows);
  XLSX.utils.book_append_sheet(wb, wsPositions, "Позиции");

  const materialDetailRows = report.materialLines.map((row) => ({
    "№ поз.": row.positionNo,
    "Артикул": row.article,
    "Название": row.name,
    "Кол-во": row.qty,
    "Декор": row.material,
    "Формат листа": row.sheetSize,
    "Листов": row.sheets,
  }));
  const wsMaterialDetail = XLSX.utils.json_to_sheet(materialDetailRows);
  autoWidth(wsMaterialDetail, materialDetailRows);
  XLSX.utils.book_append_sheet(wb, wsMaterialDetail, "ЛДСП детализация");

  const materialRows = report.materials.map((row, index) => ({
    "№": index + 1,
    "Декор": row.material,
    "Формат листа": row.sheetSize,
    "Листов": row.sheets,
  }));
  const wsMaterials = XLSX.utils.json_to_sheet(materialRows);
  autoWidth(wsMaterials, materialRows);
  XLSX.utils.book_append_sheet(wb, wsMaterials, "ЛДСП итого");

  const strapDetailRows = report.strapLines.map((row) => ({
    "№ поз.": row.positionNo,
    "Артикул": row.article,
    "Название": row.name,
    "Кол-во": row.qty,
    "Код": row.strapCode,
    "Тип обвязки": row.strapLabel,
    "Планок": row.needed,
  }));
  const wsStrapDetail = XLSX.utils.json_to_sheet(strapDetailRows);
  autoWidth(wsStrapDetail, strapDetailRows);
  XLSX.utils.book_append_sheet(wb, wsStrapDetail, "Обвязка детализация");

  const strapRows = report.straps.map((row, index) => ({
    "№": index + 1,
    "Код": row.code,
    "Тип обвязки": row.label,
    "Планок (шт)": row.needed,
  }));
  const wsStraps = XLSX.utils.json_to_sheet(strapRows);
  autoWidth(wsStraps, strapRows);
  XLSX.utils.book_append_sheet(wb, wsStraps, "Обвязка итого");

  if (report.missing.length) {
    const missingRows = report.missing.map((row, index) => ({
      "№": index + 1,
      "Артикул": row.article,
      "Название": row.name,
      "Кол-во": row.qty,
      "Изделие CRM": row.item,
      "Декор": row.material,
    }));
    const wsMissing = XLSX.utils.json_to_sheet(missingRows);
    autoWidth(wsMissing, missingRows);
    XLSX.utils.book_append_sheet(wb, wsMissing, "Без расчёта");
  }

  return wb;
}

async function exportAugustPlanXlsx() {
  console.log("Считаю материалы по плану август…");
  const report = await buildAugustPlanMaterialReport();
  mkdirSync(outDir, { recursive: true });
  const wb = buildWorkbook(report);
  let savedPath = outPath;
  try {
    XLSX.writeFile(wb, outPath);
  } catch (error) {
    if (error?.code !== "EBUSY") throw error;
    savedPath = join(outDir, "august-2026-plan-materials-new.xlsx");
    XLSX.writeFile(wb, savedPath);
    console.warn(`Основной файл занят, сохранено в: ${savedPath}`);
  }
  console.log(`Готово: ${savedPath}`);
  console.log(`Позиций: ${report.totals.planRows}, листов: ${report.totals.totalSheets}, планок: ${report.totals.totalStraps}`);
  return { outPath: savedPath, report };
}

export { exportAugustPlanXlsx, outPath };

async function main() {
  await exportAugustPlanXlsx();
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
