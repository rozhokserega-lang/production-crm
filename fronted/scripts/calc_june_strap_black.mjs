/**
 * Расчёт чёрной обвязки по июньскому плану — та же логика, что в CRM (workshopStrapNeeds).
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { parseStrapSize } from "../src/app/appUtils.js";
import {
  getResolvedWorkshopStrapNeeds,
  strapConsumeColorForOrder,
  strapDisplayNameForCode,
} from "../src/app/workshopStrapNeeds.js";
import { normalizeFurnitureKey } from "../src/utils/furnitureUtils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const PLAN_CSV = resolve(ROOT, "_june_plan_utf8.csv");
const TEMPLATES_JSON = resolve(ROOT, "scripts/data/furniture_templates_full.json");
const OUT_JSON = resolve(ROOT, "_june_strap_black.json");

const STRAP_SHEET_WIDTH = 2800;
const STRAP_SHEET_HEIGHT = 2070;

const DETAIL_CATALOG = [
  { product_name: "Донини", detail_name_pattern: "%обвязка%1000_80%", is_active: true },
  { product_name: "Донини", detail_name_pattern: "%обвязка%558_80%", is_active: true },
  { product_name: "Донини R", detail_name_pattern: "%обвязка%502_80%", is_active: true },
  { product_name: "Донини R", detail_name_pattern: "%обвязка%544_80%", is_active: true },
  { product_name: "Донини R", detail_name_pattern: "%обвязка%288_80%", is_active: true },
  { product_name: "Донини R", detail_name_pattern: "%обвязка%520_80%", is_active: true },
  { product_name: "Донини Гранде", detail_name_pattern: "%обвязка%750_80%", is_active: true },
  { product_name: "Донини Гранде", detail_name_pattern: "%обвязка%618_80%", is_active: true },
  { product_name: "Донини Гранде", detail_name_pattern: "%обвязка%600_80%", is_active: true },
  { product_name: "Донини Гранде", detail_name_pattern: "%обвязка%586_80%", is_active: true },
  { product_name: "Авелла Лайт", detail_name_pattern: "%обвязка%1158_56%", is_active: true },
  { product_name: "Авелла Лайт", detail_name_pattern: "%обвязка%600_56%", is_active: true },
  { product_name: "Авелла", detail_name_pattern: "%обвязка%1158_56%", is_active: true },
  { product_name: "Авелла", detail_name_pattern: "%обвязка%600_56%", is_active: true },
  { product_name: "ТВ Лофт", detail_name_pattern: "%обвязка%316_167%", is_active: true },
  { product_name: "ТВ Лофт 1500", detail_name_pattern: "%бока%316_167%", is_active: true },
];

function loadPlan() {
  const text = readFileSync(PLAN_CSV, "utf-8").replace(/^\uFEFF/, "");
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const idxCode = header.findIndex((h) => /код|code/i.test(h)) >= 0 ? header.findIndex((h) => /код|code/i.test(h)) : 0;
  const idxName = header.findIndex((h) => /наимен|name/i.test(h)) >= 0 ? header.findIndex((h) => /наимен|name/i.test(h)) : 1;
  const idxQty = header.findIndex((h) => /кол|qty|шт/i.test(h)) >= 0 ? header.findIndex((h) => /кол|qty|шт/i.test(h)) : 2;
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (!parts[0]?.trim()) continue;
    const code = parts[idxCode]?.trim() || parts[0].trim();
    let name = parts[idxName]?.trim() || parts[1]?.trim();
    if (name?.startsWith('"')) {
      const m = lines[i].match(/^[^,]+,(.+),([^,]+)$/);
      if (m) name = m[1].replace(/^"|"$/g, "").trim();
    }
    const qty = Number(parts[idxQty] ?? parts[2]) || 0;
    if (qty > 0) rows.push({ code, name, qty });
  }
  return rows;
}

function loadTemplates() {
  try {
    const raw = JSON.parse(readFileSync(TEMPLATES_JSON, "utf-8"));
    return raw.map((t) => ({
      productName: t.product_name,
      product_name: t.product_name,
      details: (t.details || []).map((d) => ({
        detailName: d.detailName || d.detail_name,
        detail_name: d.detailName || d.detail_name,
        perUnit: Number(d.perUnit ?? d.per_unit ?? 0),
        per_unit: Number(d.perUnit ?? d.per_unit ?? 0),
      })),
    }));
  } catch {
    const partial = JSON.parse(readFileSync(resolve(ROOT, "scripts/data/furniture_templates.json"), "utf-8"));
    return partial.map((t) => ({
      productName: t.product_name,
      product_name: t.product_name,
      details: (t.details || []).map((d) => ({
        detailName: d.detailName || d.detail_name,
        perUnit: Number(d.perUnit ?? d.per_unit ?? 0),
      })),
    }));
  }
}

function sheetsForStrapQty(name, qty) {
  const size = parseStrapSize(name);
  if (!size || !(qty > 0)) return { sheets: 0, perSheet: 0 };
  const stripsPerSheet = Math.floor(STRAP_SHEET_HEIGHT / size.width);
  const perStrip = Math.floor(STRAP_SHEET_WIDTH / size.length);
  const perSheet = stripsPerSheet * perStrip;
  if (perSheet <= 0) return { sheets: 0, perSheet: 0, invalid: true };
  return { sheets: Math.ceil(qty / perSheet), perSheet };
}

function parseCsvLine(line) {
  const m = line.match(/^([^,]+),("(?:[^"]|"")*"|[^,]*),(.+)$/);
  if (m) {
    return {
      code: m[1].trim(),
      name: m[2].replace(/^"|"$/g, "").replace(/""/g, '"').trim(),
      qty: Number(m[3]) || 0,
    };
  }
  const parts = line.split(",");
  return { code: parts[0]?.trim(), name: parts[1]?.trim(), qty: Number(parts[2]) || 0 };
}

function loadPlanRobust() {
  const text = readFileSync(PLAN_CSV, "utf-8").replace(/^\uFEFF/, "");
  const lines = text.trim().split(/\r?\n/).slice(1);
  return lines.map(parseCsvLine).filter((r) => r.code && r.qty > 0);
}

const deps = {
  furnitureTemplates: [],
  furnitureCustomTemplates: loadTemplates(),
  furnitureDetailArticleRows: DETAIL_CATALOG,
  normalizeFurnitureKey,
};

const plan = loadPlanRobust();
const byCode = new Map();
const orderRows = [];
let totalPieces = 0;
let totalSheets = 0;

for (const row of plan) {
  const order = { item: row.name, qty: row.qty };
  const color = strapConsumeColorForOrder(order);
  const needs = getResolvedWorkshopStrapNeeds(order, deps);
  const blackNeeds = color === "Черный" ? needs : [];
  const lineStraps = [];

  for (const n of blackNeeds) {
    const code = n.code;
    const needed = Number(n.needed || 0);
    if (!(needed > 0)) continue;
    totalPieces += needed;
    const prev = byCode.get(code) || { code, name: n.name || strapDisplayNameForCode(code), pieces: 0, sheets: 0 };
    prev.pieces += needed;
    byCode.set(code, prev);
    const { sheets, perSheet } = sheetsForStrapQty(prev.name, needed);
    lineStraps.push({ name: prev.name, pieces: needed, sheets, perSheet });
  }

  if (blackNeeds.length) {
    orderRows.push({
      code: row.code,
      name: row.name,
      qty: row.qty,
      straps: lineStraps,
    });
  }
}

for (const entry of byCode.values()) {
  const { sheets, perSheet } = sheetsForStrapQty(entry.name, entry.pieces);
  entry.sheets = sheets;
  entry.perSheet = perSheet;
  totalSheets += sheets;
}

const summary = {
  planLines: plan.length,
  linesWithBlackStrap: orderRows.length,
  totalPieces,
  totalSheets,
  byType: [...byCode.values()].sort((a, b) => b.pieces - a.pieces),
  orders: orderRows,
};

writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), "utf-8");
console.log(JSON.stringify({ totalPieces, totalSheets, byType: summary.byType }, null, 2));
