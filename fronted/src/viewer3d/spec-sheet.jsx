import React, { useMemo, useState } from 'react';
import { X, Printer } from 'lucide-react';

/**
 * Спецификация деталей — печатный лист для цеха.
 *
 * По мотивам листа detalQR: таблица «№ / Обозн. / Наименование / Материал /
 * Ширина / Длина / Толщ. / Кол. / Присадка / Паз / Контур / Утолщ. / ОТК»,
 * где КРОМКА показана линией над/под размером:
 *   линия НАД числом — кромка на дальней стороне (верх / право),
 *   линия ПОД числом — кромка на ближней стороне (низ / лево),
 *   цвет линии — цвет кромки, штрих — цвет в каталоге не задан,
 *   K×n — кромка есть, но сторону определить не удалось (смотрите чертёж).
 *
 * Ширина — размер по X контура, Длина — по Y (как в модели).
 */

const COLOR = {
  bg: '#ffffff',
  hairline: '#c9c9c2',
  text: '#1d211a',
  textMuted: '#5c6c53',
  accent: '#b5701f',
  accentDim: 'rgba(181,112,31,0.14)',
  rowLine: '#d9d4ca',      // линия между строками
  zebra: '#faf7f1',        // фон через строку — чтобы ряды не сливались
};

/* ---------- цвета кромки (та же логика, что в схеме детали) ---------- */
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function mixHex(hex, target, k) {
  const c = hexToRgb(hex); const t = hexToRgb(target);
  if (!c || !t) return hex;
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + h(c.r + (t.r - c.r) * k) + h(c.g + (t.g - c.g) * k) + h(c.b + (t.b - c.b) * k);
}
function isPlaceholderGreen(hex) {
  const c = hexToRgb(hex);
  return !!c && c.r < 40 && c.g > 215 && c.b < 40;
}
function luminance(hex) {
  const c = hexToRgb(hex);
  return c ? (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255 : 1;
}
// цвет по названию кромки — когда в каталоге Базиса он не задан
// («Кромка 19/1 мм (ЧЁРНАЯ)» -> тёмная плашка)
function colorFromEdgeName(name) {
  const n = String(name || '').toLowerCase();
  if (/ч[её]рн/.test(n)) return '#2f2f2f';
  if (/бел/.test(n)) return '#f2efe9';
  if (/сер/.test(n)) return '#9aa0a6';
  if (/беж|крем/.test(n)) return '#d9c9a8';
  if (/венге/.test(n)) return '#4a3529';
  if (/дуб|орех|бук|ясен|сосн|ольх/.test(n)) return '#b98a4e';
  if (/красн/.test(n)) return '#b3452f';
  if (/син|голуб/.test(n)) return '#3f6fa8';
  if (/зел[её]н/.test(n)) return '#4f8a4a';
  if (/ж[её]лт/.test(n)) return '#d8b23a';
  return null;
}

function edgePaint(hex, mat) {
  if (hex && !isPlaceholderGreen(hex)) {
    return { color: luminance(hex) > 0.72 ? mixHex(hex, '#000000', 0.25) : hex, known: true };
  }
  const byName = colorFromEdgeName(mat);
  if (byName) return { color: byName, known: false, byName: true };
  return { color: '#8a8a8a', known: false };
}

/* ---------- кромка: тонкая (0,4) — розовая, 0,8/1 и толще — красная ---------- */
export const EDGE_COLOR_THIN = '#f472b6';    // розовый — 0,4 мм
export const EDGE_COLOR_THICK = '#e11d48';   // красный — 0,8 мм и толще

export function edgeClass(thick, mat) {
  const t = Number(thick || 0);
  const thin = t > 0 ? t <= 0.55 : (/0[.,]4/.test(String(mat || '')) || !String(mat || '').trim());
  return thin ? 'thin' : 'thick';
}

/* ---------- геометрия контура ---------- */
function segFromElem(contour, elem) {
  if (!contour || elem === undefined || elem === null || elem < 0 || elem >= contour.length) return null;
  const e = contour[elem];
  if (e.t === 'line' || e.t === 'arc') return [[e.x1, e.y1], [e.x2, e.y2]];
  return null;
}
function bboxOf(contour) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  (contour || []).forEach((e) => {
    if (e.t === 'circle') {
      minX = Math.min(minX, e.cx - e.r); maxX = Math.max(maxX, e.cx + e.r);
      minY = Math.min(minY, e.cy - e.r); maxY = Math.max(maxY, e.cy + e.r);
    } else if (e.t !== 'hole') {
      minX = Math.min(minX, e.x1, e.x2); maxX = Math.max(maxX, e.x1, e.x2);
      minY = Math.min(minY, e.y1, e.y2); maxY = Math.max(maxY, e.y1, e.y2);
    }
  });
  return minX === Infinity ? { minX: 0, minY: 0, maxX: 0, maxY: 0 } : { minX, minY, maxX, maxY };
}

