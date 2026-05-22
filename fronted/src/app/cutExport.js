/**
 * Экспорт раскроя в формат King Stone AutoCUT (.CUT)
 *
 * Читается программой AutoSAW (станки King Stone: NPC-330, NPL-380 и др.).
 * Это НЕ формат BAZIS — это родной XML King Stone с xmlns="http://www.King-stone.com".
 *
 * Кодировка: UTF-16 LE с BOM (стандарт AutoCUT).
 *
 * Система координат:
 *   Px/Py — абсолютные координаты на листе (поля margin уже в piece.x/y).
 *   Sx/Sy в <Condition> = 0 (торцовка задаётся координатами деталей).
 *   Y растёт вниз (начало — левый верхний угол).
 *   Каждый уникальный y детали = отдельная горизонтальная полоса.
 *   Короткие детали в полосе — sub-column с остатком Spare снизу.
 */

// ─── helpers ─────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** до 1 знака после запятой, без лишних нулей */
function fmt(v) {
  const n = parseFloat(Number(v).toFixed(1));
  return n === Math.round(n) ? String(Math.round(n)) : n.toFixed(1);
}

function parsePly(materialName) {
  const m = String(materialName).match(/(\d+)\s*мм/i)
    || String(materialName).match(/[-_\s](\d+)$/);
  return m ? parseInt(m[1], 10) : 16;
}

// ─── Strip reconstruction ─────────────────────────────────────────────────────

/**
 * Группирует детали в горизонтальные полосы по их верхнему Y.
 * Каждый уникальный y = отдельная горизонтальная полоса пилы.
 * (Подполосы с другим y не смешиваются с основной полосой.)
 */
function buildStrips(pieces) {
  const rowMap = new Map();

  for (const p of pieces) {
    const yKey = Math.round(p.y * 10) / 10;
    if (!rowMap.has(yKey)) rowMap.set(yKey, []);
    rowMap.get(yKey).push({ ...p, nx: p.x, ny: p.y });
  }

  return [...rowMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([y, pcs]) => ({
      y,
      h: Math.max(...pcs.map((p) => p.h)),
      pieces: pcs.sort((a, b) => a.nx - b.nx),
    }));
}

/** Рендерит одну деталь или sub-column для короткой детали в полосе */
function renderPiecePart(p, strip, pieceTypes, uidCounter, lines, pad, kerf, addSpare) {
  const p1 = pad + "  ";
  const p2 = pad + "    ";
  const typeKey = `${p.label}|${fmt(p.w)}|${fmt(p.h)}`;
  const pieceUid = pieceTypes?.get(typeKey)?.uid;
  const uidAttr = pieceUid !== undefined ? ` UID="${pieceUid}"` : "";
  const pxAttr = p.nx > 0.01 ? ` Px="${fmt(p.nx)}"` : "";
  const pyAttr = strip.y > 0.01 ? ` Py="${fmt(strip.y)}"` : "";
  const isShort = p.h < strip.h - 0.5;

  if (!isShort) {
    lines.push(
      `${p1}<Part X="${fmt(p.w)}" Y="${fmt(p.h)}"${pxAttr}${pyAttr}${uidAttr}/>`
    );
    return;
  }

  lines.push(
    `${p1}<Part X="${fmt(p.w)}" Y="${fmt(strip.h)}"${pxAttr}${pyAttr}>`
  );
  lines.push(
    `${p2}<Part X="${fmt(p.w)}" Y="${fmt(p.h)}"${pxAttr}${pyAttr}${uidAttr}/>`
  );

  const spareH = strip.h - p.h - kerf;
  if (spareH > 0.5) {
    const sparePy = strip.y + p.h + kerf;
    lines.push(
      `${p2}<Part X="${fmt(p.w)}" Y="${fmt(spareH)}"${pxAttr}` +
      ` Py="${fmt(sparePy)}" UID="${uidCounter.val++}" Spare="true"/>`
    );
    addSpare?.(p.w, spareH);
  }
  lines.push(`${p1}</Part>`);
}

// ─── Layout rendering ─────────────────────────────────────────────────────────

/**
 * Собирает Map уникальных типов деталей для секции <Objective>.
 * Ключ: "label|w|h", значение: { uid, label, w, h, count }
 */
function collectPieceTypes(group) {
  const types = new Map();
  let uid = 0;
  for (const sheet of group.sheets) {
    const rep = sheet.repeatCount || 1;
    for (const p of sheet.pieces) {
      const key = `${p.label}|${fmt(p.w)}|${fmt(p.h)}`;
      if (!types.has(key)) {
        types.set(key, { uid: uid++, label: p.label, w: p.w, h: p.h, count: 0 });
      }
      types.get(key).count += rep;
    }
  }
  return types;
}

/**
 * Рендерит один <Layout> для листа.
 * Возвращает { xml, spares: Map<"WxH", {w, h, count}> }
 */
