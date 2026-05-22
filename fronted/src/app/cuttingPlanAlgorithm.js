/**
 * Алгоритмы раскроя листового материала.
 *
 * Доступные алгоритмы (settings.algorithm):
 *
 *   "saw"       — Полосовой раскрой (для раскроечной пилы, как BAZIS).
 *               Каждый рез идёт от одного края куска до другого насквозь —
 *               как делает любой пильный центр или форматник.
 *               Детали раскладываются в чёткие горизонтальные полосы,
 *               раскрой читается слева направо, сверху вниз.
 *               Стратегия разбиения: Short-Axis Split — остаток
 *               делится вдоль более короткой стороны, что минимизирует
 *               количество мелких обрезков. Аналог алгоритма BAZIS-Раскрой.
 *
 *   "maxrects" — MaxRects BSSF: метод максимальных прямоугольников.
 *               Лучшее заполнение листа (70–85%), но произвольное
 *               расположение деталей — сложнее пилить вручную.
 *
 *   "greedy"  — Оптимизированный: жадное заполнение полок. На каждом шаге ищет
 *               любую оставшуюся деталь, которая вмещается на открытую полку.
 *
 *   "ffdh"    — Стандартный FFDH: классический First Fit Decreasing Height.
 *               Сортировка по высоте убыв., строгий порядок.
 *
 *   "grouped" — По группам: сначала все детали одного типа, затем следующего.
 *               Каждый тип занимает свои листы подряд — удобно для счёта на пиле.
 *               Наименее эффективен по материалу, но самый читаемый раскрой.
 */

// ─── helpers ────────────────────────────────────────────────────────────────

function fingerprint(pieces) {
  return pieces
    .map((p) => `${p.label}|${p.x}|${p.y}|${p.w}|${p.h}`)
    .sort()
    .join(";");
}

function groupIdentical(allSheets, sheetW, sheetH) {
  const grouped = [];
  const seen = new Map();
  for (const pieces of allSheets) {
    const fp = fingerprint(pieces);
    if (seen.has(fp)) {
      seen.get(fp).repeatCount++;
    } else {
      const entry = { pieces, sheetW, sheetH, repeatCount: 1 };
      seen.set(fp, entry);
      grouped.push(entry);
    }
  }
  return grouped;
}

// Low-level sheet packer — shared by all algorithms.
// Returns a helper object { flush, tryShelf, openShelf, canOpenShelf, currentPieces }.
function makeSheet(settings) {
  const { sheetW, sheetH, kerf, marginX, marginY } = settings;
  const innerW = sheetW - 2 * marginX;
  const innerH = sheetH - 2 * marginY;

  const allSheets = [];
  let currentPieces = [];
  let shelves = [];

  function usedHeight() {
    if (!shelves.length) return 0;
    const last = shelves[shelves.length - 1];
    return last.y + last.height;
  }

  function flush() {
    if (currentPieces.length > 0) allSheets.push([...currentPieces]);
    currentPieces = [];
    shelves = [];
  }

  function canOpenShelf(ph) {
    const uh = usedHeight();
    const gap = shelves.length === 0 ? 0 : kerf;
    const limit = shelves.length === 0 ? innerH : sheetH - marginY;
    return uh + gap + ph <= limit;
  }

  function fitsOnShelf(shelf, pw, ph) {
    const gap = shelf.usedW === 0 ? 0 : kerf;
    return shelf.usedW + gap + pw <= innerW && ph <= shelf.height;
  }

  function placePiece(si, pw, ph, label, rotated) {
    const shelf = shelves[si];
    const gap = shelf.usedW === 0 ? 0 : kerf;
    const x = marginX + shelf.usedW + gap;
    shelf.usedW += gap + pw;
    currentPieces.push({ label, x, y: shelf.y, w: pw, h: ph, rotated });
  }

  function openShelf(pw, ph, label, rotated) {
    const uh = usedHeight();
    const gap = shelves.length === 0 ? 0 : kerf;
    const y = shelves.length === 0 ? marginY : uh + gap;
    shelves.push({ y, height: ph, usedW: 0 });
    placePiece(shelves.length - 1, pw, ph, label, rotated);
  }

  return {
    allSheets,
    flush,
    canOpenShelf,
    fitsOnShelf: (si, pw, ph) => fitsOnShelf(shelves[si], pw, ph),
    shelfCount: () => shelves.length,
    shelves,
    openShelf,
    placePiece,
    currentPiecesRef: () => currentPieces,
  };
}

