import * as XLSX from "xlsx";

export function toNum(v) {
  const n = Number(String(v ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

export function furnitureProductLabel(name) {
  const raw = String(name || "").trim();
  const key = normalizeStrapProductKey(raw);
  if (key === "авелла лайт") return "Авелла Лайт";
  if (key === "авелла") return "Авелла";
  return raw;
}

export function normalizeFurnitureKey(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[ё]/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeStrapProductKey(v) {
  const key = normalizeFurnitureKey(v)
    .replace(/\bavella\b/g, "авелла")
    .replace(/\bavela\b/g, "авелла")
    .replace(/\blite\b/g, "лайт");
  if (key === "авела" || key === "авелла") return "авелла";
  if (key === "авела лайт" || key === "авелла лайт") return "авелла лайт";
  const hasDonini = key.includes("донини") || key.includes("donini");
  const hasWhite = key.includes("бел") || key.includes("white");
  const isR = key.includes("донини r") || key.includes("donini r");
  const isGrande = key.includes("донини гранде") || key.includes("donini grande");
  if (hasDonini && hasWhite && !isR && !isGrande) return "донини белый";
  return key;
}

export function normalizeDetailPatternKey(v) {
  return normalizeFurnitureKey(v)
    .replace(/[xх_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractDetailSizeToken(v) {
  const raw = String(v || "").trim();
  if (!raw) return "";
  const m = raw.match(/(\d{2,4})\s*[_xх]\s*(\d{2,4})/i);
  if (!m) return "";
  return `${m[1]}_${m[2]}`;
}

function resolveFurnitureAliasKey(candidates) {
  const text = candidates.join(" ");
  const checks = [
    { has: ["donini grande"], key: "донини гранде" },
    { has: ["donini r"], key: "донини r" },
    { has: ["donini"], key: "донини" },
    { has: ["avella lite", "авелла лайт", "авела лайт"], key: "авелла лайт" },
    { has: ["avella", "авелла", "авела"], key: "авелла" },
    { has: ["cremona", "кремона"], key: "кремона" },
    { has: ["stabile", "стабиле"], key: "стабиле" },
    { has: ["premier", "премьер", "примьера"], key: "примьера" },
    { has: ["classico", "классико"], key: "классико" },
    { has: ["solito2"], key: "solito2" },
    { has: ["solito", "солито"], key: "солито 1350" },
    { has: ["siena"], key: "siena" },
    { has: ["тумба под тв лофт 150", "тв лофт 150", "tv loft 150"], key: "тв тумба 1500" },
    { has: ["тумба под тв лофт", "тв лофт", "tv loft"], key: "тв тумба" },
  ];
  if ((text.includes("solito") || text.includes("солито")) && text.includes("1150")) return "солито 1150";
  if ((text.includes("solito") || text.includes("солито")) && text.includes("1350")) return "солито 1350";
  for (const rule of checks) {
    if (rule.has.some((needle) => text.includes(needle))) return rule.key;
  }
  return "";
}

export function parseFurnitureSheet(workbook, sheetName) {
  const ws = workbook?.Sheets?.[sheetName];
  if (!ws) return { headers: [], rows: [] };
  const ref = String(ws["!ref"] || "A1:A1");
  const range = XLSX.utils.decode_range(ref);
  const allRows = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      const value = cell?.w ?? cell?.v ?? "";
      row.push({
        value: String(value ?? ""),
        formula: cell?.f ? `=${cell.f}` : "",
      });
    }
    allRows.push(row);
  }
  const headers = (allRows[0] || []).map((x, i) => x.value || `Колонка ${i + 1}`);
  return { headers, rows: allRows.slice(1) };
}

export function buildFurnitureTemplates(workbook, sheetName) {
  const ws = workbook?.Sheets?.[sheetName];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  const blocks = [];
  let current = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    const productName = furnitureProductLabel(String(r[1] || "").trim());
    const productColor = String(r[2] || "").trim();
    const baseQtyRaw = toNum(r[3]);
    const detailColor = String(r[4] || "").trim();
    const detailName = String(r[5] || "").trim();
    const detailQtyRaw = toNum(r[6]);
    if (productName) {
      if (current && current.details.length) blocks.push(current);
      current = {
        productName,
        productColor,
        baseQty: baseQtyRaw > 0 ? baseQtyRaw : 1,
        details: [],
      };
    }
    if (current && detailName && detailQtyRaw > 0) {
      const perUnit = current.baseQty > 0 ? detailQtyRaw / current.baseQty : detailQtyRaw;
      current.details.push({
        color: detailColor,
        detailName,
        sampleQty: detailQtyRaw,
        perUnit,
      });
    }
  }
  if (current && current.details.length) blocks.push(current);
  const byProduct = new Map();
  blocks.forEach((b) => {
    if (!byProduct.has(b.productName)) byProduct.set(b.productName, []);
    byProduct.get(b.productName).push(b);
  });

  const result = [];
  byProduct.forEach((arr) => {
    const variants = [...arr].sort((a, b) => b.details.length - a.details.length);
    const main = variants[0];
    if (main) result.push(main);
  });

  const uniqueByName = new Map();
  result.forEach((r) => {
    const key = normalizeFurnitureKey(r.productName);
    if (!uniqueByName.has(key)) uniqueByName.set(key, r);
  });
  return [...uniqueByName.values()].sort((a, b) => a.productName.localeCompare(b.productName, "ru"));
}

export function detailPatternToStrapName(pattern) {
  const raw = String(pattern || "").trim();
  if (!raw) return "";
  const sizeMatch = raw.match(/(\d{3,4}_\d{2,3})/);
  if (sizeMatch) return `Обвязка (${sizeMatch[1]})`;
  if (raw.toLowerCase().includes("обвязк")) return "Обвязка";
  return "";
}

export function strapNameToOrderItem(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const sizeMatch = raw.match(/(\d{3,4}_\d{2,3})/);
  if (sizeMatch) return sizeMatch[1];
  return raw.replace(/^обвязка\s*/i, "").replace(/[()]/g, "").trim() || raw;
}

export function isStrapVirtualRowId(rowId) {
  return String(rowId || "").startsWith("strap-order:");
}

export function canonicalStrapProductName(name) {
  const label = furnitureProductLabel(name);
  const key = normalizeStrapProductKey(label);
  if (key === "авелла") return "Авелла";
  if (key === "авела лайт" || key === "авелла лайт") return "Авелла Лайт";
  if (key === "донини белый") return "Донини Белый";
  if (key === "донини гранде") return "Донини Гранде";
  if (key === "донини") return "Донини";
  return label;
}

export function resolveStrapMaterialByProduct(productName) {
  const key = normalizeStrapProductKey(productName);
  if (key.includes("бел")) return "Белый";
  return "Черный";
}

export function resolveFurnitureTemplateForPreview(preview, templates) {
  const list = Array.isArray(templates) ? templates : [];
  if (!list.length) return null;
  const candidates = [
    String(preview?.firstName || ""),
    String(preview?.detailedName || ""),
  ]
    .map(normalizeFurnitureKey)
    .filter(Boolean);
  if (!candidates.length) return null;

  const aliasKey = resolveFurnitureAliasKey(candidates);
  if (aliasKey) {
    const byAlias = list.find((t) => normalizeFurnitureKey(t?.productName || "") === aliasKey);
    if (byAlias) return byAlias;
  }

  const byExact = list.find((t) => {
    const key = normalizeFurnitureKey(t?.productName || "");
    return key && candidates.some((c) => c === key);
  });
  if (byExact) return byExact;

  const byContains = list.find((t) => {
    const key = normalizeFurnitureKey(t?.productName || "");
    return key && candidates.some((c) => c.includes(key) || key.includes(c));
  });
  return byContains || null;
}