function renderLayout(id, sheet, settings, pieceTypes) {
  const { sheetW, sheetH, kerf } = settings;
  const lW = sheet.sheetW ?? sheetW;
  const lH = sheet.sheetH ?? sheetH;

  const strips = buildStrips(sheet.pieces);

  let unitArea = 0;
  for (const p of sheet.pieces) unitArea += p.w * p.h;
  const sheetArea = lW * lH;
  const spareArea = Math.max(0, sheetArea - unitArea);

  const lines = [];
  const spares = new Map();
  const uidCounter = { val: 1000 }; // запас UID для остатков (не пересекаются с Objective)

  const addSpare = (w, h) => {
    if (w > 0.5 && h > 0.5) {
      const key = `${fmt(w)}x${fmt(h)}`;
      const ex = spares.get(key);
      if (ex) ex.count++;
      else spares.set(key, { w, h, count: 1 });
    }
  };

  lines.push(
    `            <Layout ID="${id}" SheetID="0" Count="1" Cut="true"` +
    ` SheetName="${esc(sheet.material || "")}"` +
    ` X="${lW}" Y="${lH}"` +
    ` UnitArea="${fmt(unitArea)}" SheetArea="${lW * lH}" SpareArea="${fmt(spareArea)}">`
  );

  for (const strip of strips) {
    const stripPy = strip.y;
    const stripH  = strip.h;
    const pyAttr  = stripPy > 0.01 ? ` Py="${fmt(stripPy)}"` : "";

    lines.push(`              <Part X="${lW}" Y="${fmt(stripH)}"${pyAttr}>`);

    let maxRight = 0;
    for (const p of strip.pieces) {
      renderPiecePart(p, strip, pieceTypes, uidCounter, lines, "              ", kerf, addSpare);
      maxRight = Math.max(maxRight, p.nx + p.w);
    }

    // Остаток справа в полосе
    const sparePx = maxRight + kerf;
    const spareW  = lW - sparePx;
    if (spareW > 0.5) {
      const spPyAttr = stripPy > 0.01 ? ` Py="${fmt(stripPy)}"` : "";
      lines.push(
        `                <Part X="${fmt(spareW)}" Y="${fmt(stripH)}"` +
        ` Px="${fmt(sparePx)}"${spPyAttr} UID="${uidCounter.val++}" Spare="true"/>`
      );
      addSpare(spareW, stripH);
    }

    lines.push(`              </Part>`);
  }

  // Нижний остаток
  if (strips.length > 0) {
    const lastS = strips[strips.length - 1];
    const sparePy = lastS.y + lastS.h + kerf;
    const spareH  = lH - sparePy;
    if (spareH > 0.5) {
      lines.push(
        `              <Part X="${lW}" Y="${fmt(spareH)}"` +
        ` Py="${fmt(sparePy)}" UID="${uidCounter.val++}" Spare="true"/>`
      );
      addSpare(lW, spareH);
    }
  }

  lines.push(`            </Layout>`);

  return { xml: lines.join("\n"), spares };
}

// ─── UTF-16 LE encoder ────────────────────────────────────────────────────────

/**
 * Кодирует JS-строку в ArrayBuffer UTF-16 LE с BOM (0xFF 0xFE).
 * Именно такой формат используют оригинальные файлы AutoCUT.
 */
