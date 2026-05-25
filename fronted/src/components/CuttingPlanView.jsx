import { useMemo, useState, useRef, useCallback, useEffect, useId } from "react";
import { downloadAllDXF } from "../app/dxfExport";
import { downloadAllCUT } from "../app/cutExport";
import { downloadAllNXCut } from "../app/nxcutExport";
import { formatCuttingDim, roundCuttingDim } from "../app/cuttingCatalogHelpers";

const DISPLAY_W = 560;
const PALETTE = [
  "#b3d9ff", "#ffd9b3", "#b3ffcc", "#e8b3ff",
  "#fff0b3", "#b3f0ff", "#ffb3d9", "#c8ffb3",
  "#ffc8b3", "#b3c8ff",
];

function colorForLabel(label, colorMap) {
  if (colorMap.has(label)) return colorMap.get(label);
  const idx = colorMap.size % PALETTE.length;
  colorMap.set(label, PALETTE[idx]);
  return PALETTE[idx];
}

function calcEfficiency(pieces, sheetW, sheetH) {
  const area = sheetW * sheetH;
  if (!area) return 0;
  const used = pieces.reduce((s, p) => s + p.w * p.h, 0);
  return Math.round((used / area) * 100);
}

function truncateLabel(text, maxWidthPx, fontSize) {
  if (!text || maxWidthPx <= 4) return "";
  const maxChars = Math.max(0, Math.floor(maxWidthPx / (fontSize * 0.52)));
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  if (maxChars === 1) return "…";
  return `${text.slice(0, maxChars - 1)}…`;
}

function pieceFitsAt(pieces, idx, x, y, w, h, settings, sheetW, sheetH) {
  const kerf = settings?.kerf ?? 4.8;
  const marginX = settings?.marginX ?? 20;
  const marginY = settings?.marginY ?? 20;
  const px = roundMm(x);
  const py = roundMm(y);
  if (px < marginX || py < marginY) return false;
  if (px + w > sheetW - marginX || py + h > sheetH - marginY) return false;
  return pieces.every((other, i) => {
    if (i === idx) return true;
    const ox = roundMm(other.x);
    const oy = roundMm(other.y);
    return (
      px + w + kerf <= ox || ox + other.w + kerf <= px ||
      py + h + kerf <= oy || oy + other.h + kerf <= py
    );
  });
}

function tryRotatePiece(piece, pieces, idx, settings, sheetW, sheetH) {
  const nw = piece.h;
  const nh = piece.w;
  const nr = !piece.rotated;
  if (pieceFitsAt(pieces, idx, piece.x, piece.y, nw, nh, settings, sheetW, sheetH)) {
    return { w: nw, h: nh, rotated: nr };
  }
  return null;
}

function tryResizePiece(piece, pieces, idx, nw, nh, settings, sheetW, sheetH) {
  const w = Math.max(0.5, roundCuttingDim(nw) || piece.w);
  const h = Math.max(0.5, roundCuttingDim(nh) || piece.h);
  if (pieceFitsAt(pieces, idx, piece.x, piece.y, w, h, settings, sheetW, sheetH)) {
    return { w, h };
  }
  return null;
}

const SNAP_X_MM = 400;
const SNAP_Y_MM = 400;
const EDGE_SNAP_MM = 20;

function roundMm(v) {
  return Math.round(Number(v) || 0);
}

function formatPieceSize(w, h, rotated = false) {
  return rotated
    ? `${formatCuttingDim(h)}×${formatCuttingDim(w)}`
    : `${formatCuttingDim(w)}×${formatCuttingDim(h)}`;
}

/** Сетка X/Y из координат всех деталей на листе. */
function buildSnapGrid(pieces, idx, w, h, kerf, marginX, marginY) {
  const xs = new Set([roundMm(marginX)]);
  const ys = new Set([roundMm(marginY)]);

  for (let i = 0; i < pieces.length; i++) {
    if (i === idx) continue;
    const o = pieces[i];
    const ox = roundMm(o.x);
    const oy = roundMm(o.y);
    xs.add(ox);
    ys.add(oy);
    xs.add(roundMm(ox + o.w + kerf));
    ys.add(roundMm(oy + o.h + kerf));
    xs.add(roundMm(ox - w - kerf));
    ys.add(roundMm(oy - h - kerf));
  }

  return {
    xs: [...xs].sort((a, b) => a - b),
    ys: [...ys].sort((a, b) => a - b),
  };
}

