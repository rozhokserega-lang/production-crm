import React, { useMemo, useState } from 'react';
import { X, Printer } from 'lucide-react';

/**
 * Схема сборки — печатная документация в стиле DetalQR.
 *
 * Всё строится локально из загруженного JSON v3:
 *  - разбивка на узлы по v3.assembly (путь по Owner-цепочке)
 *  - изометрический чертёж каждого узла (SVG, проекция (X−Z, X+Z−Y)),
 *    панели рисуются реальным контуром через матрицу плейсмента
 *  - позиции-обозначения на деталях
 *  - спецификации, сгруппированные по материалам (кол-во = одинаковые детали)
 *  - ведомость фурнитуры узла (из привязанных присадок)
 *  - «Paz» при наличии пазов, кромка в примечании
 *
 * Интерактив (на экране, в PDF не влияет): наведение на строку списка
 * подсвечивает деталь на чертеже, наведение на деталь — строку.
 *
 * Печать: кнопка «Печать / PDF» → браузер печатает только документ
 * (CSS @media print скрывает всё остальное).
 */

const COLOR = {
  bg: '#ffffff',
  hairline: '#c9c9c2',
  text: '#1d211a',
  textMuted: '#5c6c53',
  accent: '#b5701f',
  accentDim: 'rgba(181,112,31,0.18)',
  fill: '#efe9dc',
  fillTop: '#f7f3e9',
  fillSide: '#ded4bf',
};

/* ---------- геометрия ---------- */

function arcPts(e) {
  const r = Math.hypot(e.x1 - e.cx, e.y1 - e.cy);
  const a0 = Math.atan2(e.y1 - e.cy, e.x1 - e.cx);
  const a1 = Math.atan2(e.y2 - e.cy, e.x2 - e.cx);
  let da = a1 - a0;
  while (da <= -Math.PI) da += 2 * Math.PI;
  while (da > Math.PI) da += 2 * Math.PI;
  const steps = Math.max(2, Math.min(16, Math.ceil(Math.abs(da) / 0.35)));
  const pts = [];
  for (let k = 0; k <= steps; k++) {
    const a = a0 + (da * k) / steps;
    pts.push([e.cx + r * Math.cos(a), e.cy + r * Math.sin(a)]);
  }
  return pts;
}

// контур панели -> замкнутый полигон локальных точек [[lx,ly]..]
function contourPolygons(part) {
  const elems = part.v3.contour || [];
  const circles = elems.filter((e) => e.t === 'circle');
  const others = elems.filter((e) => e.t !== 'circle');
  let outer = [];
  if (!others.length && circles.length === 1) {
    const c = circles[0];
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      outer.push([c.cx + c.r * Math.cos(a), c.cy + c.r * Math.sin(a)]);
    }
  } else {
    others.forEach((e) => {
      if (e.t === 'line') { outer.push([e.x1, e.y1]); outer.push([e.x2, e.y2]); }
      else if (e.t === 'arc') outer = outer.concat(arcPts(e));
    });
  }
  // дедуп + замыкание
  const cl = [];
  outer.forEach((q) => {
    if (!cl.length || Math.hypot(cl[cl.length - 1][0] - q[0], cl[cl.length - 1][1] - q[1]) > 0.05) cl.push(q);
  });
  if (cl.length > 2 && Math.hypot(cl[0][0] - cl[cl.length - 1][0], cl[0][1] - cl[cl.length - 1][1]) < 0.05) cl.pop();
  return cl;
}

// локальная точка -> мир (по плейсменту панели)
function toWorld(pl, lx, ly, lz) {
  return {
    x: pl.origin.x + pl.ax.x * lx + pl.ay.x * ly + pl.az.x * lz,
    y: pl.origin.y + pl.ax.y * lx + pl.ay.y * ly + pl.az.y * lz,
    z: pl.origin.z + pl.ax.z * lx + pl.ay.z * ly + pl.az.z * lz,
  };
}