// ─── Algorithm 0: Полосовой (для раскроечной пилы) ──────────────────────────
//
// Воспроизводит логику форматно-раскроечного станка:
//   Шаг 1. Горизонтальный рез через весь лист → полоса заданной высоты.
//   Шаг 2. Полосу режем вертикальными резами на отдельные детали.
//   Шаг 3. Следующая полоса.
//
// Порядок размещения детали (приоритеты):
//   A. Существующая полоса точно такой же высоты.
//   B. Зазор в правом крае БОЛЕЕ ВЫСОКОЙ полосы (наибольший зазор первым).
//   C. ПОДПОЛОСА — пространство НИЖЕ деталей-заполнителей в существующих полосах.
//      Пример: полоса 359мм содержит 315×186 заполнители → под ними 168мм
//      свободного места (359-186-4.8), куда влезут 350×89, 315×111 и т.д.
//   D. Открыть новую полосу нужной высоты.
//   E. Отложить на следующий лист.

function packSaw(pieces, settings) {
  const { sheetW, sheetH, kerf, marginX, marginY, allowRotate } = settings;
  const innerW = sheetW - 2 * marginX;
  const innerH = sheetH - 2 * marginY;

  // Group by exact height, sort groups descending, within group sort width desc
  const byHeight = new Map();
  for (const p of pieces) {
    if (!byHeight.has(p.h)) byHeight.set(p.h, []);
    byHeight.get(p.h).push(p);
  }
  const sortedHeights = [...byHeight.keys()].sort((a, b) => b - a);
  const ordered = sortedHeights.flatMap(h =>
    byHeight.get(h).slice().sort((a, b) => b.w - a.w)
  );

  const allSheets = [];
  let remaining = [...ordered];

  while (remaining.length > 0) {
    // shelf: { y, height, usedW, gapStartW, gapMaxH }
    //   gapStartW: usedW value when first gap-fill piece was placed (-1 if none)
    //   gapMaxH:   max height of gap-fill pieces in this strip (for sub-strip calc)
    const shelves = [];
    const sheetPieces = [];
    const usedIdx = new Set();

    function usedH() {
      if (!shelves.length) return 0;
      const s = shelves[shelves.length - 1];
      return s.y + s.height;
    }
    function canOpenShelf(ph) {
      const uh = usedH();
      const gap = shelves.length === 0 ? 0 : kerf;
      return uh + gap + ph <= innerH;
    }

    // Place piece (pw×ph) on a shelf starting at the current usedW.
    // Returns true and records the piece if it fits; false otherwise.
    function placeOnShelf(shelf, p, i, pw, ph, rotated) {
      const gap = shelf.usedW === 0 ? 0 : kerf;
      if (shelf.usedW + gap + pw > innerW) return false;
      const x = marginX + shelf.usedW + gap;

      // Track gap-fill state (piece shorter than the strip's full height)
      if (ph < shelf.height) {
        if (shelf.gapStartW < 0) shelf.gapStartW = shelf.usedW; // record start of gap section
        shelf.gapMaxH = Math.max(shelf.gapMaxH, ph);
      }

      shelf.usedW += gap + pw;
      sheetPieces.push({ label: p.label, x, y: marginY + shelf.y, w: pw, h: ph, rotated: !!rotated });
      usedIdx.add(i);
      return true;
    }

    // Try placing p on shelf in either orientation (respecting strip height).
    // The piece must be STRICTLY shorter than the strip (gap-fill semantics).
    function tryGapFill(shelf, p, i) {
      if (p.h < shelf.height && placeOnShelf(shelf, p, i, p.w, p.h, false)) return true;
      if (allowRotate && p.w !== p.h && p.w < shelf.height &&
          placeOnShelf(shelf, p, i, p.h, p.w, true)) return true;
      return false;
    }

    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];

      // ── A. Existing same-height strip ─────────────────────────────────
      let placed = false;
      for (const shelf of shelves) {
        if (shelf.height !== p.h) continue;
        if (placeOnShelf(shelf, p, i, p.w, p.h, false)) { placed = true; break; }
        // Same-height rotated (w×h → h×w must still equal strip height)
        if (allowRotate && p.w !== p.h && p.w === shelf.height &&
            placeOnShelf(shelf, p, i, p.h, p.w, true)) { placed = true; break; }
      }
      if (placed) continue;

      // ── B. Right-edge gap of a taller strip (largest gap first) ───────
      {
        const byFreeWidth = shelves
          .filter(s => p.h < s.height || (allowRotate && p.w < s.height && p.w !== p.h))
          .sort((a, b) => (innerW - b.usedW) - (innerW - a.usedW));
        for (const shelf of byFreeWidth) {
          if (tryGapFill(shelf, p, i)) { placed = true; break; }
        }
      }
      if (placed) continue;

      // ── C. Open new strip ──────────────────────────────────────────────
      if (canOpenShelf(p.h)) {
        const uh = usedH();
        const gap = shelves.length === 0 ? 0 : kerf;
        const shelfY = shelves.length === 0 ? 0 : uh + gap;
        const shelf = { y: shelfY, height: p.h, usedW: p.w, gapStartW: -1, gapMaxH: 0 };
        shelves.push(shelf);
        sheetPieces.push({ label: p.label, x: marginX, y: marginY + shelfY, w: p.w, h: p.h, rotated: false });
        usedIdx.add(i);
        continue;
      }
      // Try with rotated piece for opening
      if (allowRotate && p.w !== p.h && canOpenShelf(p.w)) {
        const uh = usedH();
        const gap = shelves.length === 0 ? 0 : kerf;
        const shelfY = shelves.length === 0 ? 0 : uh + gap;
        const shelf = { y: shelfY, height: p.w, usedW: p.h, gapStartW: -1, gapMaxH: 0 };
        shelves.push(shelf);
        sheetPieces.push({ label: p.label, x: marginX, y: marginY + shelfY, w: p.h, h: p.w, rotated: true });
        usedIdx.add(i);
      }
      // ── E. Defer to next sheet ─────────────────────────────────────────
    }

    // ── C (pass 2). Sub-strip fill ─────────────────────────────────────────
    // For each strip that has gap-fill pieces, compute the space BELOW them:
    //   sub-strip y     = strip.y + gapMaxH + kerf
    //   sub-strip height = strip.height - gapMaxH - kerf
    //   sub-strip x     = marginX + gapStartW   (start of gap section)
    //   sub-strip width  = innerW - gapStartW
    // Try to fit deferred pieces into these sub-strips.
    const subStrips = shelves
      .filter(s => s.gapStartW >= 0 && s.height - s.gapMaxH - kerf > 0)
      .map(s => ({
        xStart: s.gapStartW,
        y: s.y + s.gapMaxH + kerf,
        height: s.height - s.gapMaxH - kerf,
        usedW: 0,                   // own left-to-right usage within sub-strip
        maxW: innerW - s.gapStartW,
      }));

    if (subStrips.length > 0) {
      for (let i = 0; i < remaining.length; i++) {
        if (usedIdx.has(i)) continue;
        const p = remaining[i];

        const candidates = subStrips
          .filter(ss => (p.h <= ss.height || (allowRotate && p.w <= ss.height && p.w !== p.h)))
          .sort((a, b) => (b.maxW - b.usedW) - (a.maxW - a.usedW));

        for (const ss of candidates) {
          const gap = ss.usedW === 0 ? 0 : kerf;
          const free = ss.maxW - ss.usedW - gap;

          if (p.h <= ss.height && p.w <= free) {
            const x = marginX + ss.xStart + ss.usedW + gap;
            ss.usedW += gap + p.w;
            sheetPieces.push({ label: p.label, x, y: marginY + ss.y, w: p.w, h: p.h, rotated: false });
            usedIdx.add(i);
            break;
          }
          if (allowRotate && p.w !== p.h && p.w <= ss.height && p.h <= free) {
            const x = marginX + ss.xStart + ss.usedW + gap;
            ss.usedW += gap + p.h;
            sheetPieces.push({ label: p.label, x, y: marginY + ss.y, w: p.h, h: p.w, rotated: true });
            usedIdx.add(i);
            break;
          }
        }
      }
    }

    const deferred = remaining.filter((_, i) => !usedIdx.has(i));

    if (sheetPieces.length > 0) {
      allSheets.push(sheetPieces);
    } else if (deferred.length > 0) {
      const p = deferred[0];
      allSheets.push([{ label: p.label, x: marginX, y: marginY, w: p.w, h: p.h, rotated: false }]);
      remaining = deferred.slice(1);
      continue;
    }
    remaining = deferred;
  }

  return groupIdentical(allSheets, settings.sheetW, settings.sheetH);
}