// сторона кромки: 'top'/'bottom' для горизонтальных рёбер (влияют на Ширину),
// 'right'/'left' для вертикальных (влияют на Длину), null — не определить
function edgeSideOf(part, b) {
  const contour = (part.v3 && part.v3.contour) || [];
  const seg = b.seg || segFromElem(contour, b.elem);
  if (!seg) return null;
  const bb = bboxOf(contour);
  const [p1, p2] = seg;
  const dx = Math.abs(p2[0] - p1[0]);
  const dy = Math.abs(p2[1] - p1[1]);
  const midX = (p1[0] + p2[0]) / 2;
  const midY = (p1[1] + p2[1]) / 2;
  if (dx >= dy) return midY >= (bb.minY + bb.maxY) / 2 ? 'top' : 'bottom';
  return midX >= (bb.minX + bb.maxX) / 2 ? 'right' : 'left';
}

function isFigured(part) {
  const contour = (part.v3 && part.v3.contour) || [];
  return contour.some((e) => e.t === 'arc' || e.t === 'circle' || e.t === 'hole');
}

/* ---------- строка спецификации: группировка одинаковых деталей ---------- */
function rowKeyOf(p) {
  const edges = (p.butts || []).map((b) => (b.mat || '') + '@' + (edgeSideOf(p, b) || 'K')).sort().join(',');
  const v = p.v3 || {};
  return [v.des, v.name, p.material, Math.round(p.faceW), Math.round(p.faceH), Math.round(v.thickness || 0), edges].join('|');
}

function buildRows(parts) {
  const byAsm = new Map();   // узел -> Map(ключ -> строка)
  parts.forEach((p) => {
    const v = p.v3 || {};
    const asm = v.asmNames && v.asmNames.length ? v.asmNames.join(' / ') : (v.assembly || 'Модель');
    const key = rowKeyOf(p);
    if (!byAsm.has(asm)) byAsm.set(asm, new Map());
    const rows = byAsm.get(asm);
    if (!rows.has(key)) {
      rows.set(key, {
        id: p.id,
        des: v.des || '',
        name: (v.des && p.name && String(p.name).indexOf(v.des + ' — ') === 0)
          ? String(p.name).slice(v.des.length + 3) : (v.name || p.name || ''),
        material: p.material || '',
        w: p.faceW || 0,
        h: p.faceH || 0,
        thick: v.thickness || 0,
        count: 0,
        holes: (p.holes || []).length,
        pockets: (p.pockets || []).length,
        figured: isFigured(p),
        plastic: (p.plastics || []).length,
        edges: [],   // { side, color, known, thick, mat }
        edgeSegs: [], // { x1,y1,x2,y2, kind, color } — для привью
        contour: (p.v3 && p.v3.contour) || [],
        odd: false,
      });
    }
    const row = rows.get(key);
    row.count += 1;
    (p.butts || []).forEach((b) => {
      const side = edgeSideOf(p, b);
      const paint = edgePaint(b.col, b.mat);
      row.edges.push({
        side,
        color: paint.color,
        known: paint.known,
        byName: !!paint.byName,
        thick: Number(String(b.thick ?? '').replace(',', '.')) || 0,
        mat: b.mat || '',
      });
      if (!side) row.odd = true;
      const seg = b.seg || segFromElem((p.v3 && p.v3.contour) || [], b.elem);
      if (seg) {
        row.edgeSegs.push({
          x1: seg[0][0], y1: seg[0][1], x2: seg[1][0], y2: seg[1][1],
          kind: edgeClass(b.thick, b.mat),
          color: paint.color,
        });
      }
    });
  });
  return Array.from(byAsm.entries()).map(([asm, rows]) => ({ asm, rows: Array.from(rows.values()) }));
}

