/**
 * Экспорт раскроя в формат NXCut XML (.xml)
 *
 * NXCut — родной формат раскроечного станка.
 * Структура: дерево гильотинных резов без абсолютных координат.
 * Машина сама вычисляет позиции из дерева + EdgeCutSize + SawThickness.
 *
 * Иерархия:
 *   <SawLot>                              корень файла
 *     <SawPlan>                           один лист
 *       <PartTable><PartItem /></PartTable>  список деталей с ID
 *       <SawPart Layer="0">               полный лист (корень дерева)
 *         <PartList>
 *           <SawPart Layer="1">           горизонтальная полоса
 *             <PartList>
 *               <SawPart Layer="2"/>      деталь или sub-column контейнер
 *                 <PartList>
 *                   <SawPart Layer="3"/> деталь в sub-column
 *                 </PartList>
 *               </SawPart>
 *             </PartList>
 *           </SawPart>
 *         </PartList>
 *       </SawPart>
 *     </SawPlan>
 *   </SawLot>
 *
 * Позиции определяются структурой дерева:
 *   - EdgeCutSize у Layer=0 = отступ сверху (marginY)
 *   - EdgeCutSize у Layer=1 = отступ слева  (marginX)
 *   - Порядок дочерних элементов = порядок резов
 *
 * Remain = свободное место после последней детали:
 *   Layer=0: sheetH - marginY - Σ(stripH + kerf)
 *   Layer=1: sheetW - marginX - Σ(pieceW + kerf)
 */

// ─── helpers ─────────────────────────────────────────────────────────────────

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Форматирование числа: до 1 десятичного знака, без лишних нулей */
function fmt(v) {
  const n = parseFloat(Number(v).toFixed(1));
  return n === Math.round(n) ? String(Math.round(n)) : n.toFixed(1);
}

