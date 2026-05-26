import { ceilWholeSheets, sheetsFromTemplateKits } from "./appUtils";
import {
  findFurnitureTemplate,
  normalizeMaterialKey,
  resolveKitsPerSheetFromTemplate,
  resolveOutputPerSheetFromTemplate,
} from "./furnitureMaterialYield";
import { buildCatalogMap, DEFAULT_GX_SHELF_CATALOG, normalizeCatalogCode } from "./shelfCatalogHelpers";

const SHEET_W = 2800;
const SHEET_H = 2070;
const CUT_GAP = 3;

const MATERIAL_SHEET_SIZE = {
  "белый": "2800x2070",
  "бетон": "2750x1830",
  "бетон чикаго": "2800x2070",
  "бетон чикаго 25": "2800x2070",
  "выбеленное дерево": "2750x1830",
  "герион": "2750x1830",
  "дуб вотан": "2800x2070",
  "дуб вотан 25": "2800x2070",
  "дуб галифакс олово": "2800x2070",
  "дуб делано": "2750x1830",
  "дуб кальяри": "2750x1830",
  "дуб коми": "2750x1830",
  "дуб марсала": "2800x2070",
  "дуб хантон": "2800x2070",
  "дуб хантон 25": "2800x2070",
  "интра": "2750x1830",
  "камень пьетра гриджиа": "2800x2070",
  "кейптаун": "2750x1830",
  "маренго": "2750x1830",
  "мрамор кристал": "2800x2070",
  "мрамор кристалл": "2800x2070",
  "муза": "2750x1830",
  "сланец скиваро": "2800x2070",
  "слоновая кость": "2750x1830",
  "слэйт": "2750x1830",
  "солнечный": "2750x1830",
  "сонома / бардолино": "2800x2070",
  "темное небо": "2750x1830",
  "ночное небо": "2800x2070",
  "трансильвания": "2750x1830",
  "черный": "2800x2070",
  "юта": "2750x1830",
  "ясень анкор": "2750x1830",
  "ясень тронхейм": "2800x2070",
  "бардолино": "2800x2070",
  "дуб бардолино натуральный": "2800x2070",
  "дуб сонома": "2800x2070",
  "лмдф дуб сторсунд": "2800x2070",
};

export function normalizePlanKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim();
}

export function resolveFurnitureTemplateKey(itemName, sectionName = "") {
  const item = normalizePlanKey(itemName);
  const section = normalizePlanKey(sectionName);
  if (item.includes("siena 2") && item.includes("150")) {
    return "Тумба под ТВ Siena 2 150. Интра - Серый";
  }
  if (item.includes("siena 3")) return "Siena";
  if (item.includes("siena 1") || (item.includes("siena") && !item.includes("siena 2"))) return "Siena";
  if (item.includes("лофт") && (item.includes("150") || section.includes("1500"))) return "ТВ тумба 1500";
  if (item.includes("лофт") || section.includes("тв лофт")) return "ТВ тумба";
  if (item.includes("flamingo") && item.includes("кругл")) return "Flamingo круглый";
  if (item.includes("flamingo") && item.includes("прямоуголь")) return "Flamingo прямоугольный";
  if (item.includes("flamingo")) return "Flamingo круглый";
  return "";
}

export function findPlanFurnitureTemplate(templates, itemName, sectionName = "", normalizeKey) {
  const list = Array.isArray(templates) ? templates : [];
  if (!list.length) return null;
  const normalize =
    typeof normalizeKey === "function" ? normalizeKey : (v) => normalizePlanKey(v);
  const byName = new Map(
    list.map((tpl) => [normalize(String(tpl?.product_name || tpl?.productName || "")), tpl]),
  );
  const mappedKey = resolveFurnitureTemplateKey(itemName, sectionName);
  if (mappedKey && byName.has(normalize(mappedKey))) {
    return byName.get(normalize(mappedKey));
  }
  return findFurnitureTemplate(list, itemName, normalize);
}

export function parsePanelSize(text) {
  const m = String(text || "").match(/(\d+(?:\.\d+)?)\s*[_xх×]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!(a > 0) || !(b > 0)) return null;
  return { width: Math.ceil(Math.max(a, b)), height: Math.ceil(Math.min(a, b)) };
}