/** Привязка к ближайшим координатам сетки (X и Y от существующих деталей). */
function collectSnapCandidates(pieces, idx, rawX, rawY, settings, sheetW, sheetH) {
  const piece = pieces[idx];
  const kerf = settings?.kerf ?? 4.8;
  const marginX = settings?.marginX ?? 20;
  const marginY = settings?.marginY ?? 20;
  const { xs, ys } = buildSnapGrid(pieces, idx, piece.w, piece.h, kerf, marginX, marginY);
  const candidates = [];
  const rx = roundMm(rawX);
  const ry = roundMm(rawY);

  for (const x of xs) {
    for (const y of ys) {
      const dx = Math.abs(rx - x);
      const dy = Math.abs(ry - y);
      if (dx > SNAP_X_MM || dy > SNAP_Y_MM) continue;
      candidates.push({
        x,
        y,
        guideX: x,
        guideY: y,
        priority: 0,
        score: dx + dy * 2,
      });
    }
  }

  for (const y of ys) {
    const dy = Math.abs(ry - y);
    if (dy > SNAP_Y_MM) continue;
    candidates.push({
      x: rx,
      y,
      guideX: null,
      guideY: y,
      priority: 1,
      score: dy + 50,
    });
  }

  for (const x of xs) {
    const dx = Math.abs(rx - x);
    if (dx > SNAP_X_MM) continue;
    candidates.push({
      x,
      y: ry,
      guideX: x,
      guideY: null,
      priority: 1,
      score: dx + 50,
    });
  }

  candidates.push({
    x: roundMm(marginX),
    y: roundMm(marginY),
    guideX: roundMm(marginX),
    guideY: roundMm(marginY),
    priority: 9,
    score: Math.abs(rx - marginX) + Math.abs(ry - marginY),
  });

  candidates.sort((a, b) => a.priority - b.priority || a.score - b.score);
  return candidates;
}

function normalizeSheetPieces(sheet) {
  if (!sheet?.pieces) return;
  for (const p of sheet.pieces) {
    p.x = roundMm(p.x);
    p.y = roundMm(p.y);
    p.w = roundCuttingDim(p.w);
    p.h = roundCuttingDim(p.h);
  }
}

function normalizePlanPieces(plan) {
  if (!plan?.materialGroups) return plan;
  for (const group of plan.materialGroups) {
    for (const sheet of group.sheets) {
      normalizeSheetPieces(sheet);
    }
  }
  return plan;
}

function RemainderZone({ displayX, displayY, displayW, displayH, label, hatchId }) {
  if (displayW < 4 || displayH < 4) return null;
  const cx = displayX + displayW / 2;
  const cy = displayY + displayH / 2;
  const fs = Math.min(10, Math.max(7, Math.min(displayW, displayH) * 0.22));
  const showLabel = displayW > 30 && displayH > 12;
  return (
    <g className="cutting-plan__remainder">
      <rect
        x={displayX} y={displayY}
        width={displayW} height={displayH}
        className="cutting-plan__remainder-rect"
        fill={`url(#${hatchId})`}
      />
      {showLabel && (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          fontSize={fs} className="cutting-plan__remainder-label">
          {label}
        </text>
      )}
    </g>
  );
}

// ─── Piece editor panel ───────────────────────────────────────────────────────