// изометрическая проекция: вид из (+1,+1,+1)
const ISO = {
  px: (v) => (v.x - v.z) * 0.8660254,
  py: (v) => (v.x + v.z) * 0.5 - v.y,
  depth: (v) => v.x + v.y + v.z,
};

/* ---------- группы / таблицы ---------- */

function groupKeyOf(p) {
  const v = p.v3;
  return `${v.des}|${p.name}|${p.material}|${Math.round(p.faceW)}|${Math.round(p.faceH)}|${Math.round(v.thickness)}`;
}

function buildGroups(parts) {
  const map = {};   // assembly -> { material -> { key -> row } }
  const order = [];
  parts.forEach((p) => {
    const asm = p.v3.assembly || 'Модель';
    if (!map[asm]) { map[asm] = {}; order.push(asm); }
    const byMat = map[asm];
    if (!byMat[p.material || 'без материала']) byMat[p.material || 'без материала'] = {};
    const rows = byMat[p.material || 'без материала'];
    const key = groupKeyOf(p);
    if (!rows[key]) {
      rows[key] = {
        id: p.id,
        des: p.v3.des || '',
        name: (p.v3.des ? p.name.replace(p.v3.des + ' — ', '') : p.name),
        size: `${Math.round(p.faceW)} × ${Math.round(p.faceH)}`,
        qty: 0,
        paz: false,
        edge: (p.butts && p.butts.length) ? [...new Set(p.butts.map((b) => b.mat))].join(', ') : '',
        partIds: [],
      };
    }
    rows[key].qty += 1;
    if (p.pockets && p.pockets.length) rows[key].paz = true;
    rows[key].partIds.push(p.id);
  });
  return order.map((asm) => ({
    asm,
    materials: Object.keys(map[asm]).map((mat) => ({ mat, rows: Object.values(map[asm][mat]) })),
    partIds: Object.values(map[asm]).flatMap((rows) => Object.values(rows).flatMap((r) => r.partIds)),
  }));
}

function hardwareOf(partsInGroup) {
  const cnt = {};
  partsInGroup.forEach((p) => (p.holes || []).forEach((h) => {
    const n = h.name || 'крепёж';
    cnt[n] = (cnt[n] || 0) + 1;
  }));
  return Object.entries(cnt).sort((a, b) => b[1] - a[1]);
}

/* ---------- чертёж узла ---------- */