// ─── Algorithm 0: MaxRects BSSF ─────────────────────────────────────────────
//
// Port of Python rectpack.MaxRectsBssf to JS.
//
// Idea:
//   Keep a list of all "maximal free rectangles" on the current sheet.
//   For each piece (area-desc sorted), find the free rect where placing the
//   piece minimises the shorter leftover side (Best Short Side Fit score).
//   After placement, split every free rect that overlaps the newly-occupied
//   zone into up to 4 strips, then prune free rects that are fully contained
//   inside another (they are redundant).
//
// Each piece is padded by `kerf` on its right and bottom edge so that
// adjacent pieces always have exactly `kerf` mm between them.
// The padding is applied symmetrically (halfK = kerf/2) so the piece is
// drawn centred in its padded slot.
//
// Multi-pass per sheet: we go through all remaining pieces in area-desc order
// and place every piece that fits — so small pieces fill the gaps left by
// large ones on the same sheet, rather than being deferred to the next sheet.

function _mrRectsOverlap(r1, r2) {
  return !(
    r1.x + r1.w <= r2.x || r2.x + r2.w <= r1.x ||
    r1.y + r1.h <= r2.y || r2.y + r2.h <= r1.y
  );
}

function _mrSplitFreeRect(freeRect, placed) {
  // Generate up to 4 maximal-rectangle strips around `placed` inside `freeRect`.
  // Intentionally creates overlapping strips — they are deduplicated by prune.
  const result = [];
  const fr = freeRect;
  const pl = placed;

  // Left strip
  if (pl.x > fr.x) {
    result.push({ x: fr.x, y: fr.y, w: pl.x - fr.x, h: fr.h });
  }
  // Right strip
  if (pl.x + pl.w < fr.x + fr.w) {
    result.push({ x: pl.x + pl.w, y: fr.y, w: fr.x + fr.w - pl.x - pl.w, h: fr.h });
  }
  // Top strip (lower y = higher on screen)
  if (pl.y > fr.y) {
    result.push({ x: fr.x, y: fr.y, w: fr.w, h: pl.y - fr.y });
  }
  // Bottom strip
  if (pl.y + pl.h < fr.y + fr.h) {
    result.push({ x: fr.x, y: pl.y + pl.h, w: fr.w, h: fr.y + fr.h - pl.y - pl.h });
  }

  return result;
}