/* ---------- цвет кромки: плашка + толщина (до 2 разных кромок на деталь) ---------- */
function edgeThickLabel(thick) {
  const t = Number(thick || 0);
  if (!t) return '';
  if (t <= 0.55) return '0,4';
  return String(t).replace('.', ',');
}

function EdgeColorCell({ edges, fontScale = 1, cellStyle }) {
  const uniq = [];
  (edges || []).forEach((e) => {
    const key = `${e.mat || ''}|${e.color}|${e.thick}`;
    if (!uniq.some((u) => u.key === key)) uniq.push({ key, ...e });
  });
  if (!uniq.length) {
    return <td style={{ ...cellStyle, textAlign: 'center', color: COLOR.textMuted }}>—</td>;
  }
  return (
    <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {uniq.map((u) => {
          const label = edgeThickLabel(u.thick);
          const title = u.known
            ? `${u.mat || 'кромка'}${label ? ' · ' + label + ' мм' : ''} — цвет из каталога ${u.color}`
            : u.byName
              ? `${u.mat || 'кромка'}${label ? ' · ' + label + ' мм' : ''} — цвет определён по названию (в каталоге не задан)`
              : `${u.mat || 'кромка'}${label ? ' · ' + label + ' мм' : ''} — цвет в каталоге не задан`;
          return (
            <span key={u.key} title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span
                aria-label={title}
                style={{
                  display: 'inline-block', width: 13, height: 13,
                  border: `1px solid ${COLOR.rowLine}`,
                  background: (u.known || u.byName)
                    ? u.color
                    : 'repeating-linear-gradient(45deg, #ddd 0 3px, #fff 3px 6px)',
                }}
              />
              <span style={{ fontSize: 10.5 * fontScale, color: COLOR.textMuted, fontFamily: 'ui-monospace, monospace' }}>
                {label || '•'}
              </span>
            </span>
          );
        })}
      </div>
    </td>
  );
}

/* ---------- размер с линиями кромок ----------
 * axis 'w' — размер по X: дальняя сторона «верх», ближняя «низ»
 * axis 'h' — размер по Y: дальняя сторона «право», ближняя «лево» */
function DimCell({ value, edges, axis, fontScale = 1 }) {
  const farSide = axis === 'w' ? 'top' : 'right';
  const nearSide = axis === 'w' ? 'bottom' : 'left';
  // толщина кромки задаёт вид линии: 0,4 мм — пунктир, 1 мм и толще — жирная
  const paint = (side) => {
    const list = edges.filter((e) => e.side === side);
    if (!list.length) return null;
    const main = list.reduce((a, b) => (Number(b.thick || 0) > Number(a.thick || 0) ? b : a), list[0]);
    // у Базиса «Кромка 19/0,4» приходит с толщиной 0,5, «19/1» — с 1: порог 0,55
    const t = Number(main.thick || 0);
    const thin = t > 0 ? t <= 0.55 : /0[.,]4/.test(String(main.mat || ''));
    const sideLabel = side === 'top' ? 'дальняя сторона' : side === 'bottom' ? 'ближняя сторона'
      : side === 'right' ? 'правая сторона' : 'левая сторона';
    const thickLabel = main.thick ? ` ${String(main.thick).replace('.', ',')} мм` : '';
    return {
      color: main.known ? main.color : '#8a8a8a',
      dash: thin ? '3 2' : undefined,
      width: thin ? 1.3 : 3.6,
      title: `${main.mat || 'кромка'}${thickLabel} — ${sideLabel}`,
    };
  };
  const far = paint(farSide);
  const near = paint(nearSide);
  return (
    <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap', borderBottom: `1px solid ${COLOR.rowLine}` }}>
      <svg width={64} height={30} style={{ display: 'block', marginLeft: 'auto' }}>
        {far && (
          <g>
            <title>{far.title}</title>
            <line x1={2} y1={4} x2={62} y2={4} stroke={far.color}
                  strokeWidth={far.width} strokeDasharray={far.dash} strokeLinecap="round" />
          </g>
        )}
        <text x={62} y={19} fontSize={11.5 * fontScale} textAnchor="end" fill={COLOR.text}
              fontFamily="ui-monospace, monospace">
          {Math.round(value)}
        </text>
        {near && (
          <g>
            <title>{near.title}</title>
            <line x1={2} y1={26} x2={62} y2={26} stroke={near.color}
                  strokeWidth={near.width} strokeDasharray={near.dash} strokeLinecap="round" />
          </g>
        )}
      </svg>
    </td>
  );
}

