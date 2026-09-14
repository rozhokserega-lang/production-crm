/**
 * Выгрузка заказов вкладки «Финал» в xlsx (3 колонки: артикул, название, кол-во).
 * Данные: JSON-массив строк web_get_orders_all (или совместимый формат).
 *
 * node scripts/export-workshop-final-xlsx.mjs [path/to/rows.json] [out.xlsx]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

const STRAP_ITEM_RE = /^\d{3,5}[_x]\d{2,5}(?:[.,]\d+)?$/i;

function stripPlanItemMeta(itemName) {
  return String(itemName || "")
    .replace(/\{\{ART:[^}]+\}\}/gi, "")
    .replace(/\{\{QRQTY:[^}]+\}\}/gi, "")
    .replace(/^\s*[A-Za-z0-9][A-Za-z0-9._-]{2,}\s*::\s*/i, "")
    .replace(/(?:^|\s)QTY\s*=\s*[0-9]+(?:[.,][0-9]+)?\s*::/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isStrapPlankItem(item) {
  const s = stripPlanItemMeta(item);
  return s.includes("Планки обвязки") || STRAP_ITEM_RE.test(s);
}

function isFinalRow(row) {
  const stage = String(row.pipeline_stage || row.pipelineStage || "").trim();
  const overall = String(row.overall_status || row.overallStatus || "").toLowerCase();
  const assembly = String(row.assembly_status || row.assemblyStatus || "").toLowerCase();
  if (stage === "warehouse_kit" || overall.includes("комплектац") || overall.includes("упаков")) {
    return false;
  }
  if (stage !== "assembled" && stage !== "ready_to_ship") return false;
  if (stage === "ready_to_ship") return true;
  return /готов|собран/.test(assembly);
}

function resolveArticle(row) {
  const fromDb = String(
    row.product_article ||
      row.productArticle ||
      row.mapped_article_code ||
      row.mappedArticleCode ||
      row.article_code ||
      row.articleCode ||
      "",
  ).trim();
  if (fromDb) return fromDb;
  const fromItem = stripPlanItemMeta(row.item || "").match(/^\s*([A-Za-z0-9][A-Za-z0-9._-]{2,})\s*::/);
  return fromItem?.[1] ? String(fromItem[1]).trim() : "";
}

function toExportRows(rawRows) {
  return (Array.isArray(rawRows) ? rawRows : [])
    .filter(isFinalRow)
    .filter((row) => !isStrapPlankItem(row.item))
    .map((row) => ({
      Артикул: resolveArticle(row),
      Название: stripPlanItemMeta(row.item),
      Количество: Number(row.qty) || 0,
    }))
    .sort((a, b) => a.Название.localeCompare(b.Название, "ru"));
}

function buildWorkbook(exportRows) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportRows);
  ws["!cols"] = [
    { wch: 22 },
    { wch: 48 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Финал");
  return wb;
}

const inputPath = process.argv[2] || join(repoRoot, "docs", "final-export-source.json");
const outPath =
  process.argv[3] || join(repoRoot, "docs", `final-workshop-orders-${new Date().toISOString().slice(0, 10)}.xlsx`);

const raw = JSON.parse(readFileSync(inputPath, "utf8"));
const exportRows = toExportRows(raw);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, XLSX.write(buildWorkbook(exportRows), { type: "buffer", bookType: "xlsx" }));
console.log(`Exported ${exportRows.length} rows -> ${outPath}`);