function _mrPrune(freeRects) {
  // Remove any free rect that is fully contained in another.
  const keep = [];
  outer: for (let i = 0; i < freeRects.length; i++) {
    const a = freeRects[i];
    for (let j = 0; j < freeRects.length; j++) {
      if (i === j) continue;
      const b = freeRects[j];
      if (
        a.x >= b.x && a.y >= b.y &&
        a.x + a.w <= b.x + b.w &&
        a.y + a.h <= b.y + b.h
      ) {
        continue outer; // a is contained in b — discard a
      }
    }
    keep.push(a);
  }
  freeRects.length = 0;
  freeRects.push(...keep);
}

function _mrFindBest(freeRects, w, h, kerf, allowRotate) {
  // Returns { fi, rotated } for the free rect index with the best BSSF score,
  // or { fi: -1 } if no rect can accommodate the piece.
  const pw = w + kerf;
  const ph = h + kerf;
  let bestScore = Infinity;
  let bestFi = -1;
  let bestRotated = false;

  for (let fi = 0; fi < freeRects.length; fi++) {
    const fr = freeRects[fi];
    if (pw <= fr.w && ph <= fr.h) {
      const score = Math.min(fr.w - pw, fr.h - ph);
      if (score < bestScore) { bestScore = score; bestFi = fi; bestRotated = false; }
    }
    if (allowRotate && w !== h) {
      const pwR = h + kerf;
      const phR = w + kerf;
      if (pwR <= fr.w && phR <= fr.h) {
        const score = Math.min(fr.w - pwR, fr.h - phR);
        if (score < bestScore) { bestScore = score; bestFi = fi; bestRotated = true; }
      }
    }
  }
  return { fi: bestFi, rotated: bestRotated };
}

