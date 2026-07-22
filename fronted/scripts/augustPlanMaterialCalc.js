import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { ceilWholeSheets } from "../src/app/appUtils.js";
import { resolveSheetNeedsByMaterials } from "../src/app/furnitureMaterialYield.js";
import { getMaterialSheetDimensions, resolvePlanItemSheets } from "../src/app/planSheetEstimation.js";
import {
  getResolvedWorkshopStrapNeeds,
  strapDisplayNameForCode,
} from "../src/app/workshopStrapNeeds.js";
import { normalizeFurnitureKey } from "../src/utils/furnitureUtils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PLAN_PATH = join(__dirname, "data/august-2026-plan.json");

export function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, "../.env.local"), "utf8");
    return Object.fromEntries(
      raw
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const idx = line.indexOf("=");
          return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
        }),
    );
  } catch (_) {
    return {};
  }
}

export function loadAugustPlan(planPath = DEFAULT_PLAN_PATH) {
  return JSON.parse(readFileSync(planPath, "utf8"));
}

function normArticle(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeLookupText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim();
}

function withPlanArticle(hit, planArticle) {
  if (!hit || !planArticle) return hit;
  return { ...hit, article: planArticle };
}

function adjustDonini750Sibling(hit, planName, planArticle) {
  if (!hit) return hit;
  const plan = normalizeLookupText(planName);
  const item = String(hit.item_name || "");
  const adjusted = !plan.includes("750") || !/806\s*мм/i.test(item)
    ? hit
    : {
        ...hit,
        item_name: item.replace(/806\s*мм/i, "750 мм"),
        section_name: String(hit.section_name || "").replace(/806/i, "750") || hit.section_name,
      };
  return withPlanArticle(adjusted, planArticle);
}

function avellaLiteItemFromPlanName(planName) {
  const raw = String(planName || "").trim();
  const idx = raw.toLowerCase().indexOf("avella lite");
  if (idx < 0) return "";
  return raw.slice(idx).replace(/\.$/, "").trim();
}

function deriveAvellaLiteHit(baseHit, planArticle, planName) {
  if (!baseHit) return null;
  const liteItem = avellaLiteItemFromPlanName(planName);
  return {
    ...baseHit,
    article: planArticle,
    item_name: liteItem || baseHit.item_name,
  };
}

export function findArticle(articles, article, name) {
  const list = Array.isArray(articles) ? articles : [];
  const code = String(article || "").trim();
  const lower = normArticle(code);
  if (!lower) return null;

  const exact = list.find((row) => normArticle(row.article) === lower);
  if (exact) return exact;

  if (lower.endsWith("001l")) {
    const baseCode = code.slice(0, -1);
    const baseHit = list.find((row) => normArticle(row.article) === normArticle(baseCode));
    const liteHit = deriveAvellaLiteHit(baseHit, code, name);
    if (liteHit) return liteHit;
  }

  if (lower.endsWith("s") && !lower.endsWith("ss")) {
    const sibling = list.find((row) => normArticle(row.article) === lower.slice(0, -1));
    if (sibling) return adjustDonini750Sibling(sibling, name, code);
  }

  const planNorm = normalizeLookupText(name);
  if (planNorm.includes("avella lite")) {
    const liteItem = avellaLiteItemFromPlanName(name);
    const byLiteName = list.find((row) => normalizeLookupText(row.item_name) === normalizeLookupText(liteItem));
    if (byLiteName) return { ...byLiteName, article: code };
  }

  return list.find((row) => {
    const item = normalizeLookupText(row.item_name);
    return item && planNorm && (item === planNorm || planNorm.includes(item) || item.includes(planNorm));
  }) || null;
}

export function inferMaterial(name, tableColor) {
  if (tableColor) return tableColor;
  const parts = String(name || "").split(".").map((x) => x.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "Материал не указан";
}

export function formatSheetSize(materialName) {
  const dims = getMaterialSheetDimensions(materialName);
  if (!dims) return "—";
  return `${dims.width}×${dims.height}`;
}

export async function fetchAugustPlanCalcData() {
  const env = loadEnvLocal();
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Нет VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY в fronted/.env.local");
  }

  const supabase = createClient(url, key);
  const [{ data: templates, error: tplErr }, { data: articles, error: artErr }, { data: details, error: detErr }] =
    await Promise.all([
      supabase.from("furniture_custom_templates").select("product_name,kits_per_sheet,material_yields,details"),
      supabase.from("item_article_map").select("article,item_name,section_name,table_color"),
      supabase.from("furniture_detail_item_map").select("product_name,detail_name_pattern,is_active"),
    ]);

  if (tplErr) throw tplErr;
  if (artErr) throw artErr;
  if (detErr) throw detErr;

  return {
    templates: templates || [],
    articles: articles || [],
    details: (details || []).filter((row) => row.is_active !== false),
  };
}

