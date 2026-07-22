import { describe, it } from "vitest";
import { parseStrapSize } from "../src/app/appUtils.js";
import { STRAP_SHEET_HEIGHT, STRAP_SHEET_WIDTH } from "../src/constants/views.js";
import {
  getResolvedWorkshopStrapNeeds,
  strapConsumeColorForOrder,
  strapDisplayNameForCode,
} from "../src/app/workshopStrapNeeds.js";
import { normalizeFurnitureKey } from "../src/utils/furnitureUtils.js";
import {
  buildAugustPlanMaterialReport,
  calculateAugustPlanMaterials,
  fetchAugustPlanCalcData,
  loadAugustPlan,
} from "./augustPlanMaterialCalc.js";

function sheetsForStrapQty(name, qty) {
  const size = parseStrapSize(name);
  if (!size || !(qty > 0)) return { sheets: 0, perSheet: 0 };
  const stripsPerSheet = Math.floor(STRAP_SHEET_HEIGHT / size.width);
  const perStrip = Math.floor(STRAP_SHEET_WIDTH / size.length);
  const perSheet = stripsPerSheet * perStrip;
  if (perSheet <= 0) return { sheets: 0, perSheet: 0, invalid: true };
  return { sheets: Math.ceil(qty / perSheet), perSheet };
}

describe("august black strap sheets", () => {
  it("calculates LDSP sheets for black straps", async () => {
    const plan = loadAugustPlan();
    const data = await fetchAugustPlanCalcData();
    const deps = {
      furnitureTemplates: data.templates,
      furnitureCustomTemplates: data.templates,
      furnitureDetailArticleRows: data.details,
      normalizeFurnitureKey,
    };

    const byCode = new Map();
    let whitePieces = 0;

    for (const row of plan) {
      const qty = Number(row.qty || 0);
      if (!(qty > 0)) continue;
      const hit = calculateAugustPlanMaterials([row], data).positions[0];
      const order = { item: hit?.crmItem || row.name, qty };
      const color = strapConsumeColorForOrder(order);
      const needs = getResolvedWorkshopStrapNeeds(order, deps);
      const list = color === "Черный" ? needs : [];
      if (color !== "Черный") {
        whitePieces += needs.reduce((s, n) => s + Number(n.needed || 0), 0);
      }
      for (const n of list) {
        const code = String(n.code || "").trim();
        const needed = Number(n.needed || 0);
        if (!code || !(needed > 0)) continue;
        const prev = byCode.get(code) || {
          code,
          name: strapDisplayNameForCode(code),
          pieces: 0,
        };
        prev.pieces += needed;
        byCode.set(code, prev);
      }
    }

    let totalSheets = 0;
    const lines = [...byCode.values()]
      .map((entry) => {
        const { sheets, perSheet } = sheetsForStrapQty(entry.name, entry.pieces);
        totalSheets += sheets;
        return { ...entry, perSheet, sheets };
      })
      .sort((a, b) => b.pieces - a.pieces);

    console.log("\n=== ЧЁРНАЯ ОБВЯЗКА → ЛИСТЫ ЛДСП 2800×2070 ===");
    lines.forEach((row) => {
      console.log(
        `${row.name}: ${row.pieces} шт → ${row.perSheet} шт/лист → ${row.sheets} листов`,
      );
    });
    console.log(`\nИТОГО листов чёрного ЛДСП на обвязку: ${totalSheets}`);
    console.log(`(белая обвязка, не в расчёте: ${Math.round(whitePieces)} шт планок)`);

    const report = await buildAugustPlanMaterialReport();
    console.log(`\nВсего планок в плане (все цвета): ${report.totals.totalStraps}`);
    console.log(`Сумма листов по типам: ${lines.reduce((s, x) => s + x.sheets, 0)}`);
  }, 120000);
});