/** Дата в формате NXCut: "MM/DD/YYYY HH:MM:SS AM" */
function fmtDate() {
  const d = new Date();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = d.getFullYear();
  const hh = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ampm = hh < 12 ? "AM" : "PM";
  const hh12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${mo}/${dd}/${yy} ${String(hh12).padStart(2, "0")}:${mm}:${ss} ${ampm}`;
}

/** Thickness from material name: "ЛДСП 16мм" → 16 */
function parsePly(mat) {
  const m = String(mat).match(/(\d+)\s*мм/i) || String(mat).match(/[-_\s*](\d+)[^а-я]/i);
  return m ? parseInt(m[1], 10) : 16;
}

/** Orientation attribute: Vertical if w < h, else Horizontal */
function orient(w, h) {
  return w < h ? "Vertical" : "Horizontal";
}

// ─── Strip reconstruction ─────────────────────────────────────────────────────

/**
 * Groups pieces into horizontal strips.
 * A piece belongs to a strip if its SVG-y is within [strip.svgY, strip.svgY + strip.h).
 * Returns strips sorted top-to-bottom (ascending svgY).
 */
function buildStrips(pieces) {
  const sorted = [...pieces].sort((a, b) =>
    Math.abs(a.y - b.y) < 0.2 ? a.x - b.x : a.y - b.y
  );

  const strips = [];

  for (const p of sorted) {
    let placed = false;
    for (const s of strips) {
      if (p.y >= s.svgY - 0.1 && p.y < s.svgY + s.h - 0.1) {
        s.pieces.push(p);
        if (Math.abs(p.y - s.svgY) < 0.3 && p.h > s.h) s.h = p.h;
        placed = true;
        break;
      }
    }
    if (!placed) {
      strips.push({ svgY: p.y, h: p.h, pieces: [p] });
    }
  }

  // Finalize strip heights
  for (const s of strips) {
    for (const p of s.pieces) {
      if (Math.abs(p.y - s.svgY) < 0.3 && p.h > s.h) s.h = p.h;
    }
  }

  return strips.sort((a, b) => a.svgY - b.svgY);
}

/**
 * Calculates the Remain for the sheet root node (Layer=0):
 * unused space below the last strip (bottom offcut).
 */
function remainSheet(sheetH, marginY, strips, kerf) {
  if (!strips.length) return sheetH - marginY;
  const used = strips.reduce((s, strip) => s + strip.h, 0) + (strips.length - 1) * kerf;
  return sheetH - marginY - used;
}

/**
 * Calculates the Remain for a strip (Layer=1):
 * unused space to the right of the last piece.
 */
function remainStrip(sheetW, marginX, stripPieces, kerf) {
  if (!stripPieces.length) return sheetW - marginX;
  // Use rightmost edge of any piece
  const rightEdge = Math.max(...stripPieces.map((p) => p.x + p.w));
  return sheetW - rightEdge;
}

// ─── XML builder ─────────────────────────────────────────────────────────────

/**
 * Generates NXCut XML for all material groups.
 *
 * @param {Array<{material, sheets, totalPieces, totalSheets}>} materialGroups
 * @param {string} jobName
 * @param {{sheetW, sheetH, kerf, marginX, marginY}} settings
 * @returns {string} XML
 */
export function generateNXCutFile(materialGroups, jobName, settings = {}) {
  const {
    sheetW  = 2800,
    sheetH  = 2070,
    kerf    = 4.8,
    marginX = 20,
    marginY = 20,
  } = settings;

  const fileName = `${jobName}.xml`;
  const dateStr  = fmtDate();

  // Total piece count across everything
  const totalCnc = materialGroups.reduce(
    (s, g) => s + g.sheets.reduce((ss, sh) => ss + sh.pieces.length * sh.repeatCount, 0),
    0
  );

  const firstRepeat = materialGroups[0]?.sheets[0]?.repeatCount ?? 1;

  const lines = [];
  lines.push('<?xml version="1.0"?>');
  lines.push(
    `<SawLot xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` +
    ` xmlns:xsd="http://www.w3.org/2001/XMLSchema"` +
    ` FileName="${esc(fileName)}"` +
    ` PanelQty="0"` +
    ` CncQty="${totalCnc}"` +
    ` OffcutMode="0"` +
    ` P3="${dateStr}"` +
    ` P14="${firstRepeat}"` +
    ` P15="0">`
  );
  lines.push("  <PlanList>");

  let planNo    = 1;
  let globalId  = 1; // Sequential piece ID across all plans

  for (const group of materialGroups) {
    const ply = parsePly(group.material);

    for (const sheet of group.sheets) {
      const lW  = sheet.sheetW ?? sheetW;
      const lH  = sheet.sheetH ?? sheetH;
      const planStr = String(planNo).padStart(4, "0");
      const cncQty  = sheet.pieces.length;

      // Build strips from piece positions
      const strips = buildStrips(sheet.pieces);

      // Map each piece to its sequential ID
      const pieceIdMap = new Map();
      sheet.pieces.forEach((p, i) => {
        pieceIdMap.set(p, globalId + i);
      });
      globalId += sheet.pieces.length;

      // ── SawPlan ──────────────────────────────────────────────────────────
      lines.push(
        `    <SawPlan` +
        ` MaterialWidth="${lW}"` +
        ` MaterialHeight="${lH}"` +
        ` MaterialThickness="${ply}"` +
        ` SawThickness="${kerf}"` +
        ` LotNo="${esc(jobName)}"` +
        ` PlanNo="${planStr}"` +
        ` Book="1"` +
        ` Total="0"` +
        ` Finish="${cncQty}"` +
        ` FileName="${esc(fileName)}"` +
        ` MaterialName="${esc(group.material)}"` +
        ` PlanQty="${sheet.repeatCount}"` +
        ` CncQty="${cncQty}"` +
        ` MaterialNo="${esc(group.material)}"` +
        ` P13="${cncQty}"` +
        ` P15="${cncQty}">`
      );

      // ── PartTable ─────────────────────────────────────────────────────────
      lines.push("      <PartTable>");
      for (const p of sheet.pieces) {
        const id   = pieceIdMap.get(p);
        const turn = p.rotated ? "True" : "False";
        // Info: Name,Width,Height,Turn,Kerf,Count + 40 empty fields
        const info = `${esc(p.label)},${fmt(p.w)},${fmt(p.h)},${turn},${kerf},1,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,`;
        lines.push(`        <PartItem ID="${id}" Info="${info}" />`);
      }
      lines.push("      </PartTable>");

      // ── Layer=0: full sheet (root) ────────────────────────────────────────
      const rootOrient = orient(lW, lH);
      const rootRemain = fmt(remainSheet(lH, marginY, strips, kerf));

      lines.push(
        `      <SawPart Orientation="${rootOrient}" Layer="0"` +
        ` Width="${lW}" Height="${lH}"` +
        ` Qty="1" EdgeCutSize="${marginY}" Remain="${rootRemain}" IDCount="0">`
      );
      lines.push("        <PartList>");

      // ── Layer=1: strips ───────────────────────────────────────────────────
      for (const strip of strips) {
        const sH     = fmt(strip.h);
        const sRemain = fmt(remainStrip(lW, marginX, strip.pieces, kerf));

        lines.push(
          `          <SawPart Orientation="Horizontal" Layer="1"` +
          ` Width="${lW}" Height="${sH}"` +
          ` Qty="1" EdgeCutSize="${marginX}" Remain="${sRemain}" IDCount="0" Name="деталь">`
        );
        lines.push("            <PartList>");

        // Sort pieces by x within the strip
        const sortedPieces = [...strip.pieces].sort((a, b) => a.x - b.x);

        for (const p of sortedPieces) {
          const id     = pieceIdMap.get(p);
          const pOrient = orient(p.w, p.h);
          const pW     = fmt(p.w);
          const pH     = fmt(p.h);
          const idAttr = id ? ` IDList="[${id}]"` : "";
          const nameAttr = ` Name="${esc(p.label)}"`;
          const isFullH  = Math.abs(p.h - strip.h) < 0.3;

          if (isFullH) {
            // ── Leaf piece (full strip height) ──────────────────────────────
            lines.push(
              `              <SawPart Orientation="${pOrient}" Layer="2"` +
              ` Width="${pW}" Height="${pH}"` +
              ` Qty="1" EdgeCutSize="0" Remain="0" IDCount="0"${idAttr}${nameAttr} />`
            );
          } else {
            // ── Sub-column container (piece is shorter than strip height) ───
            // The container occupies the full strip height in this column slot,
            // the actual piece is inside as Layer=3.
            const subRemain = fmt(strip.h - p.h);
            lines.push(
              `              <SawPart Orientation="${pOrient}" Layer="2"` +
              ` Width="${pW}" Height="${sH}"` +
              ` Qty="1" EdgeCutSize="0" Remain="${subRemain}" IDCount="0">`
            );
            lines.push("                <PartList>");
            lines.push(
              `                  <SawPart Orientation="${pOrient}" Layer="3"` +
              ` Width="${pW}" Height="${pH}"` +
              ` Qty="1" EdgeCutSize="0" Remain="0" IDCount="0"${idAttr}${nameAttr} />`
            );
            lines.push("                </PartList>");
            lines.push(`              </SawPart>`);
          }
        }

        lines.push("            </PartList>");
        lines.push("          </SawPart>");
      }

      lines.push("        </PartList>");
      lines.push("      </SawPart>");
      lines.push("    </SawPlan>");

      planNo++;
    }
  }

  lines.push("  </PlanList>");
  lines.push("</SawLot>");

  return lines.join("\n");
}

/**
 * Скачивает .xml файл NXCut.
 */
export function downloadNXCut(content, filename) {
  const name  = filename.replace(/\.xml$/i, "") + ".xml";
  const blob  = new Blob([content], { type: "application/xml;charset=utf-8" });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement("a");
  a.href      = url;
  a.download  = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Скачивает NXCut XML для всего задания.
 */
export function downloadAllNXCut(materialGroups, jobName, settings = {}) {
  const content = generateNXCutFile(materialGroups, jobName, settings);
  const safe    = jobName.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
  downloadNXCut(content, safe);
}
