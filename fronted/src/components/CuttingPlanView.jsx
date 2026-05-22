import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { generateSheetDXF, downloadDXF, downloadAllDXF } from "../app/dxfExport";
import { downloadAllCUT } from "../app/cutExport";
import { downloadAllNXCut } from "../app/nxcutExport";

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

function RemainderZone({ displayX, displayY, displayW, displayH, label }) {
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

// ─── SheetDiagram with drag-and-drop ─────────────────────────────────────────

function SheetDiagram({ pieces, sheetW, sheetH, colorMap, settings, onMovePiece }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);  // holds drag state without triggering re-render on each move
  const [drag, setDrag] = useState(null);

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
    // Clamp to inner sheet bounds
    if (mmX < marginX || mmX + p.w > sheetW - marginX) return false;
    if (mmY < marginY || mmY + p.h > sheetH - marginY) return false;
    // Check against all other pieces (kerf gap required)
    return pieces.every((other, i) => {
      if (i === idx) return true;
      const gap = kerf;
      return (
        mmX + p.w + gap <= other.x || other.x + other.w + gap <= mmX ||
        mmY + p.h + gap <= other.y || other.y + other.h + gap <= mmY
      );
    });
  }, [pieces, kerf, marginX, marginY, sheetW, sheetH]);

  // Build current drag visual state from raw mouse position
  const computeDragState = useCallback((clientX, clientY, base) => {
    const { x: svgX, y: svgY } = clientToSvg(clientX, clientY);
    const mmX = snapMm((svgX - base.offsetDX) / scaleX);
    const mmY = snapMm((svgY - base.offsetDY) / scaleY);
    const clampedX = Math.max(marginX, Math.min(sheetW - marginX - pieces[base.idx].w, mmX));
    const clampedY = Math.max(marginY, Math.min(sheetH - marginY - pieces[base.idx].h, mmY));
    const valid = checkValid(base.idx, clampedX, clampedY);
    return {
      ...base,
      ghostX: clampedX * scaleX,
      ghostY: clampedY * scaleY,
      dropX: clampedX,
      dropY: clampedY,
      valid,
    };
  }, [clientToSvg, scaleX, scaleY, marginX, marginY, sheetW, sheetH, pieces, checkValid]);

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
    if (!onMovePiece) return;
    e.preventDefault();
    e.stopPropagation();

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
    >
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#bbb" strokeWidth="1.2" />
        </pattern>
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
        const sizeLabel = p.rotated ? `${p.h}×${p.w}↺` : `${p.w}×${p.h}`;
        const isDragged = drag?.idx === i;
        const canDrag = !!onMovePiece;

        return (
          <g key={i} className={canDrag ? "cutting-plan__piece-group" : ""}>
            <rect
              x={x + 1} y={y + 1}
              width={Math.max(0, w - 2)} height={Math.max(0, h - 2)}
              fill={fill}
              opacity={isDragged ? 0.25 : 0.85}
              className="cutting-plan__piece"
              style={canDrag ? { cursor: isDragging ? "grabbing" : "grab" } : {}}
              onMouseDown={canDrag ? (e) => handlePieceMouseDown(e, i) : undefined}
            />
            {!isDragged && w > 28 && h > 14 && (
              <>
                <text
                  x={cx} y={cy - fontSize * 0.5}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={fontSize}
                  className="cutting-plan__piece-label"
                  style={{ pointerEvents: "none" }}
                >
                  {sizeLabel}
                </text>
                {w > 36 && h > 22 && (
                  <text
                    x={cx} y={cy + fontSize * 0.8}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={Math.max(6, fontSize * 0.85)}
                    className="cutting-plan__piece-name"
                    style={{ pointerEvents: "none" }}
                  >
                    {p.label}
                  </text>
                )}
              </>
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
        />
      )}
      {(sheetH - maxBottom) > 1 && (
        <RemainderZone
          displayX={0} displayY={maxBottomPx}
          displayW={DISPLAY_W} displayH={displayH - maxBottomPx}
          label={`${Math.round(sheetH - maxBottom)} мм`}
        />
      )}

      {/* Drag ghost */}
      {drag && (
        <g style={{ pointerEvents: "none" }}>
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
      const size = p.rotated ? `${p.h}×${p.w}` : `${p.w}×${p.h}`;
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

function MaterialGroup({ group, gIdx, globalColorMap, settings, onMovePiece }) {
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
        const sheetTitle = `${group.material.replace(/[\\/:*?"<>|]/g, "_")}_лист${sheetDisplayIdx}`;

        return (
          <div key={sIdx} className="cutting-plan__sheet print-page">
            <div className="cutting-plan__sheet-header">
              <span className="cutting-plan__sheet-title">
                {group.material}
                {sheet.repeatCount > 1
                  ? ` — ×${sheet.repeatCount} листов (одинаковый раскрой)`
                  : ` — Лист ${sheetDisplayIdx} из ${group.totalSheets}`}
              </span>
              <div className="cutting-plan__sheet-header-right no-print">
                <span className="cutting-plan__sheet-eff">
                  Использование: {eff}%
                  {sheet.repeatCount > 1 && ` · итого ${sheet.repeatCount} листов`}
                </span>
                <button
                  className="mini cutting-plan__dxf-btn"
                  title="Скачать DXF для этого листа"
                  onClick={() => {
                    const dxf = generateSheetDXF(sheet, settings);
                    downloadDXF(dxf, sheetTitle);
                  }}
                >
                  ⬇ DXF
                </button>
              </div>
            </div>

            <div className="cutting-plan__sheet-body">
              <SheetDiagram
                pieces={sheet.pieces}
                sheetW={sheet.sheetW}
                sheetH={sheet.sheetH}
                colorMap={globalColorMap}
                settings={settings}
                onMovePiece={
                  onMovePiece
                    ? (pIdx, x, y) => onMovePiece(gIdx, sIdx, pIdx, x, y)
                    : null
                }
              />

              <div className="cutting-plan__sheet-right">
                <SheetTable pieces={sheet.pieces} />
                <div className="cutting-plan__sheet-legend">
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

  useEffect(() => {
    if (plan?.materialGroups) {
      setLocalPlan(JSON.parse(JSON.stringify(plan)));
    } else {
      setLocalPlan(null);
    }
  }, [plan]);

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

  const onMovePiece = useCallback((gIdx, sIdx, pIdx, newX, newY) => {
    setLocalPlan((prev) => {
      if (!prev?.materialGroups) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      const piece = next.materialGroups[gIdx].sheets[sIdx].pieces[pIdx];
      piece.x = newX;
      piece.y = newY;
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
        <span>💡 Перетащите деталь на новое место. Зелёная рамка — позиция допустима, красная — перекрытие или выход за поле.</span>
      </div>

      <div className="cutting-plan__content">
        {localPlan.materialGroups.map((group, gIdx) => (
          <MaterialGroup
            key={group.material}
            group={group}
            gIdx={gIdx}
            globalColorMap={globalColorMap}
            settings={localPlan.settings}
            onMovePiece={onMovePiece}
          />
        ))}
      </div>
    </div>
  );
}