function PieceEditor({ piece, settings, sheetW, sheetH, pieces, pieceIdx, onUpdate, onClose }) {
  const [draftW, setDraftW] = useState(String(piece.w));
  const [draftH, setDraftH] = useState(String(piece.h));
  const [draftX, setDraftX] = useState(String(roundMm(piece.x)));
  const [draftY, setDraftY] = useState(String(roundMm(piece.y)));
  const [error, setError] = useState("");

  useEffect(() => {
    setDraftW(String(piece.w));
    setDraftH(String(piece.h));
    setDraftX(String(roundMm(piece.x)));
    setDraftY(String(roundMm(piece.y)));
    setError("");
  }, [piece.w, piece.h, piece.x, piece.y]);

  const applyPatch = (patch) => {
    onUpdate(patch);
    setError("");
  };

  const handleRotate = () => {
    const patch = tryRotatePiece(piece, pieces, pieceIdx, settings, sheetW, sheetH);
    if (patch) applyPatch(patch);
    else setError("Поворот невозможен — не помещается");
  };

  const handleApplySize = () => {
    const patch = tryResizePiece(piece, pieces, pieceIdx, draftW, draftH, settings, sheetW, sheetH);
    if (patch) applyPatch(patch);
    else setError("Такой размер не помещается");
  };

  const handleApplyPosition = () => {
    const x = roundMm(draftX);
    const y = roundMm(draftY);
    if (!pieceFitsAt(pieces, pieceIdx, x, y, piece.w, piece.h, settings, sheetW, sheetH)) {
      setError("Позиция занята или выходит за поле");
      return;
    }
    applyPatch({ x, y });
  };

  const sizeLabel = formatPieceSize(piece.w, piece.h, piece.rotated);

  return (
    <div className="cutting-plan__piece-editor no-print">
      <div className="cutting-plan__piece-editor-head">
        <div>
          <div className="cutting-plan__piece-editor-title">Выбрана деталь</div>
          <div className="cutting-plan__piece-editor-name" title={piece.label}>{piece.label}</div>
          <div className="cutting-plan__piece-editor-meta">
            {sizeLabel} мм · x={roundMm(piece.x)}, y={roundMm(piece.y)}
            {piece.rotated ? " · ↺" : ""}
          </div>
        </div>
        <button type="button" className="cutting-plan__piece-editor-close" onClick={onClose} title="Снять выделение">✕</button>
      </div>

      <div className="cutting-plan__piece-editor-actions">
        <button type="button" className="mini" onClick={handleRotate} title="Повернуть на 90°">↺ Повернуть</button>
      </div>

      <div className="cutting-plan__piece-editor-size">
        <label className="cutting-plan__piece-editor-field">
          <span>X, мм</span>
          <input type="number" min="0" value={draftX} onChange={(e) => setDraftX(e.target.value)} />
        </label>
        <label className="cutting-plan__piece-editor-field">
          <span>Y, мм</span>
          <input type="number" min="0" value={draftY} onChange={(e) => setDraftY(e.target.value)} />
        </label>
        <button type="button" className="mini accent" onClick={handleApplyPosition}>Позиция</button>
      </div>

      <div className="cutting-plan__piece-editor-size">
        <label className="cutting-plan__piece-editor-field">
          <span>Ш, мм</span>
          <input type="number" min="0.5" step="0.5" value={draftW} onChange={(e) => setDraftW(e.target.value)} />
        </label>
        <label className="cutting-plan__piece-editor-field">
          <span>В, мм</span>
          <input type="number" min="0.5" step="0.5" value={draftH} onChange={(e) => setDraftH(e.target.value)} />
        </label>
        <button type="button" className="mini accent" onClick={handleApplySize}>Размер</button>
      </div>

      {error ? <div className="cutting-plan__piece-editor-error">{error}</div> : null}
      <div className="cutting-plan__piece-editor-hint">При перетаскивании X/Y привязываются к координатам других деталей</div>
    </div>
  );
}

// ─── SheetDiagram with drag-and-drop ─────────────────────────────────────────

