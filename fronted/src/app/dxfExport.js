/**
 * DXF R12 экспорт раскроя.
 *
 * DXF R12 — старейший, наиболее совместимый диалект CAD-формата.
 * Принимается всеми пильными центрами (Homag, Biesse, СКАМ, ИВТ и др.)
 * и любым CAD-ПО (AutoCAD, FreeCAD, LibreCAD, nanoCAD).
 *
 * Слои:
 *   SHEET_BORDER  — контур листа (серый)
 *   MARGINS       — линии отступов (голубой, пунктир)
 *   PIECES        — контуры деталей (белый/чёрный)
 *   LABELS        — размерные подписи (жёлтый)
 *   WASTE         — зона отходов (серый, пунктир)
 *
 * Единицы: миллиметры. Ось Y — вверх (стандарт DXF).
 * Координаты деталей конвертируются: dxfY = sheetH − screenY − pieceH
 */

// ─── Low-level DXF builders ──────────────────────────────────────────────────

function line(x1, y1, x2, y2, layer = "PIECES", ltypeScale = 1) {
  return [
    "0", "LINE",
    "8", layer,
    "10", fmt(x1), "20", fmt(y1),
    "11", fmt(x2), "21", fmt(y2),
  ].join("\n");
}

function rect(x, y, w, h, layer, sheetH) {
  // Convert from screen coords (Y down) to DXF (Y up)
  const y1 = sheetH - y - h;
  const y2 = sheetH - y;
  return [
    line(x,     y1, x + w, y1, layer),
    line(x + w, y1, x + w, y2, layer),
    line(x + w, y2, x,     y2, layer),
    line(x,     y2, x,     y1, layer),
  ].join("\n");
}

function text(x, y, height, content, layer = "LABELS") {
  // DXF TEXT entity with horizontal center justification
  return [
    "0", "TEXT",
    "8", layer,
    "10", fmt(x), "20", fmt(y),
    "40", fmt(height),
    "1", String(content),
    "72", "1",           // 1 = center
    "11", fmt(x), "21", fmt(y),
  ].join("\n");
}

function fmt(v) {
  return Number(v).toFixed(3);
}

// ─── Layer table ─────────────────────────────────────────────────────────────

function layerDef(name, colorIndex, ltype = "CONTINUOUS") {
  return [
    "0", "LAYER",
    "2", name,
    "70", "0",
    "62", String(colorIndex),
    "6", ltype,
  ].join("\n");
}

const LTYPE_DASHED = `\
0\nLTYPE\n2\nDASHED\n70\n0\n3\nDashed __ __ __ __ __\n72\n65\n73\n4\n40\n12.0\n49\n6.0\n49\n-3.0\n49\n6.0\n49\n-3.0`;

// ─── Main generator ──────────────────────────────────────────────────────────

/**
 * Generates a DXF R12 string for a single sheet layout.
 *
 * @param {{pieces: Array<{label,x,y,w,h,rotated}>, sheetW: number, sheetH: number}} sheet
 * @param {{marginX?: number, marginY?: number}} options
 * @returns {string} DXF file content
 */