function packMaxRects(pieces, settings) {
  const { sheetW, sheetH, kerf, marginX, marginY, allowRotate } = settings;
  const innerW = sheetW - 2 * marginX;
  const innerH = sheetH - 2 * marginY;
  const halfK = kerf / 2;

  const allSheets = [];
  // Sort by area desc — largest pieces first
  let remaining = [...pieces].sort((a, b) => b.w * b.h - a.w * a.h);

  while (remaining.length > 0) {
    const freeRects = [{ x: 0, y: 0, w: innerW, h: innerH }];
    const sheetPieces = [];
    const deferred = [];

    // Single pass over remaining (largest first).
    // Every piece that fits somewhere on this sheet is placed; others deferred.
    for (const p of remaining) {
      const { fi, rotated } = _mrFindBest(freeRects, p.w, p.h, kerf, allowRotate);
      if (fi === -1) {
        deferred.push(p);
        continue;
      }

      const fr = freeRects[fi];
      const actualW = rotated ? p.h : p.w;
      const actualH = rotated ? p.w : p.h;
      const slotW = actualW + kerf;
      const slotH = actualH + kerf;

      // Record placed piece (convert from inner coords to real sheet coords)
      sheetPieces.push({
        label: p.label,
        x: marginX + fr.x + halfK,
        y: marginY + fr.y + halfK,
        w: actualW,
        h: actualH,
        rotated,
      });

      // Update free rects: split all rects that overlap the occupied slot
      const slot = { x: fr.x, y: fr.y, w: slotW, h: slotH };
      const next = [];
      for (const r of freeRects) {
        if (_mrRectsOverlap(r, slot)) {
          next.push(..._mrSplitFreeRect(r, slot));
        } else {
          next.push(r);
        }
      }
      freeRects.length = 0;
      freeRects.push(...next);
      _mrPrune(freeRects);
    }

    if (sheetPieces.length > 0) {
      allSheets.push(sheetPieces);
    } else if (deferred.length > 0) {
      // Safety: a piece is larger than the entire inner area — place it alone
      const p = deferred.shift();
      allSheets.push([{
        label: p.label,
        x: marginX + halfK,
        y: marginY + halfK,
        w: p.w, h: p.h, rotated: false,
      }]);
    }

    remaining = deferred;
  }

  return groupIdentical(allSheets, settings.sheetW, settings.sheetH);
}

// ─── Algorithm 1: Оптимизированный (greedy gap-fill) ────────────────────────
// Scans all remaining pieces for every shelf opening.