function encodeUTF16LE(str) {
  const buf  = new ArrayBuffer(2 + str.length * 2);
  const view = new DataView(buf);
  view.setUint8(0, 0xFF);
  view.setUint8(1, 0xFE);
  for (let i = 0; i < str.length; i++) {
    view.setUint16(2 + i * 2, str.charCodeAt(i), true);
  }
  return buf;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Генерирует строку AutoCUT XML для всего задания.
 *
 * @param {Array<{material, sheets, totalPieces, totalSheets}>} materialGroups
 * @param {string} jobName
 * @param {{sheetW, sheetH, kerf, marginX, marginY, allowRotate}} settings
 * @returns {string} XML (в кодировке UTF-16 потребует encodeUTF16LE)
 */
export function generateCUTFile(materialGroups, jobName, settings = {}) {
  const {
    sheetW      = 2800,
    sheetH      = 2070,
    kerf        = 4.8,
    marginX     = 20,
    marginY     = 20,
    allowRotate = false,
  } = settings;

  const st = { sheetW, sheetH, kerf, marginX, marginY };

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-16" standalone="yes"?>');
  lines.push('<AutoCUT xmlns="http://www.King-stone.com" ver="500">');
  lines.push(
    `  <Project Name="${esc(jobName)}" Source="" CutTime="0" CutStep="0"` +
    ` Selected="0" ApplictionVer="6.20.11.1" Update="0:00:00" DefaultLevel="0">`
  );

  let dbid = 1;

  for (const group of materialGroups) {
    const ply   = parsePly(group.material);
    const grain = allowRotate ? "false" : "true";
    const totalSheets = group.totalSheets || group.sheets.length;

    lines.push(
      `    <Data Class="3" TotalUnit="1000000" DBID="${dbid++}"` +
      ` Type="${esc(group.material)}" Ply="${ply}" Grain="${grain}">`
    );

    // ── Objective: список деталей (нужен AutoSAW для печати меток) ─────────
    const pieceTypes = collectPieceTypes(group);
    lines.push("      <Objective>");
    for (const { uid, label, w, h, count } of pieceTypes.values()) {
      lines.push(
        `        <Shape UID="${uid}" Name="${esc(label)}"` +
        ` X="${fmt(w)}" Y="${fmt(h)}" Turn="false" Count="${count}"/>`
      );
    }
    lines.push("      </Objective>");

    // ── Condition: листовой материал ────────────────────────────────────────
    // Sx=0, Sy=0: поля отступа уже вшиты в координаты деталей (piece.x, piece.y).
    // AutoSAW применяет собственную торцовку независимо от Sx/Sy в файле.
    lines.push(`      <Condition Type="Shape" Count="1">`);
    lines.push(
      `        <Shape Name="${esc(group.material)}" X="${sheetW}" Y="${sheetH}"` +
      ` Turn="false" Sx="0" Sy="0" Count="2147483647"/>`
    );
    lines.push("      </Condition>");

    // ── Solutions ───────────────────────────────────────────────────────────
    lines.push(`      <Solutions Selected="0">`);

    // Предварительный рендер всех листов (нужен для SumSpareArea и Spares)
    const layoutXmls = [];
    const allSpares  = new Map();
    let layoutId     = 0;

    for (const sheet of group.sheets) {
      const repCount = sheet.repeatCount || 1;
      for (let r = 0; r < repCount; r++) {
        const { xml, spares } = renderLayout(
          layoutId,
          { ...sheet, material: group.material },
          st,
          pieceTypes
        );
        layoutXmls.push(xml);
        for (const [key, val] of spares) {
          const ex = allSpares.get(key);
          if (ex) ex.count += val.count;
          else allSpares.set(key, { ...val });
        }
        layoutId++;
      }
    }

    let sumSpareArea = 0;
    for (const { w, h, count } of allSpares.values()) {
      sumSpareArea += w * h * count;
    }
    const sumSheetArea = totalSheets * sheetW * sheetH;
    // SheetCounts: "N," — общее число физических листов (как в оригинальных файлах AutoCUT)
    const totalPhysical = group.sheets.reduce((s, sh) => s + (sh.repeatCount || 1), 0);
    const sheetCounts = `${totalPhysical},`;

    lines.push(
      `        <Solution SolveGap="${kerf}" AlgCase="1" AlgNest="21"` +
      ` LevelSide="${marginX}" SolveRate="10"` +
      ` SheetCounts="${sheetCounts}"` +
      ` SumSheetArea="${sumSheetArea}" SumSpareArea="${fmt(sumSpareArea)}">`
    );
    lines.push("          <Layouts>");
    for (const xml of layoutXmls) lines.push(xml);
    lines.push("          </Layouts>");

    // ── Spares ──────────────────────────────────────────────────────────────
    const sparesArr = [...allSpares.values()];
    lines.push(`          <Spares Type="Shape" Count="${sparesArr.length}">`);
    for (const sp of sparesArr) {
      lines.push(
        `            <Shape Name="${fmt(sp.w)}x${fmt(sp.h)}"` +
        ` X="${fmt(sp.w)}" Y="${fmt(sp.h)}"` +
        ` Turn="false" Sx="5" Sy="5" Count="${sp.count}"/>`
      );
    }
    lines.push("          </Spares>");

    lines.push("        </Solution>");
    lines.push("      </Solutions>");
    lines.push("    </Data>");
  }

  lines.push("  </Project>");
  lines.push("  <Params>");
  lines.push("    <UserFields>");
  lines.push("      <Objective/>");
  lines.push("    </UserFields>");
  lines.push("  </Params>");
  lines.push("</AutoCUT>");

  return lines.join("\n");
}

/**
 * Скачивает .CUT файл в кодировке UTF-16 LE (как оригинальные AutoCUT файлы).
 */
export function downloadCUT(content, filename) {
  const buf  = encodeUTF16LE(content);
  const blob = new Blob([buf], { type: "application/octet-stream" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename.endsWith(".CUT") || filename.endsWith(".cut")
    ? filename
    : filename + ".CUT";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Генерирует и скачивает .CUT файл для всего задания.
 */
export function downloadAllCUT(materialGroups, jobName, settings = {}) {
  const content = generateCUTFile(materialGroups, jobName, settings);
  const safe    = jobName.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
  downloadCUT(content, safe);
}