// React.memo + memo-геометрия: наведение меняет только подсветку,
// чертёж узла не пересчитывается (раньше useMemo без deps пересчитывал
// всю геометрию на каждый mouseenter — на больших моделях намертво вешал вкладку)
const AssemblyDrawing = React.memo(function AssemblyDrawing({ partsById, partIds, hoverId, setHoverId, indexTitle }) {
  const groupParts = useMemo(
    () => partIds.map((id) => partsById[id]).filter(Boolean),
    [partsById, partIds]
  );
  const drawing = useMemo(() => {
    // 1) полигоны всех панелей (низ пласти + верх пласти, мировые координаты)
    const shapes = groupParts.map((p) => {
      const poly = contourPolygons(p);
      const th = p.v3.thickness;
      const bot = poly.map((q) => toWorld(p.v3.placement, q[0], q[1], 0));
      const top = poly.map((q) => toWorld(p.v3.placement, q[0], q[1], th));
      return { id: p.id, des: p.v3.des || p.name, bot, top };
    });

    // 2) общий bbox
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    shapes.forEach((s) => s.bot.concat(s.top).forEach((v) => {
      if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
      if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
    }));
    const c = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };

    // 3) проекция с центрированием
    let pxMin = Infinity, pxMax = -Infinity, pyMin = Infinity, pyMax = -Infinity;
    const proj = (v) => {
      const sx = ISO.px({ x: v.x - c.x, y: v.y - c.y, z: v.z - c.z });
      const sy = ISO.py({ x: v.x - c.x, y: v.y - c.y, z: v.z - c.z });
      if (sx < pxMin) pxMin = sx; if (sx > pxMax) pxMax = sx;
      if (sy < pyMin) pyMin = sy; if (sy > pyMax) pyMax = sy;
      return [sx, sy];
    };

    // 4) примитивы: (нижняя пласть) + боковые грани + верхняя пласть, сортировка по глубине
    const prims = [];
    shapes.forEach((s) => {
      const n = s.bot.length;
      prims.push({
        id: s.id, kind: 'bottom', depth: 1e9,
        pts: s.bot.map((v) => ({ v, d: ISO.depth({ x: v.x - c.x, y: v.y - c.y, z: v.z - c.z }) })),
      });
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const quad = [s.bot[i], s.bot[j], s.top[j], s.top[i]];
        const d = quad.reduce((acc, v) => acc + ISO.depth({ x: v.x - c.x, y: v.y - c.y, z: v.z - c.z }), 0) / 4;
        prims.push({ id: s.id, kind: 'side', depth: d, pts: quad.map((v) => ({ v, d: 0 })) });
      }
      const dTop = s.top.reduce((acc, v) => acc + ISO.depth({ x: v.x - c.x, y: v.y - c.y, z: v.z - c.z }), 0) / n;
      prims.push({ id: s.id, kind: 'top', depth: dTop + 1, pts: s.top.map((v) => ({ v, d: 0 })), label: s.des, center: true });
    });
    prims.sort((a, b) => a.depth - b.depth);

    // 5) перевод в экранные координаты (после того, как bbox спроецирован)
    prims.forEach((pr) => pr.pts.forEach((q) => { q.s = proj(q.v); }));
    const labels = [];
    prims.forEach((pr) => {
      if (!pr.label) return;
      const sx = pr.pts.reduce((a, q) => a + q.s[0], 0) / pr.pts.length;
      const sy = pr.pts.reduce((a, q) => a + q.s[1], 0) / pr.pts.length;
      labels.push({ id: pr.id, text: pr.label, x: sx, y: sy });
    });

      return {
      prims, labels,
      pad: 60,
    };
  }, [groupParts]);

  const W = 640, H = 460;
  const sx = drawing.pad, sy = drawing.pad;
  const spanX = 640 - 2 * drawing.pad, spanY = 460 - 2 * drawing.pad;
  // центрируем спроецированные точки в поле
  let gxMin = Infinity, gxMax = -Infinity, gyMin = Infinity, gyMax = -Infinity;
  drawing.prims.forEach((pr) => pr.pts.forEach((q) => {
    if (q.s[0] < gxMin) gxMin = q.s[0]; if (q.s[0] > gxMax) gxMax = q.s[0];
    if (q.s[1] < gyMin) gyMin = q.s[1]; if (q.s[1] > gyMax) gyMax = q.s[1];
  }));
  const sc = Math.min(spanX / Math.max(gxMax - gxMin, 1), spanY / Math.max(gyMax - gyMin, 1), 1.2);
  const offX = sx + (spanX - (gxMax - gxMin) * sc) / 2 - gxMin * sc;
  const offY = sy + (spanY - (gyMax - gyMin) * sc) / 2 - gyMin * sc;
  const P = (s) => [s[0] * sc + offX, s[1] * sc + offY];

  const fillOf = (pr, hovered) => {
    if (hovered) return COLOR.accentDim;
    if (pr.kind === 'top') return COLOR.fillTop;
    if (pr.kind === 'side') return COLOR.fillSide;
    return COLOR.fill;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', background: '#fff', border: `1px solid ${COLOR.hairline}`, display: 'block' }}>
      {drawing.prims.map((pr, i) => {
        const ptsStr = pr.pts.map((q) => P(q.s).map((n) => n.toFixed(1)).join(',')).join(' ');
        const hovered = hoverId && pr.id === hoverId;
        return (
          <polygon
            key={i}
            points={ptsStr}
            fill={fillOf(pr, hovered)}
            stroke={hovered ? COLOR.accent : '#7a746a'}
            strokeWidth={hovered ? 1.8 : 0.6}
            onMouseEnter={() => setHoverId(pr.id)}
            onMouseLeave={() => setHoverId(null)}
            style={{ cursor: 'pointer' }}
          />
        );
      })}
      {drawing.labels.map((lb, i) => {
        const [x, y] = P([lb.x, lb.y]);
        return (
          <text key={i} x={x} y={y - 4} fontSize={9.5} textAnchor="middle"
                fill={hoverId === lb.id ? COLOR.accent : COLOR.text}
                fontWeight={hoverId === lb.id ? 700 : 500}
                fontFamily="ui-monospace, monospace"
                style={{ pointerEvents: 'none' }}>
            {lb.text}
          </text>
        );
      })}
      <text x={8} y={14} fontSize={10} fill={COLOR.textMuted} fontFamily="ui-monospace, monospace">
        {indexTitle}
      </text>
    </svg>
  );
});