function packGreedy(pieces, settings) {
  const { kerf, marginX, marginY, sheetW, sheetH, allowRotate } = settings;
  const innerW = sheetW - 2 * marginX;
  const innerH = sheetH - 2 * marginY;

  const allSheets = [];
  let currentPieces = [];
  let shelves = [];

  function usedHeight() {
    if (!shelves.length) return 0;
    const last = shelves[shelves.length - 1];
    return last.y + last.height;
  }
  function flush() {
    if (currentPieces.length) allSheets.push([...currentPieces]);
    currentPieces = [];
    shelves = [];
  }
  function canOpenShelf(ph) {
    const uh = usedHeight();
    const gap = shelves.length === 0 ? 0 : kerf;
    const limit = shelves.length === 0 ? innerH : sheetH - marginY;
    return uh + gap + ph <= limit;
  }
  function fitsOnShelf(shelf, pw, ph) {
    const gap = shelf.usedW === 0 ? 0 : kerf;
    return shelf.usedW + gap + pw <= innerW && ph <= shelf.height;
  }
  function placePiece(si, pw, ph, label, rotated) {
    const shelf = shelves[si];
    const gap = shelf.usedW === 0 ? 0 : kerf;
    const x = marginX + shelf.usedW + gap;
    shelf.usedW += gap + pw;
    currentPieces.push({ label, x, y: shelf.y, w: pw, h: ph, rotated });
  }
  function openShelf(pw, ph, label, rotated) {
    const uh = usedHeight();
    const gap = shelves.length === 0 ? 0 : kerf;
    const y = shelves.length === 0 ? marginY : uh + gap;
    shelves.push({ y, height: ph, usedW: 0 });
    placePiece(shelves.length - 1, pw, ph, label, rotated);
  }
  function orient(shelf, pw, ph) {
    if (!allowRotate || pw === ph) return { pw, ph, rotated: false };
    if (fitsOnShelf(shelf, pw, ph)) return { pw, ph, rotated: false };
    if (fitsOnShelf(shelf, ph, pw)) return { pw: ph, ph: pw, rotated: true };
    return { pw, ph, rotated: false };
  }
  function orientOpen(pw, ph) {
    if (!allowRotate || pw === ph) return { pw, ph, rotated: false };
    if (canOpenShelf(ph)) return { pw, ph, rotated: false };
    if (canOpenShelf(pw)) return { pw: ph, ph: pw, rotated: true };
    return { pw, ph, rotated: false };
  }

  // Sort: height desc, width desc
  const remaining = [...pieces].sort((a, b) => b.h - a.h || b.w - a.w);

  while (remaining.length > 0) {
    let placed = false;

    // Try any remaining piece on any existing shelf (largest first)
    for (let si = 0; si < shelves.length && !placed; si++) {
      for (let ri = 0; ri < remaining.length; ri++) {
        const p = remaining[ri];
        const { pw, ph, rotated } = orient(shelves[si], p.w, p.h);
        if (fitsOnShelf(shelves[si], pw, ph)) {
          placePiece(si, pw, ph, p.label, rotated);
          remaining.splice(ri, 1);
          placed = true;
          break;
        }
      }
    }

    if (placed) continue;

    // Open new shelf with the largest remaining piece
    const p = remaining[0];
    const { pw, ph, rotated } = orientOpen(p.w, p.h);

    if (canOpenShelf(ph)) {
      openShelf(pw, ph, p.label, rotated);
    } else {
      flush();
      const { pw: pw2, ph: ph2, rotated: r2 } = orientOpen(p.w, p.h);
      if (canOpenShelf(ph2)) {
        openShelf(pw2, ph2, p.label, r2);
      } else {
        shelves = [{ y: marginY, height: ph2, usedW: 0 }];
        currentPieces.push({ label: p.label, x: marginX, y: marginY, w: pw2, h: ph2, rotated: r2 });
      }
    }
    remaining.shift();
  }

  if (currentPieces.length) allSheets.push([...currentPieces]);
  return groupIdentical(allSheets, settings.sheetW, settings.sheetH);
}

// ─── Algorithm 2: Стандартный FFDH ──────────────────────────────────────────
// Classic First Fit Decreasing Height — strict sorted order.

function packFFDH(pieces, settings) {
  const { sheetW, sheetH, kerf, marginX, marginY, allowRotate } = settings;
  const innerW = sheetW - 2 * marginX;
  const innerH = sheetH - 2 * marginY;

  const allSheets = [];
  let currentPieces = [];
  let shelves = [];

  function usedHeight() {
    if (!shelves.length) return 0;
    const last = shelves[shelves.length - 1];
    return last.y + last.height;
  }
  function flush() {
    if (currentPieces.length) allSheets.push([...currentPieces]);
    currentPieces = [];
    shelves = [];
  }
  function canOpenShelf(ph) {
    const uh = usedHeight();
    const gap = shelves.length === 0 ? 0 : kerf;
    const limit = shelves.length === 0 ? innerH : sheetH - marginY;
    return uh + gap + ph <= limit;
  }
  function tryOnShelf(pw, ph) {
    for (let si = 0; si < shelves.length; si++) {
      const shelf = shelves[si];
      const gap = shelf.usedW === 0 ? 0 : kerf;
      if (shelf.usedW + gap + pw <= innerW && ph <= shelf.height) {
        return si;
      }
    }
    return -1;
  }
  function place(si, pw, ph, label, rotated) {
    const shelf = shelves[si];
    const gap = shelf.usedW === 0 ? 0 : kerf;
    const x = marginX + shelf.usedW + gap;
    shelf.usedW += gap + pw;
    currentPieces.push({ label, x, y: shelf.y, w: pw, h: ph, rotated });
  }
  function openShelf(pw, ph, label, rotated) {
    const uh = usedHeight();
    const gap = shelves.length === 0 ? 0 : kerf;
    const y = shelves.length === 0 ? marginY : uh + gap;
    shelves.push({ y, height: ph, usedW: 0 });
    place(shelves.length - 1, pw, ph, label, rotated);
  }

  const sorted = [...pieces].sort((a, b) => b.h - a.h);

  for (const { label, w, h } of sorted) {
    let pw = w, ph = h, rotated = false;
    if (allowRotate && w !== h) {
      const ni = tryOnShelf(w, h);
      const ri = tryOnShelf(h, w);
      if (ni === -1 && ri >= 0) { pw = h; ph = w; rotated = true; }
    }

    let si = tryOnShelf(pw, ph);
    if (si >= 0) { place(si, pw, ph, label, rotated); continue; }

    if (canOpenShelf(ph)) { openShelf(pw, ph, label, rotated); continue; }

    flush();
    si = tryOnShelf(pw, ph);
    if (si >= 0) { place(si, pw, ph, label, rotated); continue; }
    if (canOpenShelf(ph)) { openShelf(pw, ph, label, rotated); continue; }
    // Oversized
    shelves = [{ y: marginY, height: ph, usedW: 0 }];
    currentPieces.push({ label, x: marginX, y: marginY, w: pw, h: ph, rotated });
  }

  if (currentPieces.length) allSheets.push([...currentPieces]);
  return groupIdentical(allSheets, sheetW, sheetH);
}