export function generateSheetDXF(sheet, options = {}) {
  const { sheetW, sheetH, pieces } = sheet;
  const marginX = options.marginX ?? 0;
  const marginY = options.marginY ?? 0;

  const entities = [];

  // Sheet border
  entities.push(rect(0, 0, sheetW, sheetH, "SHEET_BORDER", sheetH));

  // Margin rectangle (if any)
  if (marginX > 0 || marginY > 0) {
    entities.push(rect(marginX, marginY, sheetW - 2 * marginX, sheetH - 2 * marginY, "MARGINS", sheetH));
  }

  // Pieces
  for (const p of pieces) {
    entities.push(rect(p.x, p.y, p.w, p.h, "PIECES", sheetH));

    // Labels: item name + size
    const dxfCy = sheetH - p.y - p.h / 2;       // center Y in DXF coords
    const dxfCx = p.x + p.w / 2;
    const sizeStr = p.rotated ? `${p.h}x${p.w}` : `${p.w}x${p.h}`;
    const labelH = Math.min(p.h, p.w) * 0.10;

    if (labelH >= 3 && p.w > 20 && p.h > 10) {
      // Size label (main)
      entities.push(text(dxfCx, dxfCy + labelH * 0.6, labelH, sizeStr, "LABELS"));
      // Item name (smaller, below size)
      if (p.w > 60 && p.h > 25) {
        const nameH = labelH * 0.7;
        entities.push(text(dxfCx, dxfCy - labelH * 0.9, nameH, truncate(p.label, 24), "LABELS"));
      }
    }
  }

  // Waste zone: right remainder
  const maxRight  = pieces.length ? Math.max(...pieces.map((p) => p.x + p.w)) : 0;
  const maxBottom = pieces.length ? Math.max(...pieces.map((p) => p.y + p.h)) : 0;
  const rightRem  = sheetW - maxRight;
  const bottomRem = sheetH - maxBottom;

  if (rightRem > 5) {
    entities.push(rect(maxRight, 0, rightRem, maxBottom || sheetH, "WASTE", sheetH));
    entities.push(text(
      maxRight + rightRem / 2,
      sheetH - (maxBottom || sheetH) / 2,
      Math.min(18, rightRem * 0.25),
      `${Math.round(rightRem)} мм`,
      "WASTE"
    ));
  }
  if (bottomRem > 5) {
    entities.push(rect(0, maxBottom, sheetW, bottomRem, "WASTE", sheetH));
    entities.push(text(
      sheetW / 2,
      sheetH - (maxBottom + bottomRem / 2),
      Math.min(18, bottomRem * 0.25),
      `${Math.round(bottomRem)} мм`,
      "WASTE"
    ));
  }

  // ── Assemble DXF ──
  const dxf = `\
0\nSECTION\n2\nHEADER
9\n$ACADVER\n1\nAC1009
9\n$INSUNITS\n70\n4
9\n$EXTMIN\n10\n0.000\n20\n0.000\n30\n0.000
9\n$EXTMAX\n10\n${fmt(sheetW)}\n20\n${fmt(sheetH)}\n30\n0.000
9\n$LIMMIN\n10\n0.000\n20\n0.000
9\n$LIMMAX\n10\n${fmt(sheetW)}\n20\n${fmt(sheetH)}
0\nENDSEC
0\nSECTION\n2\nTABLES
0\nTABLE\n2\nLTYPE\n70\n2
0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0
${LTYPE_DASHED}
0\nENDTAB
0\nTABLE\n2\nLAYER\n70\n5
${layerDef("SHEET_BORDER", 8)}
${layerDef("MARGINS", 4, "DASHED")}
${layerDef("PIECES", 7)}
${layerDef("LABELS", 2)}
${layerDef("WASTE", 9, "DASHED")}
0\nENDTAB
0\nENDSEC
0\nSECTION\n2\nENTITIES
${entities.join("\n")}
0\nENDSEC
0\nEOF`;

  return dxf;
}

/**
 * Triggers a browser download of a DXF file.
 * @param {string} dxfContent
 * @param {string} filename
 */
export function downloadDXF(dxfContent, filename) {
  const blob = new Blob([dxfContent], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".dxf") ? filename : filename + ".dxf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Downloads all unique sheet layouts as individual DXF files (sequential, with delay).
 * @param {Array<{material, sheets}>} materialGroups
 * @param {string} jobName
 * @param {{marginX, marginY}} settings
 */
export function downloadAllDXF(materialGroups, jobName, settings = {}) {
  const files = [];
  for (const group of materialGroups) {
    group.sheets.forEach((sheet, idx) => {
      const namePart = sanitizeFilename(`${jobName}_${group.material}_лист${idx + 1}`);
      const countPart = sheet.repeatCount > 1 ? `_x${sheet.repeatCount}` : "";
      files.push({
        name: `${namePart}${countPart}.dxf`,
        content: generateSheetDXF(sheet, settings),
      });
    });
  }

  files.forEach(({ name, content }, i) => {
    setTimeout(() => downloadDXF(content, name), i * 150);
  });

  return files.length;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

function sanitizeFilename(str) {
  return str.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}