/* ---------- документ ---------- */

export default function AssemblyDoc({ parts, modelName, onClose }) {
  const [hoverId, setHoverId] = useState(null);
  const groups = useMemo(() => buildGroups(parts), [parts]);
  const partsById = useMemo(() => {
    const m = {};
    parts.forEach((p) => { m[p.id] = p; });
    return m;
  }, [parts]);
  const groupParts = (g) => g.partIds.map((id) => partsById[id]).filter(Boolean);

  return (
    <div className="assembly-doc-root" style={{ position: 'fixed', inset: 0, zIndex: 1400, background: '#fff', overflowY: 'auto' }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .assembly-doc-root, .assembly-doc-root * { visibility: visible !important; }
          .assembly-doc-root { position: static !important; overflow: visible !important; }
          .assembly-doc-toolbar { display: none !important; }
          .assembly-doc-page { page-break-after: always; }
        }
      `}</style>

      <div className="assembly-doc-toolbar" style={{ position: 'sticky', top: 0, background: '#f4f1ea', borderBottom: `1px solid ${COLOR.hairline}`, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', zIndex: 101 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: COLOR.text, flex: 1 }}>Схема сборки — {modelName}</span>
        <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 13, cursor: 'pointer', background: COLOR.accent, color: '#fff', border: 'none' }}>
          <Printer size={14} /> Печать / PDF
        </button>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 13, cursor: 'pointer', background: 'transparent', color: COLOR.text, border: `1px solid ${COLOR.hairline}` }}>
          <X size={14} /> Закрыть
        </button>
      </div>

      {/* титул */}
      <div className="assembly-doc-page" style={{ padding: '40px 48px' }}>
        <div style={{ fontSize: 11, color: COLOR.textMuted, letterSpacing: 1 }}>СХЕМА СБОРКИ</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: COLOR.text, margin: '8px 0 4px' }}>{modelName}</div>
        <div style={{ fontSize: 12, color: COLOR.textMuted, marginBottom: 24 }}>
          Дата: {new Date().toLocaleDateString('ru-RU')} · Деталей: {parts.length} · Узлов: {groups.length}
        </div>
        <div style={{ fontSize: 13, color: COLOR.text, marginBottom: 8, fontWeight: 600 }}>Состав модели:</div>
        {groups.map((g, gi) => (
          <div key={g.asm} style={{ display: 'flex', gap: 10, fontSize: 13, color: COLOR.text, padding: '4px 0', borderBottom: `1px solid ${COLOR.hairline}` }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', color: COLOR.accent, width: 24 }}>{gi + 1}.</span>
            <span style={{ flex: 1 }}>{g.asm || 'Модель'}</span>
            <span style={{ color: COLOR.textMuted }}>{g.partIds.length} дет.</span>
          </div>
        ))}
      </div>

      {/* узлы */}
      {groups.map((g, gi) => {
        const gp = groupParts(g);
        const hw = hardwareOf(gp);
        return (
          <div key={g.asm + gi} className="assembly-doc-page" style={{ padding: '32px 48px', borderTop: `1px solid ${COLOR.hairline}` }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: COLOR.text, marginBottom: 14 }}>
              {gi + 1}. {g.asm || 'Модель'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
              <AssemblyDrawing
                partsById={partsById}
                partIds={g.partIds}
                hoverId={hoverId}
                setHoverId={setHoverId}
                indexTitle={`${gi + 1}. ${g.asm || 'Модель'}`}
              />

              <div>
                {g.materials.map((mb, mi) => (
                  <div key={mi} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11.5, color: COLOR.textMuted, marginBottom: 4 }}>Материал: <b style={{ color: COLOR.text }}>{mb.mat}</b></div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                      <thead>
                        <tr style={{ borderBottom: `1.5px solid ${COLOR.text}` }}>
                          <th style={{ textAlign: 'left', padding: '3px 6px', width: 24 }}>№</th>
                          <th style={{ textAlign: 'left', padding: '3px 6px' }}>Обозн.</th>
                          <th style={{ textAlign: 'left', padding: '3px 6px' }}>Наименование</th>
                          <th style={{ textAlign: 'center', padding: '3px 6px', width: 34 }}>Кол.</th>
                          <th style={{ textAlign: 'left', padding: '3px 6px', whiteSpace: 'nowrap' }}>Размер, мм</th>
                          <th style={{ textAlign: 'left', padding: '3px 6px' }}>Инфо</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mb.rows.map((r, ri) => {
                          const hovered = r.partIds.includes(hoverId);
                          return (
                            <tr
                              key={ri}
                              onMouseEnter={() => setHoverId(r.partIds[0])}
                              onMouseLeave={() => setHoverId(null)}
                              style={{ background: hovered ? COLOR.accentDim : 'transparent', cursor: 'default', borderBottom: `1px solid ${COLOR.hairline}` }}
                            >
                              <td style={{ padding: '3px 6px', color: COLOR.textMuted, fontFamily: 'ui-monospace, monospace' }}>{ri + 1}</td>
                              <td style={{ padding: '3px 6px', fontFamily: 'ui-monospace, monospace', color: COLOR.accent }}>{r.des || '—'}</td>
                              <td style={{ padding: '3px 6px', color: COLOR.text }}>{r.name}</td>
                              <td style={{ padding: '3px 6px', textAlign: 'center', color: COLOR.text, fontFamily: 'ui-monospace, monospace' }}>{r.qty}</td>
                              <td style={{ padding: '3px 6px', color: COLOR.text, fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap' }}>{r.size}</td>
                              <td style={{ padding: '3px 6px', color: COLOR.textMuted, fontSize: 10.5 }}>
                                {r.paz ? 'Paz' : ''}{r.edge ? (r.paz ? ' · ' : '') + 'кромка: ' + r.edge : ''}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}

                {hw.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11.5, color: COLOR.textMuted, margin: '10px 0 4px' }}>Фурнитура</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                      <thead>
                        <tr style={{ borderBottom: `1.5px solid ${COLOR.text}` }}>
                          <th style={{ textAlign: 'left', padding: '3px 6px', width: 24 }}>№</th>
                          <th style={{ textAlign: 'left', padding: '3px 6px' }}>Наименование</th>
                          <th style={{ textAlign: 'center', padding: '3px 6px', width: 40 }}>Кол.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hw.map(([name, count], hi) => (
                          <tr key={hi} style={{ borderBottom: `1px solid ${COLOR.hairline}` }}>
                            <td style={{ padding: '3px 6px', color: COLOR.textMuted, fontFamily: 'ui-monospace, monospace' }}>{hi + 1}</td>
                            <td style={{ padding: '3px 6px', color: COLOR.text }}>{name}</td>
                            <td style={{ padding: '3px 6px', textAlign: 'center', color: COLOR.text, fontFamily: 'ui-monospace, monospace' }}>{count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <div style={{ padding: '16px 48px 32px', fontSize: 10.5, color: COLOR.textMuted, borderTop: `1px solid ${COLOR.hairline}` }}>
        Сгенерировано локально из JSON v3 (Базис) · наведение на строку подсвечивает деталь на чертеже
      </div>
    </div>
  );
}