function canFitPiece(piece, sheetW, sheetH, gap) {
  const gw = piece.width + gap;
  const gh = piece.height + gap;
  return (gw <= sheetW && gh <= sheetH) || (gh <= sheetW && gw <= sheetH);
}

function fitPieceToRows(piece, rows, sheetW, gap) {
  const variants = [
    { w: piece.width + gap, h: piece.height + gap },
    { w: piece.height + gap, h: piece.width + gap },
  ];
  for (const v of variants) {
    for (const row of rows) {
      if (v.h <= row.height && row.used + v.w <= sheetW) {
        row.used += v.w;
        return true;
      }
    }
  }
  return false;
}

export function estimateSheetsFromPieces(pieces, sheetW = SHEET_W, sheetH = SHEET_H, gap = CUT_GAP) {
  const list = (Array.isArray(pieces) ? pieces : []).filter(Boolean);
  if (!list.length) return 0;
  const sorted = [...list].sort((a, b) => b.width * b.height - a.width * a.height);
  const sheets = [];
  for (const piece of sorted) {
    if (!canFitPiece(piece, sheetW, sheetH, gap)) return 0;
    let placed = false;
    for (const sheet of sheets) {
      if (fitPieceToRows(piece, sheet.rows, sheetW, gap)) {
        placed = true;
        break;
      }
      const variants = [
        { w: piece.width + gap, h: piece.height + gap },
        { w: piece.height + gap, h: piece.width + gap },
      ];
      for (const v of variants) {
        if (sheet.usedHeight + v.h <= sheetH && v.w <= sheetW) {
          sheet.rows.push({ height: v.h, used: v.w });
          sheet.usedHeight += v.h;
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) {
      const variants = [
        { w: piece.width + gap, h: piece.height + gap },
        { w: piece.height + gap, h: piece.width + gap },
      ];
      const first = variants.find((v) => v.w <= sheetW && v.h <= sheetH);
      if (!first) return 0;
      sheets.push({ rows: [{ height: first.h, used: first.w }], usedHeight: first.h });
    }
  }
  return sheets.length;
}

export function estimateSheetsFromTemplateDetails(details, qty, sheetW = SHEET_W, sheetH = SHEET_H) {
  const q = Number(qty || 0);
  if (!(q > 0)) return 0;
  const pieces = [];
  for (const detail of Array.isArray(details) ? details : []) {
    const name = detail?.detailName || detail?.detail_name || "";
    const perUnit = Number(detail?.perUnit ?? detail?.per_unit ?? 0);
    if (!(perUnit > 0)) continue;
    const size = parsePanelSize(name);
    if (!size) continue;
    const total = Math.ceil(perUnit * q);
    for (let i = 0; i < total; i += 1) pieces.push(size);
  }
  return estimateSheetsFromPieces(pieces, sheetW, sheetH);
}

function materialSheetDims(materialName) {
  const key = normalizeMaterialKey(materialName);
  const mapped = MATERIAL_SHEET_SIZE[key] || "";
  return String(mapped).replace(/[\s*хx×]/gi, "");
}

export function isLargeFormatMaterial(materialName) {
  return materialSheetDims(materialName) === "28002070";
}

export function isSmallFormatMaterial(materialName) {
  return materialSheetDims(materialName) === "27501830";
}

export function getMaterialSheetDimensions(materialName) {
  const dims = materialSheetDims(materialName);
  if (dims === "28002070") return { width: 2800, height: 2070, format: "large" };
  if (dims === "27501830") return { width: 2750, height: 1830, format: "small" };
  return null;
}

export function resolveDeskOutputPerSheet(sectionName, itemName, materialName = "") {
  const vSection = normalizePlanKey(sectionName);
  const vItem = normalizePlanKey(itemName);
  const vMaterial = normalizePlanKey(materialName);
  const vMaterialDims = vMaterial.replace(/[\s*хx×]/g, "");
  const flags = {
    cremona: vSection.includes("cremona") || vItem.includes("cremona"),
    solito2: vSection.includes("solito2") || vItem.includes("solito2") || vItem.includes("solito 2"),
    solito1150:
      vItem.includes("серия 1150") || (vItem.includes("solito") && vItem.includes("1150") && !vItem.includes("1350")),
    solito1350: vItem.includes("серия 1350") || (vItem.includes("1350") && vItem.includes("solito")),
    stabile: vSection.includes("stabile") || vItem.includes("stabile"),
    doniniGrande: vItem.includes("donini grande"),
    klassiko: vItem.includes("классико"),
    premier: vItem.includes("премьер"),
    doniniR: vItem.includes("donini r"),
    pinoX: vItem.includes("pino x"),
  };
  const doniniTarget =
    vSection.includes("avella") ||
    vItem.includes("avella") ||
    Object.values(flags).some(Boolean) ||
    vItem.includes("donini 806") ||
    vItem.includes("donini 750");
  if (!doniniTarget) return 0;

  if (flags.solito1350) return 4;
  if (flags.premier) return 5;
  if (flags.klassiko) return 6;
  if (flags.doniniGrande) return 3;
  if (flags.doniniR) return 4;
  if (flags.solito2) return 6;
  if (flags.solito1150) return 6;

  const mappedDims = materialSheetDims(materialName);
  if (flags.stabile) {
    if (mappedDims === "28002070") return 4;
    if (mappedDims === "27501830") return 3;
  }
  if (mappedDims === "28002070") return flags.cremona ? 2 : 6;
  if (mappedDims === "27501830") return flags.cremona ? 1.5 : 4;
  if (vMaterialDims.includes("28002070")) return flags.stabile ? 4 : flags.cremona ? 2 : 6;
  if (vMaterialDims.includes("27501830")) return flags.stabile ? 3 : flags.cremona ? 1.5 : 4;
  return 0;
}

function isShelfArticle(articleCode, itemName) {
  const code = String(articleCode || "").trim().toUpperCase();
  const item = normalizePlanKey(itemName);
  return code.startsWith("GXSS") || item.includes("система хранения") || item.includes("полка системы");
}

export function resolveShelfSheetsFromCatalog(articleCode, qty, catalogMap) {
  const code = normalizeCatalogCode(articleCode);
  const entry = catalogMap?.[code];
  if (!entry) return 0;
  const q = Number(qty || 0);
  if (!(q > 0)) return 0;
  const pieces = [];
  for (const pair of Array.isArray(entry.pairs) ? entry.pairs : []) {
    const size = parsePanelSize(pair?.text);
    const perKit = Number(pair?.qty || 0);
    if (!size || !(perKit > 0)) continue;
    const total = Math.ceil(perKit * q);
    for (let i = 0; i < total; i += 1) pieces.push(size);
  }
  return estimateSheetsFromPieces(pieces);
}

export function resolvePlanItemSheets({
  itemName = "",
  sectionName = "",
  materialName = "",
  qty = 0,
  articleCode = "",
  templates = [],
  shelfCatalog = DEFAULT_GX_SHELF_CATALOG,
  normalizeKey,
} = {}) {
  const q = Number(qty || 0);
  if (!(q > 0)) return { sheets: 0, outputPerSheet: 0 };

  const deskOutput = resolveDeskOutputPerSheet(sectionName, itemName, materialName);
  if (deskOutput > 0) {
    return { sheets: ceilWholeSheets(q / deskOutput), outputPerSheet: deskOutput };
  }

  if (isShelfArticle(articleCode, itemName)) {
    const catalogMap = buildCatalogMap(shelfCatalog);
    const shelfSheets = resolveShelfSheetsFromCatalog(articleCode, q, catalogMap);
    if (shelfSheets > 0) {
      return { sheets: shelfSheets, outputPerSheet: q / shelfSheets };
    }
  }

  const tpl = findPlanFurnitureTemplate(templates, itemName, sectionName, normalizeKey);
  if (tpl) {
    const kits = resolveKitsPerSheetFromTemplate(tpl, materialName);
    if (kits > 0) {
      const outputPerSheet = resolveOutputPerSheetFromTemplate(tpl, materialName);
      return {
        sheets: sheetsFromTemplateKits(kits, q),
        outputPerSheet: outputPerSheet > 0 ? outputPerSheet : q / sheetsFromTemplateKits(kits, q),
      };
    }
    const details = tpl?.details;
    if (Array.isArray(details) && details.length) {
      const sheets = estimateSheetsFromTemplateDetails(details, q);
      if (sheets > 0) {
        return { sheets, outputPerSheet: q / sheets };
      }
    }
  }

  return { sheets: 0, outputPerSheet: 0 };
}