export function calculateAugustPlanMaterials(plan, { templates, articles, details }) {
  const deps = {
    furnitureTemplates: templates,
    furnitureCustomTemplates: templates,
    furnitureDetailArticleRows: details,
    normalizeFurnitureKey,
  };

  const positions = [];
  const materialLines = [];
  const strapLines = [];
  const byMaterial = new Map();
  const byStrap = new Map();
  const missing = [];

  let totalQty = 0;
  let totalSheets = 0;
  let totalStraps = 0;

  plan.forEach((row, index) => {
    const qty = Number(row.qty || 0);
    if (!(qty > 0)) return;
    totalQty += qty;

    const hit = findArticle(articles, row.article, row.name);
    const item = String(hit?.item_name || row.name || "").trim();
    const section = String(hit?.section_name || row.category || "").trim();
    const material = inferMaterial(item || row.name, hit?.table_color);

    let sheetsRows = resolveSheetNeedsByMaterials(templates, item, qty, material, normalizeFurnitureKey);
    let outputPerSheet = 0;
    if (!sheetsRows.length) {
      const primary = resolvePlanItemSheets({
        itemName: item,
        sectionName: section,
        materialName: material,
        qty,
        articleCode: row.article,
        templates,
        normalizeKey: normalizeFurnitureKey,
      });
      outputPerSheet = Number(primary.outputPerSheet || 0);
      if (primary.sheets > 0) {
        sheetsRows = [{ material, sheets: primary.sheets, outputPerSheet }];
      }
    } else {
      outputPerSheet = qty > 0 && sheetsRows.length === 1
        ? Number(sheetsRows[0].sheets || 0) / qty
        : 0;
    }

    const sheetsSum = sheetsRows.reduce((sum, line) => sum + Number(line.sheets || 0), 0);
    const straps = getResolvedWorkshopStrapNeeds({ item, qty }, deps);
    const strapSum = straps.reduce((sum, s) => sum + Number(s.needed || 0), 0);
    totalStraps += strapSum;

    const materialText = sheetsRows
      .map((line) => `${line.material}: ${ceilWholeSheets(line.sheets)} л`)
      .join("; ");
    const strapText = straps
      .map((s) => `${strapDisplayNameForCode(s.code)}: ${Math.round(s.needed)}`)
      .join("; ");

    if (sheetsSum <= 0) {
      missing.push({ article: row.article, name: row.name, qty, item, material });
    } else {
      totalSheets += sheetsSum;
      sheetsRows.forEach((line) => {
        const key = String(line.material || material).trim();
        byMaterial.set(key, (byMaterial.get(key) || 0) + Number(line.sheets || 0));
        materialLines.push({
          positionNo: index + 1,
          article: row.article,
          name: row.name,
          item,
          qty,
          material: key,
          sheets: ceilWholeSheets(line.sheets),
          sheetSize: formatSheetSize(key),
        });
      });
    }

    straps.forEach((strap) => {
      const code = String(strap.code || "").trim();
      if (!code) return;
      const needed = Math.round(Number(strap.needed || 0));
      byStrap.set(code, (byStrap.get(code) || 0) + needed);
      strapLines.push({
        positionNo: index + 1,
        article: row.article,
        name: row.name,
        item,
        qty,
        strapCode: code,
        strapLabel: strapDisplayNameForCode(code),
        needed,
      });
    });

    positions.push({
      no: index + 1,
      category: row.category || "",
      article: row.article || "",
      planName: row.name || "",
      qty,
      crmItem: item,
      section,
      material,
      sheetsTotal: sheetsSum > 0 ? ceilWholeSheets(sheetsSum) : 0,
      outputPerSheet: outputPerSheet > 0 ? Math.round(outputPerSheet * 100) / 100 : "",
      materialText: materialText || "—",
      strapTotal: strapSum,
      strapText: strapText || "—",
      hasSheets: sheetsSum > 0,
    });
  });

  const materials = [...byMaterial.entries()]
    .map(([material, sheets]) => ({
      material,
      sheets: ceilWholeSheets(sheets),
      sheetSize: formatSheetSize(material),
    }))
    .sort((a, b) => b.sheets - a.sheets || a.material.localeCompare(b.material, "ru"));

  const straps = [...byStrap.entries()]
    .map(([code, needed]) => ({
      code,
      label: strapDisplayNameForCode(code),
      needed: Math.round(needed),
    }))
    .sort((a, b) => b.needed - a.needed || a.label.localeCompare(b.label, "ru"));

  return {
    positions,
    materialLines,
    strapLines,
    materials,
    straps,
    missing,
    totals: {
      planRows: plan.length,
      totalQty,
      totalSheets: ceilWholeSheets(totalSheets),
      totalStraps: Math.round(totalStraps),
      missingCount: missing.length,
    },
  };
}

export async function buildAugustPlanMaterialReport(planPath = DEFAULT_PLAN_PATH) {
  const plan = loadAugustPlan(planPath);
  const data = await fetchAugustPlanCalcData();
  return calculateAugustPlanMaterials(plan, data);
}