// ─── Algorithm 3: По группам ─────────────────────────────────────────────────
// Groups pieces by label, sorts groups by area desc.
// Each group is packed sequentially — all same-type pieces stay together.

function packGrouped(pieces, settings) {
  // Split into per-label groups, sort groups by area desc
  const groups = new Map();
  for (const p of pieces) {
    if (!groups.has(p.label)) groups.set(p.label, []);
    groups.get(p.label).push(p);
  }
  const sortedGroups = [...groups.values()].sort((a, b) => {
    const areaA = a[0].w * a[0].h;
    const areaB = b[0].w * b[0].h;
    return areaB - areaA;
  });

  // Concatenate groups into a single ordered list, then run FFDH
  const ordered = sortedGroups.flat();
  return packFFDH(ordered, settings);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const CUTTING_ALGORITHMS = [
  { id: "saw",      label: "Пила 🪚 (полосы)",   hint: "Одинаковые высоты в одной полосе — точно как BAZIS. Первый рез горизонтальный, потом вертикальные. Рекомендуется для раскроечной пилы" },
  { id: "maxrects", label: "MaxRects BSSF ✦",    hint: "Максимальное заполнение листа. Детали в любом месте — эффективнее, но резы не полосками (хорошо для ЧПУ/лазера)" },
  { id: "greedy",   label: "Оптимизированный",   hint: "Жадное заполнение полок с поиском подходящих деталей в зазоры" },
  { id: "ffdh",     label: "Стандартный FFDH",   hint: "Сортировка по высоте убыв., строгий порядок" },
  { id: "grouped",  label: "По группам",          hint: "Каждый тип деталей на своих листах — удобно считать" },
];

/**
 * @param {Array<{itemName:string, w:number, h:number, qty:number, material:string}>} items
 * @param {{sheetW,sheetH,kerf,marginX,marginY,allowRotate,algorithm}} settings
 */
export function buildCuttingPlan(items, settings) {
  const {
    sheetW = 2800,
    sheetH = 2070,
    kerf = 4.8,
    marginX = 20,
    marginY = 20,
    allowRotate = false,
    algorithm = "saw",
  } = settings || {};

  const safe = { sheetW, sheetH, kerf, marginX, marginY, allowRotate, algorithm };

  const packer =
    algorithm === "saw"      ? packSaw :
    algorithm === "maxrects" ? packMaxRects :
    algorithm === "ffdh"     ? packFFDH :
    algorithm === "grouped"  ? packGrouped :
    algorithm === "greedy"   ? packGreedy :
    packSaw;

  const byMaterial = new Map();
  for (const item of items) {
    const qty = Math.max(1, item.qty || 1);
    const mat = item.material || "—";
    if (!byMaterial.has(mat)) byMaterial.set(mat, []);
    const group = byMaterial.get(mat);
    for (let i = 0; i < qty; i++) {
      group.push({ label: item.itemName, w: item.w, h: item.h });
    }
  }

  const result = [];
  for (const [material, pieces] of byMaterial.entries()) {
    const sheets = packer(pieces, safe);
    const totalPieces = pieces.length;
    const totalSheets = sheets.reduce((s, sh) => s + sh.repeatCount, 0);
    result.push({ material, sheets, totalPieces, totalSheets });
  }
  return result;
}

/** @deprecated */
export function buildCuttingPlanFromSelection(items, settings) {
  return buildCuttingPlan(items, settings);
}