function SheetDiagram({
  pieces,
  sheetW,
  sheetH,
  colorMap,
  settings,
  selectedIdx,
  onSelectPiece,
  onMovePiece,
}) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);  // holds drag state without triggering re-render on each move
  const [drag, setDrag] = useState(null);
  const diagramId = useId().replace(/:/g, "");
  const hatchId = `hatch-${diagramId}`;

  const displayH = Math.round((sheetH / sheetW) * DISPLAY_W);
  const scaleX = DISPLAY_W / sheetW;
  const scaleY = displayH / sheetH;

  const kerf    = settings?.kerf    ?? 4.8;
  const marginX = settings?.marginX ?? 20;
  const marginY = settings?.marginY ?? 20;

  // Convert client mouse position → SVG viewBox coordinates
  const clientToSvg = useCallback((clientX, clientY) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left) * (DISPLAY_W / rect.width),
      y: (clientY - rect.top)  * (displayH / rect.height),
    };
  }, [displayH]);

  // Snap a mm value to the nearest integer
  const snapMm = (v) => Math.round(v);

  // Check if placing piece[idx] at (mmX, mmY) causes any overlap
  const checkValid = useCallback((idx, mmX, mmY) => {
    const p = pieces[idx];
    const px = roundMm(mmX);
    const py = roundMm(mmY);
    if (px < marginX || px + p.w > sheetW - marginX) return false;
    if (py < marginY || py + p.h > sheetH - marginY) return false;
    return pieces.every((other, i) => {
      if (i === idx) return true;
      const ox = roundMm(other.x);
      const oy = roundMm(other.y);
      return (
        px + p.w + kerf <= ox || ox + other.w + kerf <= px ||
        py + p.h + kerf <= oy || oy + other.h + kerf <= py
      );
    });
  }, [pieces, kerf, marginX, marginY, sheetW, sheetH]);

  // Build current drag visual state from raw mouse position
  const computeDragState = useCallback((clientX, clientY, base) => {
    const { x: svgX, y: svgY } = clientToSvg(clientX, clientY);
    const mmX = snapMm((svgX - base.offsetDX) / scaleX);
    const mmY = snapMm((svgY - base.offsetDY) / scaleY);
    const piece = pieces[base.idx];
    const clampedX = Math.max(marginX, Math.min(sheetW - marginX - piece.w, mmX));
    const clampedY = Math.max(marginY, Math.min(sheetH - marginY - piece.h, mmY));

    const candidates = collectSnapCandidates(
      pieces, base.idx, clampedX, clampedY, settings, sheetW, sheetH,
    );

    let dropX = clampedX;
    let dropY = clampedY;
    let guideX = null;
    let guideY = null;

    for (const cand of candidates) {
      const cx = roundMm(cand.x);
      const cy = roundMm(cand.y);
      if (checkValid(base.idx, cx, cy)) {
        dropX = cx;
        dropY = cy;
        guideX = cand.guideX;
        guideY = cand.guideY;
        break;
      }
    }

    if (guideX == null && guideY == null) {
      const { xs, ys } = buildSnapGrid(
        pieces, base.idx, piece.w, piece.h, kerf, marginX, marginY,
      );
      let nearX = null;
      let nearY = null;
      let nearXDist = SNAP_X_MM + 1;
      let nearYDist = SNAP_Y_MM + 1;
      for (const x of xs) {
        const d = Math.abs(clampedX - x);
        if (d <= SNAP_X_MM && d < nearXDist) { nearXDist = d; nearX = x; }
      }
      for (const y of ys) {
        const d = Math.abs(clampedY - y);
        if (d <= SNAP_Y_MM && d < nearYDist) { nearYDist = d; nearY = y; }
      }
      const tryX = nearX ?? clampedX;
      const tryY = nearY ?? clampedY;
      if (checkValid(base.idx, tryX, tryY)) {
        dropX = tryX;
        dropY = tryY;
        guideX = nearX;
        guideY = nearY;
      }
    }

    const valid = checkValid(base.idx, dropX, dropY);
    return {
      ...base,
      ghostX: dropX * scaleX,
      ghostY: dropY * scaleY,
      dropX,
      dropY,
      guideX,
      guideY,
      valid,
    };
  }, [clientToSvg, scaleX, scaleY, marginX, marginY, sheetW, sheetH, pieces, checkValid, settings]);

  // ── Global mouse events during drag ──────────────────────────────────────
  useEffect(() => {
    if (!drag) return;

    const onMove = (e) => {
      const updated = computeDragState(e.clientX, e.clientY, dragRef.current);
      dragRef.current = updated;
      setDrag({ ...updated });
    };

    const onUp = (e) => {
      const final = computeDragState(e.clientX, e.clientY, dragRef.current);
      if (final.valid && onMovePiece) {
        onMovePiece(final.idx, final.dropX, final.dropY);
      }
      dragRef.current = null;
      setDrag(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, computeDragState, onMovePiece]);

  const handlePieceMouseDown = (e, idx) => {
    e.preventDefault();
    e.stopPropagation();

    if (selectedIdx !== idx) {
      onSelectPiece?.(idx);
      return;
    }

    if (!onMovePiece) return;

    const p = pieces[idx];
    const { x: svgX, y: svgY } = clientToSvg(e.clientX, e.clientY);
    const pSvgX = p.x * scaleX;
    const pSvgY = p.y * scaleY;

    const base = {
      idx,
      offsetDX: svgX - pSvgX,
      offsetDY: svgY - pSvgY,
      ghostX: pSvgX,
      ghostY: pSvgY,
      ghostW: p.w * scaleX,
      ghostH: p.h * scaleY,
      fill: colorForLabel(p.label, colorMap),
      dropX: p.x,
      dropY: p.y,
      valid: true,
    };
    dragRef.current = base;
    setDrag({ ...base });
  };

  const handleBackgroundMouseDown = (e) => {
    if (e.target === e.currentTarget || e.target.classList.contains("cutting-plan__svg-bg")) {
      onSelectPiece?.(null);
    }
  };

  // ── Remainder zones ───────────────────────────────────────────────────────
  const maxRight  = pieces.length ? Math.max(...pieces.map((p) => p.x + p.w)) : 0;
  const maxBottom = pieces.length ? Math.max(...pieces.map((p) => p.y + p.h)) : 0;
  const maxRightPx  = Math.round(maxRight  * scaleX);
  const maxBottomPx = Math.round(maxBottom * scaleY);

  const isDragging = drag !== null;

  return (
    <svg
      ref={svgRef}
      className={`cutting-plan__svg${isDragging ? " cutting-plan__svg--dragging" : ""}`}
      viewBox={`0 0 ${DISPLAY_W} ${displayH}`}
      width={DISPLAY_W}
      height={displayH}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={handleBackgroundMouseDown}
    >
      <defs>
        <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#bbb" strokeWidth="1.2" />
        </pattern>
        {pieces.map((p, i) => {
          const clipX = p.x * scaleX + 1;
          const clipY = p.y * scaleY + 1;
          const clipW = Math.max(0, p.w * scaleX - 2);
          const clipH = Math.max(0, p.h * scaleY - 2);
          return (
            <clipPath id={`${diagramId}-clip-${i}`} key={i}>
              <rect x={clipX} y={clipY} width={clipW} height={clipH} />
            </clipPath>
          );
        })}
      </defs>

      <rect x={0} y={0} width={DISPLAY_W} height={displayH} className="cutting-plan__svg-bg" />

      {/* Pieces */}
      {pieces.map((p, i) => {
        const x = p.x * scaleX;
        const y = p.y * scaleY;
        const w = Math.max(1, p.w * scaleX);
        const h = Math.max(1, p.h * scaleY);
        const fill = colorForLabel(p.label, colorMap);
        const cx = x + w / 2;
        const cy = y + h / 2;
        const fontSize = Math.min(11, Math.max(7, Math.min(w, h) * 0.18));
        const nameFontSize = Math.max(6, fontSize * 0.85);
        const sizeLabel = `${formatPieceSize(p.w, p.h, p.rotated)}${p.rotated ? "↺" : ""}`;
        const nameLabel = truncateLabel(p.label, w - 6, nameFontSize);
        const isDragged = drag?.idx === i;
        const isSelected = selectedIdx === i;
        const canInteract = !!onSelectPiece || !!onMovePiece;
        const showSize = w > 24 && h > 12;
        const showName = showSize && w > 40 && h > 24 && nameLabel;

        return (
          <g
            key={i}
            className={`cutting-plan__piece-group${isSelected ? " cutting-plan__piece-group--selected" : ""}`}
          >
            <rect
              x={x + 1} y={y + 1}
              width={Math.max(0, w - 2)} height={Math.max(0, h - 2)}
              fill={fill}
              opacity={isDragged ? 0.25 : isSelected ? 1 : 0.85}
              className={`cutting-plan__piece${isSelected ? " cutting-plan__piece--selected" : ""}`}
              style={canInteract ? { cursor: isSelected ? (isDragging ? "grabbing" : "grab") : "pointer" } : {}}
              onMouseDown={canInteract ? (e) => handlePieceMouseDown(e, i) : undefined}
            />
            {isSelected && !isDragged && (
              <rect
                x={x} y={y}
                width={w} height={h}
                className="cutting-plan__piece-select-ring"
                pointerEvents="none"
              />
            )}
            {!isDragged && showSize && (
              <g clipPath={`url(#${diagramId}-clip-${i})`}>
                <text
                  x={cx} y={showName ? cy - fontSize * 0.45 : cy}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={fontSize}
                  className="cutting-plan__piece-label"
                  style={{ pointerEvents: "none" }}
                >
                  {sizeLabel}
                </text>
                {showName && (
                  <text
                    x={cx} y={cy + fontSize * 0.75}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={nameFontSize}
                    className="cutting-plan__piece-name"
                    style={{ pointerEvents: "none" }}
                  >
                    {nameLabel}
                  </text>
                )}
              </g>
            )}
          </g>
        );
      })}

      {/* Remainder zones */}
      {(sheetW - maxRight) > 1 && (
        <RemainderZone
          displayX={maxRightPx} displayY={0}
          displayW={DISPLAY_W - maxRightPx} displayH={maxBottomPx || displayH}
          label={`${Math.round(sheetW - maxRight)} мм`}
          hatchId={hatchId}
        />
      )}
      {(sheetH - maxBottom) > 1 && (
        <RemainderZone
          displayX={0} displayY={maxBottomPx}
          displayW={DISPLAY_W} displayH={displayH - maxBottomPx}
          label={`${Math.round(sheetH - maxBottom)} мм`}
          hatchId={hatchId}
        />
      )}

      {/* Drag ghost */}
      {drag && (
        <g style={{ pointerEvents: "none" }}>
          {drag.guideY != null && (
            <line
              x1={0} y1={drag.guideY * scaleY}
              x2={DISPLAY_W} y2={drag.guideY * scaleY}
              className="cutting-plan__snap-guide cutting-plan__snap-guide--h"
            />
          )}
          {drag.guideX != null && (
            <line
              x1={drag.guideX * scaleX} y1={0}
              x2={drag.guideX * scaleX} y2={displayH}
              className="cutting-plan__snap-guide cutting-plan__snap-guide--v"
            />
          )}
          {/* Drop target highlight */}
          <rect
            x={drag.ghostX} y={drag.ghostY}
            width={drag.ghostW} height={drag.ghostH}
            fill={drag.valid ? "rgba(30,180,100,0.15)" : "rgba(220,50,50,0.12)"}
            stroke={drag.valid ? "#16a34a" : "#dc2626"}
            strokeWidth="2"
            strokeDasharray="5,3"
            rx="2"
          />
          {/* Ghost piece */}
          <rect
            x={drag.ghostX + 2} y={drag.ghostY + 2}
            width={Math.max(0, drag.ghostW - 4)} height={Math.max(0, drag.ghostH - 4)}
            fill={drag.fill}
            opacity="0.65"
            stroke={drag.valid ? "#16a34a" : "#dc2626"}
            strokeWidth="1.5"
          />
          {/* Position tooltip */}
          {drag.ghostW > 20 && drag.ghostH > 12 && (
            <text
              x={drag.ghostX + drag.ghostW / 2}
              y={drag.ghostY + drag.ghostH / 2}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="9" fill={drag.valid ? "#14532d" : "#991b1b"}
              fontWeight="600"
              style={{ pointerEvents: "none" }}
            >
              {drag.dropX}; {drag.dropY}
            </text>
          )}
        </g>
      )}

      <rect x={0} y={0} width={DISPLAY_W} height={displayH} className="cutting-plan__svg-border" />
      <text x={4} y={displayH - 4} fontSize={9} className="cutting-plan__svg-dim">
        {sheetW}×{sheetH} мм
      </text>
    </svg>
  );
}

// ─── Sheet table ──────────────────────────────────────────────────────────────

function SheetTable({ pieces }) {
  const rows = useMemo(() => {
    const map = new Map();
    for (const p of pieces) {
      const size = formatPieceSize(p.w, p.h, p.rotated);
      const key = `${p.label}|${size}`;
      if (!map.has(key)) map.set(key, { label: p.label, size, count: 0 });
      map.get(key).count++;
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [pieces]);

  return (
    <table className="cutting-plan__table">
      <thead>
        <tr><th>Деталь</th><th>Размер (мм)</th><th>Кол-во</th></tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td>{row.label}</td>
            <td className="cutting-plan__table-num">{row.size}</td>
            <td className="cutting-plan__table-num">{row.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Material group ───────────────────────────────────────────────────────────

function MaterialGroup({
  group,
  gIdx,
  globalColorMap,
  settings,
  selection,
  onSelectPiece,
  onMovePiece,
  onUpdatePiece,
}) {
  return (
    <div className="cutting-plan__material-group">
      <div className="cutting-plan__material-header">
        <span className="cutting-plan__material-name">{group.material}</span>
        <span className="cutting-plan__material-meta">
          {group.totalPieces} дет. → {group.totalSheets}{" "}
          лист{group.totalSheets === 1 ? "" : group.totalSheets < 5 ? "а" : "ов"}
          {group.sheets.length < group.totalSheets && ` (${group.sheets.length} уник.)`}
        </span>
      </div>

      {group.sheets.map((sheet, sIdx) => {
        const sheetDisplayIdx = sIdx + 1;
        const eff = calcEfficiency(sheet.pieces, sheet.sheetW, sheet.sheetH);
        const sheetSelectedIdx = selection?.gIdx === gIdx && selection?.sIdx === sIdx
          ? selection.pIdx
          : null;
        const selectedPiece = sheetSelectedIdx != null
          ? sheet.pieces[sheetSelectedIdx]
          : null;

        return (
          <div key={sIdx} className="cutting-plan__sheet print-page">
            <div className="cutting-plan__sheet-header">
              <span className="cutting-plan__sheet-title">
                {group.material}
                {sheet.repeatCount > 1
                  ? ` — ×${sheet.repeatCount} листов (одинаковый раскрой)`
                  : ` — Лист ${sheetDisplayIdx} из ${group.totalSheets}`}
              </span>
              <span className="cutting-plan__sheet-eff cutting-plan__sheet-eff--print">
                Использование: {eff}%
                {sheet.repeatCount > 1 && ` · итого ${sheet.repeatCount} листов`}
              </span>
              <div className="cutting-plan__sheet-header-right no-print">
                <span className="cutting-plan__sheet-eff">
                  Использование: {eff}%
                  {sheet.repeatCount > 1 && ` · итого ${sheet.repeatCount} листов`}
                </span>
              </div>
            </div>

            <div className="cutting-plan__sheet-body">
              <SheetDiagram
                pieces={sheet.pieces}
                sheetW={sheet.sheetW}
                sheetH={sheet.sheetH}
                colorMap={globalColorMap}
                settings={settings}
                selectedIdx={sheetSelectedIdx}
                onSelectPiece={(pIdx) => onSelectPiece?.(gIdx, sIdx, pIdx)}
                onMovePiece={
                  onMovePiece
                    ? (pIdx, x, y) => onMovePiece(gIdx, sIdx, pIdx, x, y)
                    : null
                }
              />

              <div className="cutting-plan__sheet-right">
                {selectedPiece && (
                  <PieceEditor
                    piece={selectedPiece}
                    pieces={sheet.pieces}
                    pieceIdx={sheetSelectedIdx}
                    settings={settings}
                    sheetW={sheet.sheetW}
                    sheetH={sheet.sheetH}
                    onClose={() => onSelectPiece?.(gIdx, sIdx, null)}
                    onUpdate={(patch) => onUpdatePiece?.(gIdx, sIdx, sheetSelectedIdx, patch)}
                  />
                )}
                <SheetTable pieces={sheet.pieces} />
                <div className="cutting-plan__sheet-legend no-print">
                  {[...new Set(sheet.pieces.map((p) => p.label))].map((label) => (
                    <div key={label} className="cutting-plan__legend-item">
                      <span
                        className="cutting-plan__legend-color"
                        style={{ background: globalColorMap.get(label) || "#ddd" }}
                      />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function CuttingPlanView({ plan, onClose }) {
  const [localPlan, setLocalPlan] = useState(null);
  const [selection, setSelection] = useState(null);

  useEffect(() => {
    if (plan?.materialGroups) {
      const copy = JSON.parse(JSON.stringify(plan));
      normalizePlanPieces(copy);
      setLocalPlan(copy);
      setSelection(null);
    } else {
      setLocalPlan(null);
      setSelection(null);
    }
  }, [plan]);

  useEffect(() => {
    if (!selection) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection]);

  const globalColorMap = useMemo(() => {
    const map = new Map();
    if (!localPlan?.materialGroups) return map;
    for (const group of localPlan.materialGroups) {
      for (const sheet of group.sheets) {
        for (const piece of sheet.pieces) {
          colorForLabel(piece.label, map);
        }
      }
    }
    return map;
  }, [localPlan]);

  const onSelectPiece = useCallback((gIdx, sIdx, pIdx) => {
    if (pIdx == null) {
      setSelection(null);
      return;
    }
    setSelection({ gIdx, sIdx, pIdx });
  }, []);

  const onMovePiece = useCallback((gIdx, sIdx, pIdx, newX, newY) => {
    setLocalPlan((prev) => {
      if (!prev?.materialGroups) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      const piece = next.materialGroups[gIdx].sheets[sIdx].pieces[pIdx];
      piece.x = roundMm(newX);
      piece.y = roundMm(newY);
      return next;
    });
  }, []);

  const onUpdatePiece = useCallback((gIdx, sIdx, pIdx, patch) => {
    setLocalPlan((prev) => {
      if (!prev?.materialGroups) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      const normalized = { ...patch };
      if (normalized.x != null) normalized.x = roundMm(normalized.x);
      if (normalized.y != null) normalized.y = roundMm(normalized.y);
      Object.assign(next.materialGroups[gIdx].sheets[sIdx].pieces[pIdx], normalized);
      return next;
    });
  }, []);

  const isModified = useMemo(() => {
    if (!plan?.materialGroups || !localPlan?.materialGroups) return false;
    return JSON.stringify(localPlan.materialGroups) !== JSON.stringify(plan.materialGroups);
  }, [localPlan, plan]);

  if (!plan?.materialGroups || !localPlan?.materialGroups) return null;

  const totalSheets = localPlan.materialGroups.reduce((s, g) => s + g.totalSheets, 0);

  return (
    <div className="cutting-plan-view">
      <div className="cutting-plan__toolbar no-print">
        <div className="cutting-plan__toolbar-info">
          <b>Раскрой</b>
          <span>Сформировано: {localPlan.generatedAt}</span>
          <span>
            {totalSheets} лист{totalSheets === 1 ? "" : totalSheets < 5 ? "а" : "ов"} всего
          </span>
          {isModified && (
            <span className="cutting-plan__modified-badge">✎ изменён вручную</span>
          )}
        </div>
        <div className="cutting-plan__toolbar-actions">
          {isModified && (
            <button
              className="mini"
              title="Сбросить ручные изменения — вернуть позиции из алгоритма"
              onClick={() => setLocalPlan(JSON.parse(JSON.stringify(plan)))}
            >
              ↺ Сбросить
            </button>
          )}
          <button
            className="mini cutting-plan__dxf-btn accent"
            title="Скачать NXCut XML — родной формат станка"
            onClick={() => downloadAllNXCut(
              localPlan.materialGroups,
              localPlan.jobName || "Раскрой",
              localPlan.settings
            )}
          >
            ⬇ NXCut (.xml)
          </button>
          <button
            className="mini cutting-plan__dxf-btn accent"
            title="Скачать AutoCUT (.CUT) — формат King Stone AutoSAW (NPC-330)"
            onClick={() => downloadAllCUT(
              localPlan.materialGroups,
              localPlan.jobName || "Раскрой",
              localPlan.settings
            )}
          >
            ⬇ AutoCUT (.cut)
          </button>
          <button
            className="mini cutting-plan__dxf-btn accent"
            title="Скачать все листы как DXF файлы"
            onClick={() => {
              const count = downloadAllDXF(
                localPlan.materialGroups,
                localPlan.jobName || "Раскрой",
                localPlan.settings
              );
              if (count === 0) alert("Нет листов для экспорта");
            }}
          >
            ⬇ DXF ({totalSheets})
          </button>
          <button className="mini accent" onClick={() => window.print()}>
            🖨 Печать
          </button>
          {onClose && (
            <button className="mini" onClick={onClose}>
              ← Назад
            </button>
          )}
        </div>
      </div>

      {localPlan.skippedItems && localPlan.skippedItems.length > 0 && (
        <div className="cutting-plan__warning no-print">
          Не удалось определить размеры для: {localPlan.skippedItems.join(", ")}
        </div>
      )}

      {/* Hint */}
      <div className="cutting-plan__dnd-hint no-print">
        <span>💡 При перетаскивании X/Y привязываются к координатам сетки (±{SNAP_X_MM} мм). Или введите X/Y вручную справа.</span>
      </div>

      <div className="cutting-plan__content">
        {localPlan.materialGroups.map((group, gIdx) => (
          <MaterialGroup
            key={group.material}
            group={group}
            gIdx={gIdx}
            globalColorMap={globalColorMap}
            settings={localPlan.settings}
            selection={selection}
            onSelectPiece={onSelectPiece}
            onMovePiece={onMovePiece}
            onUpdatePiece={onUpdatePiece}
          />
        ))}
      </div>
    </div>
  );
}