/* ---------- привью детали с подсветкой кромок ---------- */
function arcPoly(e, steps = 10) {
  const r = Math.hypot(e.x1 - e.cx, e.y1 - e.cy) || 0;
  const a0 = Math.atan2(e.y1 - e.cy, e.x1 - e.cx);
  const a1 = Math.atan2(e.y2 - e.cy, e.x2 - e.cx);
  let da = a1 - a0;
  while (da <= -Math.PI) da += 2 * Math.PI;
  while (da > Math.PI) da -= 2 * Math.PI;
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (da * i) / steps;
    out.push([e.cx + r * Math.cos(a), e.cy + r * Math.sin(a)]);
  }
  return out;
}

export function PartPreview({ row, boxW = 260, boxH = 210 }) {
  const elems = row.contour || [];
  const bb = bboxOf(elems);
  const w = Math.max(1, bb.maxX - bb.minX);
  const h = Math.max(1, bb.maxY - bb.minY);
  const pad = 14;
  const scale = Math.min((boxW - pad * 2) / w, (boxH - pad * 2) / h);
  const X = (x) => pad + (x - bb.minX) * scale;
  const Y = (y) => boxH - pad - (y - bb.minY) * scale;   // Y вверх, как в контуре

  let d = '';
  elems.forEach((e) => {
    if (e.t === 'line') {
      d += `M ${X(e.x1)} ${Y(e.y1)} L ${X(e.x2)} ${Y(e.y2)} `;
    } else if (e.t === 'arc') {
      const pts = arcPoly(e);
      d += `M ${X(pts[0][0])} ${Y(pts[0][1])} `;
      pts.slice(1).forEach((q) => { d += `L ${X(q[0])} ${Y(q[1])} `; });
    } else if (e.t === 'circle') {
      d += `M ${X(e.cx + e.r)} ${Y(e.cy)} A ${e.r * scale} ${e.r * scale} 0 1 0 ${X(e.cx - e.r)} ${Y(e.cy)} A ${e.r * scale} ${e.r * scale} 0 1 0 ${X(e.cx + e.r)} ${Y(e.cy)} `;
    } else if (e.t === 'hole' && e.pts) {
      d += `M ${X(e.pts[0][0])} ${Y(e.pts[0][1])} `;
      e.pts.slice(1).forEach((q) => { d += `L ${X(q[0])} ${Y(q[1])} `; });
      d += 'Z ';
    }
  });

  return (
    <div style={{ background: '#fff', border: `1px solid ${COLOR.hairline}`, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: 10, width: boxW + 20 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 2 }}>{row.des ? row.des + ' — ' : ''}{row.name}</div>
      <div style={{ fontSize: 10.5, color: COLOR.textMuted, fontFamily: 'ui-monospace, monospace', marginBottom: 6 }}>
        {Math.round(row.w)} × {Math.round(row.h)} × {Math.round(row.thick)} мм · {row.count} шт
      </div>
      <svg width={boxW} height={boxH} style={{ display: 'block', background: '#fbfaf7', border: `1px solid ${COLOR.rowLine}` }}>
        <path d={d} fill="#efe9dd" stroke="#9a9486" strokeWidth={1} fillRule="evenodd" />
        {(row.edgeSegs || []).map((sg, i) => (
          <line
            key={i}
            x1={X(sg.x1)} y1={Y(sg.y1)} x2={X(sg.x2)} y2={Y(sg.y2)}
            stroke={sg.kind === 'thin' ? EDGE_COLOR_THIN : EDGE_COLOR_THICK}
            strokeWidth={sg.kind === 'thin' ? 5 : 6}
            strokeLinecap="round"
            opacity={0.95}
          />
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 10, fontSize: 10, color: COLOR.textMuted, marginTop: 6 }}>
        <span><span style={{ display: 'inline-block', width: 14, height: 4, background: EDGE_COLOR_THICK, verticalAlign: 'middle', marginRight: 4 }} />0,8–1 мм и толще</span>
        <span><span style={{ display: 'inline-block', width: 14, height: 4, background: EDGE_COLOR_THIN, verticalAlign: 'middle', marginRight: 4 }} />0,4 мм</span>
      </div>
    </div>
  );
}

/* ---------- документ ---------- */
export default function SpecSheet({ parts, modelName, onClose }) {
  const [fontScale, setFontScale] = useState(1);
  const [hover, setHover] = useState(null);   // { row, x, y } — привью детали
  const groups = useMemo(() => buildRows(parts), [parts]);
  const totalRows = groups.reduce((s, g) => s + g.rows.length, 0);
  const totalParts = groups.reduce((s, g) => s + g.rows.reduce((a, r) => a + r.count, 0), 0);

  const cell = { padding: '5px 6px', borderBottom: `1px solid ${COLOR.rowLine}`, fontSize: 11.5 * fontScale, verticalAlign: 'middle' };
  const head = { ...cell, borderBottom: `1.5px solid ${COLOR.text}`, fontWeight: 600, whiteSpace: 'nowrap' };

  return (
    <div className="spec-sheet-root" style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#fff', overflowY: 'auto', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .spec-sheet-root, .spec-sheet-root * { visibility: visible !important; }
          .spec-sheet-root { position: static !important; overflow: visible !important; }
          .spec-sheet-bar { display: none !important; }
          .spec-sheet-page { page-break-after: always; }
        }
      `}</style>

      <div className="spec-sheet-bar" style={{ position: 'sticky', top: 0, zIndex: 101, background: '#f4f1ea', borderBottom: `1px solid ${COLOR.hairline}`, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px' }}>
        <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>
          Спецификация деталей — {modelName} · {totalParts} дет. / {totalRows} поз.
        </span>
        <button onClick={() => setFontScale((s) => Math.max(0.8, +(s - 0.1).toFixed(2)))} style={{ padding: '4px 10px', cursor: 'pointer', background: 'transparent', border: `1px solid ${COLOR.hairline}` }}>−</button>
        <span style={{ fontSize: 12, color: COLOR.textMuted, fontFamily: 'ui-monospace, monospace', width: 44, textAlign: 'center' }}>{Math.round(fontScale * 100)}%</span>
        <button onClick={() => setFontScale((s) => Math.min(1.6, +(s + 0.1).toFixed(2)))} style={{ padding: '4px 10px', cursor: 'pointer', background: 'transparent', border: `1px solid ${COLOR.hairline}` }}>+</button>
        <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 13, cursor: 'pointer', background: COLOR.accent, color: '#fff', border: 'none' }}>
          <Printer size={14} /> Печать / PDF
        </button>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 13, cursor: 'pointer', background: 'transparent', color: COLOR.text, border: `1px solid ${COLOR.hairline}` }}>
          <X size={14} /> Закрыть
        </button>
      </div>

      <div className="spec-sheet-page" style={{ padding: '24px 32px' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Спецификация деталей</div>
        <div style={{ fontSize: 12, color: COLOR.textMuted, marginBottom: 14 }}>
          {modelName} · {new Date().toLocaleDateString('ru-RU')} · всего деталей: {totalParts}
        </div>

        {groups.map((g, gi) => (
          <div key={gi} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
              {g.asm} <span style={{ color: COLOR.textMuted, fontWeight: 400 }}>({g.rows.reduce((a, r) => a + r.count, 0)} дет.)</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...head, width: 26 }}>№</th>
                  <th style={{ ...head, width: 52 }}>Обозн.</th>
                  <th style={head}>Наименование</th>
                  <th style={head}>Материал</th>
                  <th style={{ ...head, width: 96 }}>Цвет кромки</th>
                  <th style={{ ...head, textAlign: 'right' }}>Ширина</th>
                  <th style={{ ...head, textAlign: 'right' }}>Длина</th>
                  <th style={{ ...head, textAlign: 'right' }}>Толщ.</th>
                  <th style={{ ...head, textAlign: 'center' }}>Кол.</th>
                  <th style={{ ...head, textAlign: 'center' }}>Присадка</th>
                  <th style={{ ...head, textAlign: 'center' }}>Паз</th>
                  <th style={{ ...head, textAlign: 'center' }}>Контур</th>
                  <th style={{ ...head, textAlign: 'center' }}>Утолщ.</th>
                  <th style={{ ...head, textAlign: 'center', width: 40 }}>ОТК</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r, ri) => (
                  <tr
                    key={ri}
                    style={{ background: ri % 2 ? COLOR.zebra : 'transparent', cursor: 'help' }}
                    onMouseEnter={(e) => setHover({ row: r, x: e.clientX, y: e.clientY })}
                    onMouseMove={(e) => setHover((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev))}
                    onMouseLeave={() => setHover(null)}
                  >
                    <td style={{ ...cell, color: COLOR.textMuted }}>{ri + 1}</td>
                    <td style={{ ...cell, fontFamily: 'ui-monospace, monospace', color: COLOR.accent }}>{r.des || '—'}</td>
                    <td style={cell}>{r.name}</td>
                    <td style={{ ...cell, color: COLOR.textMuted }}>{r.material || '—'}</td>
                    <EdgeColorCell edges={r.edges} fontScale={fontScale} cellStyle={cell} />
                    <DimCell value={r.w} edges={r.edges} axis="w" fontScale={fontScale} />
                    <DimCell value={r.h} edges={r.edges} axis="h" fontScale={fontScale} />
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'ui-monospace, monospace' }}>{Math.round(r.thick)}</td>
                    <td style={{ ...cell, textAlign: 'center', fontFamily: 'ui-monospace, monospace' }}>{r.count}</td>
                    <td style={{ ...cell, textAlign: 'center', fontFamily: 'ui-monospace, monospace' }}>{r.holes ? '⚙ ' + r.holes : '—'}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>{r.pockets ? '▭ ' + r.pockets : '—'}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>{r.figured ? '⌒ фигурный' : '—'}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>{r.plastic ? '+ ' + r.plastic : '—'}</td>
                    <td style={{ ...cell, textAlign: 'center' }} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {hover && (
          <div
            style={{
              position: 'fixed',
              left: Math.min(hover.x + 18, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 310),
              top: Math.min(hover.y + 12, (typeof window !== 'undefined' ? window.innerHeight : 800) - 300),
              zIndex: 1200,
              pointerEvents: 'none',
            }}
          >
            <PartPreview row={hover.row} />
          </div>
        )}

        <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${COLOR.hairline}`, fontSize: 11, color: COLOR.textMuted, lineHeight: 1.7 }}>
          <b style={{ color: COLOR.text }}>Кромка — линия над/под размером:</b> линия НАД числом — кромка на дальней стороне
          (верх для Ширины, право для Длины), линия ПОД числом — на ближней стороне. Вид линии — толщина кромки:{' '}
          <b style={{ color: COLOR.text }}>пунктир — 0,4 мм</b>, <b style={{ color: COLOR.text }}>жирная — 1 мм и толще</b>.
          Цвет линии и плашки в колонке «Цвет кромки» — цвет кромки из каталога Базиса; если он там не задан,
          цвет берётся из названия материала («... (ЧЁРНАЯ)» — тёмная плашка), штриховка — цвет неизвестен,
          рядом с плашкой — толщина кромки (0,4 / 1 / 2). Без линии — кромки нет.{' '}
          {parts.some((p) => (p.butts || []).some((b) => !edgeSideOf(p, b))) && (
            <span><b style={{ color: COLOR.text }}>K×n</b> — кромка с неопределённой стороной: смотрите чертёж. </span>
          )}
          <b style={{ color: COLOR.text }}>Наведите на строку</b> — появится чертёж детали, на нём{' '}
          <b style={{ color: EDGE_COLOR_THICK }}>красным</b> отмечены кромки 0,8 мм и толще,{' '}
          <b style={{ color: EDGE_COLOR_THIN }}>розовым</b> — 0,4 мм.{' '}
          <b style={{ color: COLOR.text }}>Значки:</b> ⚙ присадка (число отверстий) · ▭ паз/выборка · ⌒ фигурный контур · + утолщение/облицовка
          <div style={{ marginTop: 4, color: COLOR.textMuted }}>
            Привью не печатается — только подсказка на экране.
          </div>
        </div>
      </div>
    </div>
  );
}
