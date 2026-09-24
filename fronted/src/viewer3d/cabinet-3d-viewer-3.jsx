/* eslint-disable react-hooks/immutability -- компонент на three.js: сцена,
 * ref'ы (needsRenderRef, meshMapRef, animsOpenRef…) меняются императивно в
 * цикле рендера и эффектах — это осознанный паттерн, а не нарушение. */
import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { Layers3, RotateCw, Square, CheckSquare, Upload, X, Maximize2, Minimize2, PenTool, Ruler, FileText, Printer, Eye, EyeOff, Search, ChevronRight, ChevronDown } from 'lucide-react';
import AssemblyDoc from './schema-sborki-3.jsx';
import SpecSheet from './spec-sheet.jsx';
import { SchemeBar, SchemeSpec, SchemePrintSheet } from './schema-3d-ui.jsx';
import { parseDetalQR, isDetalQRData, decodeModelText } from './detalqr-adapter.js';

const COLOR = {
  bg: '#e6f0df',
  hairline: '#bfd3b3',
  text: '#25301f',
  textMuted: '#5c6c53',
  accent: '#b5701f',
  accentDim: '#d8e6cb',
};

function classifyKind(name) {
  const n = (name || '').toLowerCase();
  if (n.indexOf('фасад') >= 0 || n.indexOf('двер') >= 0) return 'facade';
  if (n.indexOf('полк') >= 0) return 'shelf';
  if (n.indexOf('задн') >= 0) return 'back';
  return 'corpus';
}

/* ================= v3: геометрия из контура + плейсмента ================= */

// Дуга -> точки (тот же шаг, что в экспорте: сегменты по 0.35 рад)
function arcPoints(e) {
  const r = Math.hypot(e.x1 - e.cx, e.y1 - e.cy);
  const a0 = Math.atan2(e.y1 - e.cy, e.x1 - e.cx);
  const a1 = Math.atan2(e.y2 - e.cy, e.x2 - e.cx);
  let da = a1 - a0;
  while (da <= -Math.PI) da += 2 * Math.PI;
  while (da > Math.PI) da -= 2 * Math.PI;
  const steps = Math.max(2, Math.min(16, Math.ceil(Math.abs(da) / 0.35)));
  const pts = [];
  for (let k = 0; k <= steps; k++) {
    const a = a0 + (da * k) / steps;
    pts.push([e.cx + r * Math.cos(a), e.cy + r * Math.sin(a)]);
  }
  return pts;
}

// Контур -> THREE.Shape (внешний путь + внутренние окружности как отверстия)
// элементы контура -> отдельные замкнутые обходы.
// У Базиса элементы лежат в любом порядке и направлении, а у полых сечений
// (труба 20х20х2) их вообще две петли: наружная и внутренняя. Сшиваем отрезки
// по совпадающим концам, петли НЕ склеиваем между собой.
function contourLoops(elems) {
  const same = (a, b) => Math.abs(a[0] - b[0]) < 5e-3 && Math.abs(a[1] - b[1]) < 5e-3;
  const chains = [];
  elems.forEach((e) => {
    if (e.t === 'line') chains.push([[e.x1, e.y1], [e.x2, e.y2]]);
    else if (e.t === 'arc') chains.push(arcPoints(e));
  });
  const used = new Array(chains.length).fill(false);
  const loops = [];
  for (let i = 0; i < chains.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let acc = chains[i].slice();
    for (let guard = 0; guard <= chains.length; guard++) {
      let changed = false;
      for (let j = 0; j < chains.length && !changed; j++) {
        if (used[j]) continue;
        const c = chains[j];
        const ae = acc[acc.length - 1], a0 = acc[0];
        if (same(ae, c[0])) acc = acc.concat(c.slice(1));
        else if (same(ae, c[c.length - 1])) acc = acc.concat(c.slice().reverse().slice(1));
        else if (same(a0, c[c.length - 1])) acc = c.slice(0, c.length - 1).concat(acc);
        else if (same(a0, c[0])) acc = c.slice().reverse().slice(0, c.length - 1).concat(acc);
        else continue;
        used[j] = true;
        changed = true;
      }
      if (!changed) break;
    }
    const cl = acc.filter((q, i2) => i2 === 0 || !same(acc[i2 - 1], q));
    if (cl.length >= 3) loops.push(cl);
  }
  return loops;
}

// площадь обхода по шнуровке (нужна, чтобы выбрать наружный контур)
function loopArea(pts) {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return s / 2;
}

function contourToShape(elems) {
  const shape = new THREE.Shape();
  const circles = elems.filter((e) => e.t === 'circle');
  const others = elems.filter((e) => e.t !== 'circle');
  if (!others.length && circles.length === 1) {
    // единственная окружность = круглую панель делаем через absarc
    shape.absarc(circles[0].cx, circles[0].cy, circles[0].r, 0, Math.PI * 2, false);
    return shape;
  }
  const loops = contourLoops(others);
  if (loops.length) {
    // самая большая петля — контур детали, остальные — отверстия в ней
    let bi = 0;
    for (let i = 1; i < loops.length; i++) {
      if (Math.abs(loopArea(loops[i])) > Math.abs(loopArea(loops[bi]))) bi = i;
    }
    const loop = loops[bi];
    shape.moveTo(loop[0][0], loop[0][1]);
    for (let i = 1; i < loop.length; i++) shape.lineTo(loop[i][0], loop[i][1]);
    shape.closePath();
    loops.forEach((lp, i) => {
      if (i === bi || lp.length < 3) return;
      const hole = new THREE.Path();
      hole.moveTo(lp[0][0], lp[0][1]);
      for (let k = 1; k < lp.length; k++) hole.lineTo(lp[k][0], lp[k][1]);
      hole.closePath();
      shape.holes.push(hole);
    });
  }
  // лишние окружности — внутренние вырезы
  for (let i = 0; i < circles.length; i++) {
    if (!others.length && i === 0) continue;
    const hole = new THREE.Path();
    hole.absarc(circles[i].cx, circles[i].cy, circles[i].r, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  // полигональные сквозные вырезы (формат detalQR: cuts с pts)
  elems.forEach((e) => {
    if (e.t !== 'hole' || !e.pts || e.pts.length < 3) return;
    const hole = new THREE.Path();
    e.pts.forEach((q, i) => { if (i === 0) hole.moveTo(q[0], q[1]); else hole.lineTo(q[0], q[1]); });
    const last = e.pts[e.pts.length - 1];
    if (Math.hypot(last[0] - e.pts[0][0], last[1] - e.pts[0][1]) > 1e-6) hole.closePath();
    shape.holes.push(hole);
  });
  return shape;
}

// Матрица панели из плейсмента: колонки = локальные оси в мире
function placementMatrix(pl) {
  const m = new THREE.Matrix4();
  m.makeBasis(
    new THREE.Vector3(pl.ax.x, pl.ax.y, pl.ax.z),
    new THREE.Vector3(pl.ay.x, pl.ay.y, pl.ay.z),
    new THREE.Vector3(pl.az.x, pl.az.y, pl.az.z)
  );
  m.setPosition(pl.origin.x, pl.origin.y, pl.origin.z);
  return m;
}

// Габариты контура в локальной плоскости
function contourBBox(elems) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x, y) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  };
  elems.forEach((e) => {
    if (e.t === 'line') { add(e.x1, e.y1); add(e.x2, e.y2); }
    else if (e.t === 'arc') { add(e.x1, e.y1); add(e.x2, e.y2); add(e.cx, e.cy); }
    else if (e.t === 'circle') { add(e.cx - e.r, e.cy - e.r); add(e.cx + e.r, e.cy + e.r); }
  });
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// Мировой bbox панели v3: 8 углов локального бокса через матрицу
function panelWorldBBox(part) {
  const bb = contourBBox(part.contour || []);
  if (!bb) return { x: 0, y: 0, z: 0, w: 0, h: 0, d: 0 };
  const m = placementMatrix(part.placement);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let cx = 0; cx <= 1; cx++) {
    for (let cy = 0; cy <= 1; cy++) {
      for (let cz = 0; cz <= 1; cz++) {
        const v = new THREE.Vector3(
          cx ? bb.maxX : bb.minX, cy ? bb.maxY : bb.minY, cz ? part.thickness : 0
        ).applyMatrix4(m);
        if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
        if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
      }
    }
  }
  return { x: minX, y: minY, z: minZ, w: maxX - minX, h: maxY - minY, d: maxZ - minZ };
}

// v3-часть -> плоская деталь для списка/выбора (режим 'panel3')
function v3ToDisplay(data) {
  const matColor = {};
  const matData = {};
  (data.materials || []).forEach((m) => {
    if (m.color && m.colorUse === 1) matColor[m.mat] = m.color;
    if (m.dataUrl) matData[m.mat] = { url: m.dataUrl, step: m.stepX || m.stepY || 600 };
  });
  return data.parts.map((p, idx) => {
    const bb = panelWorldBBox(p);
    const cbb = contourBBox(p.contour || []) || { w: 0, h: 0 };
    return {
      id: 'b' + idx,
      mode: 'panel3',
      name: p.des ? (p.des + ' — ' + p.name) : p.name,
      kind: p.kind || classifyKind(p.name),
      material: p.material || null,
      v3: p,
      matColor: matColor[p.material] || null,
      matData: matData[p.material] || null,
      x: bb.x, y: bb.y, z: bb.z, w: bb.w, h: bb.h, d: bb.d,
      faceW: cbb.w, faceH: cbb.h,
      butts: p.butts,
      holes: p.holes,
      pockets: p.pockets,
      profile_cuts: p.profile_cuts,
      bevel_raw: p.bevel_raw,
      plastics: p.plastics,
    };
  });
}

/* ================= парсер OBJ (как в v2) ================= */
function parseOBJ(text) {
  const flat = [];
  const objects = [];
  let current = null;

  const startObject = (name) => {
    current = { name: name || 'Объект ' + (objects.length + 1), tris: [] };
    objects.push(current);
  };
  startObject('Объект 1');

  const lines = text.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trim();
    if (!line || line[0] === '#') continue;
    const sp = line.indexOf(' ');
    if (sp === -1) continue;
    const tag = line.slice(0, sp);
    const rest = line.slice(sp + 1).trim();

    if (tag === 'v') {
      const n = rest.split(/\s+/).map(Number);
      flat.push(n[0], n[1], n[2]);
    } else if (tag === 'o' || tag === 'g') {
      if (current.tris.length > 0) startObject(rest);
      else current.name = rest || current.name;
    } else if (tag === 'f') {
      const toks = rest.split(/\s+/);
      const idxs = toks.map((t) => {
        let vi = parseInt(t.split('/')[0], 10);
        if (vi < 0) vi = flat.length / 3 + vi + 1;
        return vi;
      });
      for (let k = 1; k < idxs.length - 1; k++) {
        current.tris.push(idxs[0], idxs[k], idxs[k + 1]);
      }
    }
  }

  return objects
    .filter((o) => o.tris.length > 0)
    .map((o, idx) => {
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      const positions = new Float32Array(o.tris.length * 3);
      for (let t = 0; t < o.tris.length; t++) {
        const vi = o.tris[t] - 1;
        const x = flat[vi * 3], y = flat[vi * 3 + 1], z = flat[vi * 3 + 2];
        positions[t * 3] = x; positions[t * 3 + 1] = y; positions[t * 3 + 2] = z;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      return {
        id: 'o' + idx, mode: 'mesh', name: o.name, kind: classifyKind(o.name),
        positions, x: minX, y: minY, z: minZ, w: maxX - minX, h: maxY - minY, d: maxZ - minZ,
      };
    });
}

const KIND_COLOR = { corpus: 0xcbb28c, shelf: 0xd9c6a3, facade: 0xb38a52, back: 0x8f8f96 };

/* ================= размеры ================= */
function makeTextSprite(text, color) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = 54;
  ctx.font = `${fontSize}px ui-monospace, monospace`;
  const textWidth = ctx.measureText(text).width;
  canvas.width = Math.ceil(textWidth) + 24;
  canvas.height = fontSize + 24;
  ctx.font = `${fontSize}px ui-monospace, monospace`;
  ctx.fillStyle = 'rgba(247,245,238,0.92)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color || '#25301f';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 12, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.userData.aspect = canvas.width / canvas.height;
  sprite.renderOrder = 999;
  return sprite;
}

/* Кружок позиции для схемы сборки: номер на светлом круге. sizeAttenuation
 * выключен — кружок держит размер на экране и не «плывёт» при зуме; поэтому же
 * он попадает и в снимок для печати. */
function makeBadgeSprite(num, selected) {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 5, 0, Math.PI * 2);
  ctx.fillStyle = selected ? '#b5701f' : 'rgba(252,250,244,0.97)';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = selected ? '#8a5416' : '#3b3b36';
  ctx.stroke();
  ctx.fillStyle = selected ? '#fff' : '#23231f';
  ctx.font = 'bold 46px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), size / 2, size / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, sizeAttenuation: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.052, 0.052, 1);      // доля высоты кадра — ~37 px при 720p
  sprite.renderOrder = 1000;
  sprite.userData.badge = true;
  sprite.userData.num = num;
  return sprite;
}

function buildDimensionsGroup(minX, maxX, minY, maxY, minZ, maxZ) {
  const group = new THREE.Group();
  const overallSize = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  const margin = overallSize * 0.14;
  const tick = overallSize * 0.02;
  const lineMat = new THREE.LineBasicMaterial({ color: 0x25301f, depthTest: false });

  function addDimLine(p1, p2, label, tickAxis) {
    const pts = [p1.clone(), p2.clone()];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, lineMat);
    line.renderOrder = 998;
    group.add(line);

    [p1, p2].forEach((p) => {
      const a = p.clone(); const b = p.clone();
      if (tickAxis === 'y') { a.y -= tick; b.y += tick; }
      else if (tickAxis === 'x') { a.x -= tick; b.x += tick; }
      else { a.z -= tick; b.z += tick; }
      const tGeo = new THREE.BufferGeometry().setFromPoints([a, b]);
      const tLine = new THREE.Line(tGeo, lineMat);
      tLine.renderOrder = 998;
      group.add(tLine);
    });

    const mid = p1.clone().add(p2).multiplyScalar(0.5);
    const sprite = makeTextSprite(label);
    const textH = overallSize * 0.05;
    sprite.scale.set(textH * sprite.userData.aspect, textH, 1);
    sprite.position.copy(mid);
    group.add(sprite);
  }

  addDimLine(
    new THREE.Vector3(minX, minY - margin, minZ - margin),
    new THREE.Vector3(maxX, minY - margin, minZ - margin),
    Math.round(maxX - minX) + ' мм', 'y'
  );
  addDimLine(
    new THREE.Vector3(minX - margin, minY, minZ - margin),
    new THREE.Vector3(minX - margin, maxY, minZ - margin),
    Math.round(maxY - minY) + ' мм', 'x'
  );
  addDimLine(
    new THREE.Vector3(minX - margin, minY - margin, minZ),
    new THREE.Vector3(minX - margin, minY - margin, maxZ),
    Math.round(maxZ - minZ) + ' мм', 'y'
  );

  return group;
}

/* ============ «прокат» сечения вдоль сегментов (фасадные фрезы, запилы 45°) ============
 * Сечение — полигон [[s, depth]..] (s — поперёк пути, depth — от пласти A по толщине).
 * Для каждого сегмента траектории строим призму: два кольца вершин + стенки + торцы. */
function buildSweepGeometry(pl, segs, sec) {
  const o = new THREE.Vector3(pl.origin.x, pl.origin.y, pl.origin.z);
  const axv = new THREE.Vector3(pl.ax.x, pl.ax.y, pl.ax.z);
  const ayv = new THREE.Vector3(pl.ay.x, pl.ay.y, pl.ay.z);
  const azv = new THREE.Vector3(pl.az.x, pl.az.y, pl.az.z);
  const P = (px, py, sy) => new THREE.Vector3().copy(o)
    .addScaledVector(axv, px).addScaledVector(ayv, py).addScaledVector(azv, sy);

  const verts = [], idx = [];
  segs.forEach(([a, b]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy);
    if (L < 1e-6) return;
    const nx = -dy / L, ny = dx / L;
    const n = sec.length;
    const ringA = sec.map((q) => P(a[0] + nx * q[0], a[1] + ny * q[0], q[1]));
    const ringB = sec.map((q) => P(b[0] + nx * q[0], b[1] + ny * q[0], q[1]));
    const base = verts.length;
    ringA.forEach((v) => verts.push(v));
    ringB.forEach((v) => verts.push(v));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      idx.push(base + i, base + j, base + n + j, base + i, base + n + j, base + n + i);
    }
    // торцы — веером из центроида
    const ca = new THREE.Vector3(), cb = new THREE.Vector3();
    ringA.forEach((v) => ca.add(v)); ca.divideScalar(n);
    ringB.forEach((v) => cb.add(v)); cb.divideScalar(n);
    const i0 = verts.length; verts.push(ca); ringA.forEach((v) => verts.push(v));
    for (let i = 0; i < n; i++) idx.push(i0, i0 + 1 + i, i0 + 1 + ((i + 1) % n));
    const j0 = verts.length; verts.push(cb); ringB.forEach((v) => verts.push(v));
    for (let i = 0; i < n; i++) idx.push(j0, j0 + 1 + ((i + 1) % n), j0 + 1 + i);
  });
  if (!verts.length) return null;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(verts.length * 3);
  verts.forEach((v, i) => { pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* ============ размеры из TSize3D (v3: data.dims) ============ */
function buildDimsGroupFromData(dims) {
  const group = new THREE.Group();
  dims.forEach((d) => {
    if (!d.a || !d.b) return;
    const col = d.col ? new THREE.Color(d.col).getHex() : 0x25301f;
    const mat = new THREE.LineBasicMaterial({ color: col, depthTest: false });
    const A = new THREE.Vector3(d.a[0], d.a[1], d.a[2]);
    const B = new THREE.Vector3(d.b[0], d.b[1], d.b[2]);
    const addLine = (p1, p2) => {
      const g = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const ln = new THREE.Line(g, mat);
      ln.renderOrder = 998;
      group.add(ln);
    };
    addLine(A, B);
    if (d.ea) addLine(new THREE.Vector3(d.ea[0], d.ea[1], d.ea[2]), A);   // выносные
    if (d.eb) addLine(new THREE.Vector3(d.eb[0], d.eb[1], d.eb[2]), B);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const sprite = makeTextSprite((d.value != null ? d.value : '') + ' мм', d.col);
    const textH = Math.max(A.distanceTo(B) * 0.06, 14);
    sprite.scale.set(textH * sprite.userData.aspect, textH, 1);
    sprite.position.copy(mid);
    group.add(sprite);
  });
  return group;
}

const HOLE_PALETTE = ['#6fa8dc', '#e06666', '#a685e2', '#93c47d', '#f6b26b', '#d68a34'];

function hashColor(key) {
  let h = 0;
  const s = key || '';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return HOLE_PALETTE[h % HOLE_PALETTE.length];
}

/* Ракурс из файла (`view` — камера Базиса на момент выгрузки) -> параметры
 * орбиты вьюера. У TCamera3D (справочник API) есть ViewPosition и ViewDirection,
 * углов хватает, чтобы поставить камеру под тем же углом. Дистанцию оставляем
 * свою (вписанную в кадр): у Базиса она привязана к его окну и масштабу. */
function orbitFromView(view, center, fitRadius) {
  if (!view || typeof view !== 'object') return null;
  const vec3 = (v) => (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && isFinite(n)) ? v : null);
  const c = [center ? center[0] : 0, center ? center[1] : 0, center ? center[2] : 0];
  let dx = null, dy = null, dz = null;

  const dir = vec3(view.ViewDirection);
  if (dir && Math.hypot(dir[0], dir[1], dir[2]) > 1e-6) {
    // камера смотрит ВДОЛЬ ViewDirection → из цели в камеру = минус это направление
    dx = -dir[0]; dy = -dir[1]; dz = -dir[2];
  } else {
    const p = vec3(view.ViewPosition) || vec3(view.Position) || vec3(view.Eye) || vec3(view.Point);
    if (!p) return null;
    const t = vec3(view.Target) || vec3(view.Center) || vec3(view.LookAt) || c;
    dx = p[0] - t[0]; dy = p[1] - t[1]; dz = p[2] - t[2];
    c[0] = t[0]; c[1] = t[1]; c[2] = t[2];
  }
  if (!(Math.hypot(dx, dy, dz) > 1e-6)) return null;
  return {
    theta: Math.atan2(dx, dz),
    phi: Math.atan2(Math.hypot(dx, dz), dy),
    radius: fitRadius > 0 ? fitRadius : 2400,
    target: [c[0], c[1], c[2]],
  };
}

// отрезок ребра контура по индексу элемента (для кромок)
function segByElem(contour, elem) {
  if (!contour || elem === undefined || elem === null || elem < 0 || elem >= contour.length) return null;
  const e = contour[elem];
  if (e.t === 'line' || e.t === 'arc') return [[e.x1, e.y1], [e.x2, e.y2]];
  return null;
}

/* ---------- цвет для деталировки ----------
 * Базис, когда у материала не выбран цвет, отдаёт неоново-зелёный 0x00FF00 —
 * такой цвет нельзя показывать как «цвет кромки». Очень светлые кромки на
 * светлом фоне схемы не видны, поэтому их слегка затемняем. */
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r, g, b) {
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}
function mixHex(hex, target, k) {
  const c = hexToRgb(hex);
  if (!c) return hex;
  const t = hexToRgb(target) || { r: 255, g: 255, b: 255 };
  return rgbToHex(c.r + (t.r - c.r) * k, c.g + (t.g - c.g) * k, c.b + (t.b - c.b) * k);
}
function isPlaceholderGreen(hex) {
  const c = hexToRgb(hex);
  return !!c && c.r < 40 && c.g > 215 && c.b < 40;      // «неоновый зелёный» Базиса
}
function luminance(hex) {
  const c = hexToRgb(hex);
  return c ? (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255 : 1;
}
// цвет кромки для схемы: заглушку убираем, слишком светлое — затемняем
function edgeColorFor(hex, fallback) {
  if (!hex || isPlaceholderGreen(hex)) return { color: fallback, known: false };
  let c = hex;
  if (luminance(c) > 0.72) c = mixHex(c, '#000000', 0.25);
  return { color: c, known: true };
}

function PanelDiagram({ part, maxW = 172, maxH = 260, fontScale = 1, showLabels = false }) {
  if (!part.faceW || !part.faceH) return null;

  const scale = Math.min(maxW / part.faceW, maxH / part.faceH);
  const svgW = Math.max(part.faceW * scale, 20);
  const svgH = Math.max(part.faceH * scale, 20);

  // координаты отверстий в detalQR — абсолютные в локальной системе панели,
  // а контур может начинаться НЕ в нуле (например x: 423..887) — вычитаем
  // начало габарита контура, иначе все отверстия съезжают к краю схемы
  const cbb = (part.v3 && part.v3.contour && part.v3.contour.length)
    ? contourBBox(part.v3.contour)
    : { minX: 0, minY: 0 };

  const groups = {};
  part.holes.forEach((h) => {
    const name = h.fastenerName || h.name || 'крепёж';
    const key = name + '|' + h.diameter;
    if (!groups[key]) {
      groups[key] = { name, diameter: h.diameter, count: 0, color: h.color || hashColor(name) };
    }
    groups[key].count += 1;
  });

  const toX = (x) => (x - cbb.minX) * scale;
  const toY = (y) => svgH - (y - cbb.minY) * scale;

  // ---- контур детали (заливка цветом материала, вырезы — «дырками») ----
  const outlineD = (() => {
    const elems = (part.v3 && part.v3.contour) ? part.v3.contour : [];
    if (!elems.length) return null;
    const P = (x, y) => toX(x).toFixed(1) + ' ' + toY(y).toFixed(1);
    const sub = [];
    const circles = elems.filter((e) => e.t === 'circle');
    const others = elems.filter((e) => e.t !== 'circle');
    if (!others.length && circles.length === 1) {
      const c = circles[0];
      const pts = [];
      for (let i = 0; i < 28; i++) { const a = i / 28 * 2 * Math.PI; pts.push(P(c.cx + c.r * Math.cos(a), c.cy + c.r * Math.sin(a))); }
      sub.push('M' + pts.join(' L') + ' Z');
    } else {
      let d = '', started = false;
      others.forEach((e) => {
        if (e.t === 'line') {
          if (!started) { d += 'M' + P(e.x1, e.y1); started = true; }
          d += ' L' + P(e.x2, e.y2);
        } else if (e.t === 'arc') {
          arcPoints(e).forEach((q, i) => {
            if (i === 0 && !started) { d += 'M' + P(q[0], q[1]); started = true; }
            else d += ' L' + P(q[0], q[1]);
          });
        }
      });
      if (started) sub.push(d + ' Z');
    }
    circles.forEach((c, i) => {
      if (!others.length && i === 0) return;
      const pts = [];
      for (let k = 0; k < 24; k++) { const a = k / 24 * 2 * Math.PI; pts.push(P(c.cx + c.r * Math.cos(a), c.cy + c.r * Math.sin(a))); }
      sub.push('M' + pts.join(' L') + ' Z');
    });
    elems.filter((e) => e.t === 'hole').forEach((e) => {
      sub.push('M' + e.pts.map((q) => P(q[0], q[1])).join(' L') + ' Z');
    });
    return sub.join(' ');
  })();
  // панель светлее, чтобы цветные кромки читались
  const panelFill = part.matColor ? mixHex(part.matColor, '#ffffff', 0.6) : '#e9e4da';

  // пазы/фрезеровки
  const pockets = part.pockets || [];
  // кромки: сторона красится цветом своей кромки (как в деталировке detalQR),
  // а без цвета — цветом материала со штриховым контуром «цвет неизвестен»
  const edgeBands = (part.butts || []).map((b) => {
    const seg = b.seg || segByElem(part.v3 && part.v3.contour, b.elem);
    if (!seg || seg.length !== 2) return null;
    const e = edgeColorFor(b.col, part.matColor ? mixHex(part.matColor, '#ffffff', 0.15) : '#b9a888');
    return { seg, color: e.color, known: e.known, mat: b.mat, thick: b.thick };
  }).filter(Boolean);

  // легенда кромок: материал + цвет + сколько сторон
  const edgeLegend = (() => {
    const m = {};
    edgeBands.forEach((b) => {
      const key = (b.mat || 'кромка') + '|' + (b.thick || 0);
      if (!m[key]) m[key] = { mat: b.mat || 'кромка', thick: b.thick, color: b.color, known: b.known, count: 0 };
      m[key].count += 1;
    });
    return Object.values(m);
  })();

  return (
    <div>
      <svg width={svgW} height={svgH} style={{ background: '#e9e4da', border: `1px solid ${COLOR.hairline}`, display: 'block' }}>
        {/* деталь: заливка цветом материала, вырезы — сквозными «дырками» */}
        {outlineD && (
          <path d={outlineD} fill={panelFill} fillRule="evenodd" stroke="#8f8a80" strokeWidth={0.8} />
        )}
        {pockets.map((pk, i) => (pk.t === 'circle' ? (
          <circle key={'p' + i} cx={toX(pk.x)} cy={toY(pk.y)} r={Math.max(1.5, pk.r * scale)}
                  fill="rgba(92,74,42,0.22)" stroke="#5c4a2a" strokeWidth={0.7} strokeDasharray="2 1.5" />
        ) : (
          <polygon key={'p' + i} points={(pk.pts || []).map((q) => toX(q[0]).toFixed(1) + ',' + toY(q[1]).toFixed(1)).join(' ')}
                   fill="rgba(92,74,42,0.22)" stroke="#5c4a2a" strokeWidth={0.7} strokeDasharray="2 1.5" />
        )))}
        {/* кромки: цвет своей кромки; штрих — цвет в каталоге не задан */}
        {edgeBands.map((b, i) => (
          <line key={'e' + i}
                x1={toX(b.seg[0][0])} y1={toY(b.seg[0][1])} x2={toX(b.seg[1][0])} y2={toY(b.seg[1][1])}
                stroke={b.color} strokeWidth={Math.max(3, 3.2 * fontScale)}
                strokeDasharray={b.known ? undefined : '3 2'} opacity={0.95} />
        ))}
        {part.holes.map((h, i) => {
          // торцевые отверстия лежат на кромке — отступ по радиусу, чтобы
          // колечко оставалось видимым внутри поля схемы
          const r = h.diameter ? Math.max(2, Math.min(10, h.diameter / 5) * fontScale) : 3 * fontScale;
          const lx = h.faceX - cbb.minX;
          const ly = h.faceY - cbb.minY;
          const cx = Math.min(Math.max(lx * scale, r + 1), svgW - r - 1);
          const cy = svgH - Math.min(Math.max(ly * scale, r + 1), svgH - r - 1);
          const name = h.fastenerName || h.name || 'крепёж';
          const col = h.color || hashColor(name);
          const isT = h.side === 'T';   // торцевые — колечком на кромке контура
          return (
            <g key={i}>
              <circle
                cx={cx} cy={cy} r={r}
                fill={isT ? '#ffffff' : col}
                stroke={col}
                strokeWidth={isT ? Math.max(1.2, 1.5 * fontScale) : 0}
                opacity={0.95}
              />
              {showLabels && (
                <text x={cx + r + 3} y={cy + 3} fontSize={10} fill="#4a4640" fontFamily="ui-monospace, monospace">
                  {h.diameter ? 'Ø' + h.diameter : name}{isT && h.z !== undefined ? ' T' : ''}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ marginTop: 6 }}>
        {Object.values(groups).map((g, gi) => (
          <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5 * fontScale, padding: `${2 * fontScale}px 0` }}>
            <span style={{ width: 7 * fontScale, height: 7 * fontScale, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
            <span style={{ color: COLOR.text, flex: 1 }}>{g.name}{g.diameter ? ' Ø' + g.diameter : ''}</span>
            <span style={{ color: COLOR.textMuted, fontFamily: 'ui-monospace, monospace' }}>×{g.count}</span>
          </div>
        ))}
        {pockets.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5 * fontScale, padding: `${2 * fontScale}px 0` }}>
            <span style={{ width: 7 * fontScale, height: 7 * fontScale, background: 'rgba(92,74,42,0.35)', border: '1px dashed #5c4a2a', flexShrink: 0 }} />
            <span style={{ color: COLOR.text, flex: 1 }}>Паз/фрезеровка{[...new Set(pockets.map((x) => x.depth))].map((d) => ' ' + d + 'мм').join(',')}</span>
            <span style={{ color: COLOR.textMuted, fontFamily: 'ui-monospace, monospace' }}>×{pockets.length}</span>
          </div>
        )}
        {edgeLegend.map((e, i) => (
          <div key={'b' + i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5 * fontScale, padding: `${2 * fontScale}px 0` }}>
            <span style={{
              width: 7 * fontScale, height: 7 * fontScale, background: e.color, flexShrink: 0,
              border: e.known ? 'none' : '1px dashed #6b6b6b',
            }} />
            <span style={{ color: COLOR.text, flex: 1 }}>
              Кромка: {e.mat}{e.thick ? ` ${e.thick}мм` : ''}{e.known ? '' : ' (цвет не задан)'}
            </span>
            <span style={{ color: COLOR.textMuted, fontFamily: 'ui-monospace, monospace' }}>×{e.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= главный компонент ================= */
function CabinetViewer({ devModel, embedded = false } = {}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const meshMapRef = useRef({});
  const decorRef = useRef(null);          // цилиндры дырок + меши фурнитуры + пазы
  // детали по id и анимации модели — ссылками: цикл рендера живёт в замыкании
  // сетапа и не должен зависеть от устаревшего loadedJSON
  const partsByIdRef = useRef({});
  const animsRef = useRef([]);
  const dimGroupRef = useRef(null);
  const orbitRef = useRef({
    theta: 0.785, phi: 1.0, radius: 2400,
    thetaGoal: 0.785, phiGoal: 1.0,
    target: new THREE.Vector3(400, 500, 250),
    targetGoal: new THREE.Vector3(400, 500, 250),
    radiusGoal: 2400,
  });
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 });
  const rafRef = useRef(null);
  const fileInputRef = useRef(null);

  const [exploded, setExploded] = useState(false);
  // ---- схема сборки (3D): разлёт ползунком, кружки позиций, выноски, печать ----
  const [scheme, setScheme] = useState(false);
  const [schemeAsm, setSchemeAsm] = useState('');      // выбранный модуль ('' — все)
  const [explodeK, setExplodeK] = useState(1);         // 0..1.5 — насколько разнесены детали
  const [showPos, setShowPos] = useState(true);        // кружки позиций
  const [showLead, setShowLead] = useState(false);     // выноски (по умолчанию выкл — иначе паутина)
  const badgeGroupRef = useRef(null);                  // спрайты-кружки схемы
  const captureRef = useRef(null);                     // снимок кадра для печати
  const partCentersRef = useRef({});                   // id -> центр детали (мировые)
  const [printSheet, setPrintSheet] = useState(null);  // лист печати схемы
  const [selectedId, setSelectedId] = useState(null);
  const [checked, setChecked] = useState({});
  const [loadedJSON, setLoadedJSON] = useState(null);
  const [loadedOBJ, setLoadedOBJ] = useState(null);
  const [loadedFileName, setLoadedFileName] = useState('');
  const [loadError, setLoadError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [materialVisibility, setMaterialVisibility] = useState({});
  const [blueprintMode, setBlueprintMode] = useState(false);
  const [transparentMode, setTransparentMode] = useState(false);
  const [fullView, setFullView] = useState(false);   // 3D на весь экран: панели скрыты   // прозрачный вид: корпус виден насквозь, фурнитура — нет
  const [showDimensions, setShowDimensions] = useState(false);
  const [showHoles, setShowHoles] = useState(true);
  const [showFurn, setShowFurn] = useState(true);
  // выезжающая панель «Материалы и слои» поверх 3D (режим embedded — окно CRM).
  // Раскрыта по умолчанию: пользователь ждёт список материалов «слева» сразу.
  const [toolsOpen, setToolsOpen] = useState(true);
  // ракурс, с которого модель смотрели в БазИСе (поле `view` в выгрузке):
  // ставим его начальной камерой, кнопка «Как в БазИСе» возвращает после вращения
  const designViewRef = useRef(null);
  const [hasDesignView, setHasDesignView] = useState(false);
  // анимации (двери/ящики): индекс -> открыто. Клик по детали с анимацией
  // переключает её; кнопка в панели «Материалы» — все сразу.
  const [animsOpen, setAnimsOpen] = useState({});
  const animsOpenRef = useRef({});
  useEffect(() => { animsOpenRef.current = animsOpen; needsRenderRef.current = true; }, [animsOpen]);
  const animsList = (loadedJSON && Array.isArray(loadedJSON.anims)) ? loadedJSON.anims : [];
  const animsAnyOpen = Object.keys(animsOpen).some((k) => animsOpen[k]);
  const [showDoc, setShowDoc] = useState(false);
  const [showSpec, setShowSpec] = useState(false);
  const showDocRef = useRef(false);               // зеркало showDoc/showSpec для rAF-цикла
  const needsRenderRef = useRef(true);            // рендер по требованию: кадр нужен только при изменениях
  useEffect(() => { showDocRef.current = showDoc || showSpec; needsRenderRef.current = true; }, [showDoc, showSpec]);
  useEffect(() => {
    animsRef.current = (loadedJSON && Array.isArray(loadedJSON.anims)) ? loadedJSON.anims : [];
    needsRenderRef.current = true;
  }, [loadedJSON]);
  const [hiddenIds, setHiddenIds] = useState({});     // скрытые детали (глаз)
  const [hideFacades, setHideFacades] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [hoverId, setHoverId] = useState(null);       // наведение — подсветка в 3D
  // зеркала выделения для обработчиков сцены (эффект сцены не видит свежие state)
  const selectedIdRef = useRef(null);
  const hoverIdRef = useRef(null);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { hoverIdRef.current = hoverId; }, [hoverId]);
  const [collapsedAsm, setCollapsedAsm] = useState({});

  const isLoaded = !!loadedJSON || !!loadedOBJ;
  const isV3 = !!(loadedJSON && (loadedJSON.version === 3 || loadedJSON.source === 'bazis-model-export-v3'));
  const isDetalQR = !!(loadedJSON && loadedJSON.source === 'detalqr-model' && loadedJSON.displayParts);

  // детали считаем один раз на источник данных, а не на каждый рендер —
  // иначе любой hover в списке пересоздаёт массив и перерисовывает всё.
  // Модель не загружена — пустой список (на странице только загрузка).
  const parts = useMemo(
    () => loadedOBJ
      ? loadedOBJ
      : loadedJSON
        ? (loadedJSON.displayParts ? loadedJSON.parts
          : isV3 ? v3ToDisplay(loadedJSON) : loadedJSON.parts.map((p, idx) => ({ id: 'b' + idx, mode: 'box', holes: [], ...p })))
        : [],
    [loadedOBJ, loadedJSON, isV3]
  );

  useEffect(() => {
    const m = {};
    (parts || []).forEach((p) => { m[p.id] = p; });
    partsByIdRef.current = m;
  }, [parts]);

  const NO_MATERIAL_KEY = '__none__';
  const materialKey = (p) => p.material || NO_MATERIAL_KEY;
  const [isolatedId, setIsolatedId] = useState(null);
  const isPartVisible = (p) => {
    if (isolatedId) return p.id === isolatedId;
    if (hiddenIds[p.id]) return false;
    if (hideFacades && p.kind === 'facade') return false;
    return materialVisibility[materialKey(p)] !== false;
  };

  const unhideAll = () => { setHiddenIds({}); setHideFacades(false); };

  const materialsList = (() => {
    const map = {};
    parts.forEach((p) => {
      const key = materialKey(p);
      if (!map[key]) map[key] = { key, label: p.material || 'без материала', count: 0 };
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  })();

  const showOnlyMaterial = (key) => {
    const next = {};
    materialsList.forEach((m) => { next[m.key] = m.key === key; });
    setMaterialVisibility(next);
  };
  const showAllMaterials = () => setMaterialVisibility({});
  const toggleMaterial = (key) => {
    setMaterialVisibility((prev) => ({ ...prev, [key]: prev[key] === false ? true : false }));
  };

  // Общие инструменты модели: видимость отверстий/фурнитуры и фильтр по материалам.
  // Живут в левой панели (обычный режим) и в выезжающей панели поверх 3D (embedded — окно CRM).
  const modelToolsBlock = (
    <>
      {(isV3 || isDetalQR) && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, marginBottom: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showHoles} onChange={(e) => setShowHoles(e.target.checked)} />
            Отверстия
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={showFurn} onChange={(e) => setShowFurn(e.target.checked)} />
            Фурнитура
          </label>
        </div>
      )}
      {animsList.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => {
              const next = {};
              const anyOpen = animsList.some((_, i) => animsOpen[i]);
              animsList.forEach((_, i) => { next[i] = !anyOpen; });
              setAnimsOpen(next);
            }}
            style={{
              width: '100%', padding: '6px 8px', fontSize: 12, cursor: 'pointer',
              background: animsAnyOpen ? COLOR.accent : 'transparent',
              color: animsAnyOpen ? '#fff' : COLOR.accent,
              border: `1px solid ${COLOR.accent}`,
            }}
            title="Открыть или закрыть все двери и ящики модели (или кликайте по ним в 3D)"
          >
            {animsAnyOpen ? 'Закрыть двери и ящики' : 'Открыть двери и ящики'}
          </button>
          <div style={{ fontSize: 10.5, color: COLOR.textMuted, marginTop: 4 }}>
            или клик по двери/ящику в 3D
          </div>
        </div>
      )}

      {materialsList.length > 1 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: COLOR.textMuted, letterSpacing: 0.2 }}>Материалы</span>
            <span onClick={showAllMaterials} style={{ fontSize: 10.5, color: COLOR.accent, cursor: 'pointer' }}>
              показать все
            </span>
          </div>
          {materialsList.map((m) => {
            const visible = materialVisibility[m.key] !== false;
            return (
              <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 12 }}>
                <span
                  onClick={() => toggleMaterial(m.key)}
                  style={{ color: visible ? COLOR.accent : COLOR.textMuted, cursor: 'pointer', flexShrink: 0 }}
                >
                  {visible ? <CheckSquare size={14} /> : <Square size={14} />}
                </span>
                <span
                  onClick={() => toggleMaterial(m.key)}
                  style={{
                    flex: 1, cursor: 'pointer', minWidth: 0,
                    color: visible ? COLOR.text : COLOR.textMuted,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                  title={m.label}
                >
                  {m.label}
                </span>
                <span style={{ fontSize: 10.5, color: COLOR.textMuted, fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>
                  {m.count}
                </span>
                <span
                  onClick={() => showOnlyMaterial(m.key)}
                  style={{ fontSize: 10, color: COLOR.accent, cursor: 'pointer', flexShrink: 0 }}
                >
                  только
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  const visibleParts = parts.filter(isPartVisible);

  const unloadModel = () => {
    setLoadedJSON(null);
    setLoadedOBJ(null);
    setLoadError('');
    setMaterialVisibility({});
    setIsolatedId(null);
  };

  const processFile = useCallback((file) => {
    if (!file) return;
    const isObj = /\.obj$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const buf = reader.result;
        // Базис часто сохраняет текст в Windows-1251: пробуем UTF-8,
        // при символах-заменителях перечитываем как cp1251.
        const text = decodeModelText(buf);

        if (isObj) {
          const objs = parseOBJ(text);
          if (!objs.length) {
            setLoadError('В OBJ-файле не найдено ни одной детали с гранями.');
            return;
          }
          setLoadError('');
          setLoadedJSON(null);
          setLoadedOBJ(objs);
          setLoadedFileName(file.name);
        } else {
          let data = JSON.parse(text);
          if (isDetalQRData(data)) data = parseDetalQR(data);   // формат detalQR (info+panels) -> внутренний
          if (!data || !Array.isArray(data.parts) || !data.parts.length) {
            setLoadError('В файле нет списка деталей ("parts").');
            return;
          }
          setLoadError('');
          setLoadedOBJ(null);
          setLoadedJSON(data);
          setLoadedFileName(data.info && data.info.name ? data.info.name : file.name);
        }
        setSelectedId(null);
        setExpandedId(null);
        setChecked({});
        setMaterialVisibility({});
        setIsolatedId(null);
        setHiddenIds({});
        setHideFacades(false);
        setSearchQ('');
        setCollapsedAsm({});
      } catch (err) {
        setLoadError('Не удалось прочитать файл: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleFile = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    processFile(file);
    e.target.value = '';
  }, [processFile]);

  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    if (!/\.(json|obj)$/i.test(file.name)) {
      setLoadError('Поддерживаются только файлы .json и .obj');
      return;
    }
    processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  // автозагрузка модели при старте (для локального запуска/тестов)
  useEffect(() => {
    if (devModel && devModel.parts) {
      setLoadedJSON(devModel);
      setLoadedFileName((devModel.info && devModel.info.name) || 'Модель');
    }
  }, []);

  /* ---------- сцена / камера / ввод (однократно) ---------- */
  useEffect(() => {
    const mount = mountRef.current;
    const w = mount.clientWidth;
    const h = 480;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLOR.bg);
    sceneRef.current = scene;
    // снимок текущего кадра для листа печати (рендер перед чтением — тогда
    // preserveDrawingBuffer не нужен, а кадр гарантированно свежий)
    captureRef.current = () => {
      try { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); }
      catch (e) { return null; }
    };

    const camera = new THREE.PerspectiveCamera(38, w / h, 10, 20000);

    // детектор софтверного OpenGL: без аппаратного GPU MSAA/Retina не потянут
    let softwareGL = false;
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl') || probe.getContext('experimental-webgl');
      if (gl) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        const name = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
        softwareGL = /swiftshader|llvmpipe|softpipe|software|basic render|angle \(google/i.test(name);
      }
    } catch (e) { /* зонд не удался — рендерим как обычно */ }

    const renderer = new THREE.WebGLRenderer({ antialias: !softwareGL });
    renderer.setSize(w, h);
    // софтверный WebGL (SwiftShader и т.п.) — pixelRatio 2 и MSAA там катастрофически
    // медленные: 64 меша фурнитуры × 60 fps намертво вешали вкладку
    renderer.setPixelRatio(softwareGL ? 1 : Math.min(window.devicePixelRatio, 2));
    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.65);
    dir1.position.set(600, 900, 700);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.25);
    dir2.position.set(-500, 300, -400);
    scene.add(dir2);

    const grid = new THREE.GridHelper(3000, 30, 0x8fa583, 0xa8bc9d);
    grid.position.y = -1;
    scene.add(grid);

    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();

    const onDown = (e) => {
      dragRef.current.dragging = true;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      dragRef.current.moved = 0;
      needsRenderRef.current = true;
    };
    const onMove = (e) => {
      if (!dragRef.current.dragging) return;
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      dragRef.current.moved = (dragRef.current.moved || 0) + Math.abs(dx) + Math.abs(dy);
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      const o = orbitRef.current;
      o.theta -= dx * 0.006;
      o.phi = Math.max(0.15, Math.min(Math.PI - 0.15, o.phi - dy * 0.006));
      // ручной поворот отменяет плавный переход к виду
      o.thetaGoal = o.theta;
      o.phiGoal = o.phi;
      needsRenderRef.current = true;
    };
    const onUp = (e) => {
      dragRef.current.dragging = false;
      if ((dragRef.current.moved || 0) < 6) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNDC, camera);

        const entries = Object.entries(meshMapRef.current).filter(([, m]) => m.mesh.visible);
        const meshes = entries.map(([, m]) => m.mesh);
        const hits = raycaster.intersectObjects(meshes, false);

        if (hits.length > 0) {
          const found = entries.find(([, m]) => m.mesh === hits[0].object);
          if (found) {
            // дверь/ящик с анимацией: клик открывает/закрывает, а не выделяет
            const hitPart = partsByIdRef.current ? partsByIdRef.current[found[0]] : null;
            const ai = hitPart && typeof hitPart.anim === 'number' ? hitPart.anim : -1;
            if (ai >= 0) setAnimsOpen((prev) => ({ ...prev, [ai]: !prev[ai] }));
            else setSelectedId((prev) => (prev === found[0] ? null : found[0]));
          }
        }
      }
      dragRef.current.moved = 0;
    };
    const onWheel = (e) => {
      e.preventDefault();
      const o = orbitRef.current;
      o.radius = Math.max(200, Math.min(8000, o.radius * (1 + e.deltaY * 0.001)));
      o.radiusGoal = o.radius;
      needsRenderRef.current = true;
    };

    renderer.domElement.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    // двойной клик — «обзор детали»: камера подлетает к выделенной/подсвеченной
    const onDbl = () => {
      const id = selectedIdRef.current || hoverIdRef.current;
      if (!id) return;
      const p = partsByIdRef.current ? partsByIdRef.current[id] : null;
      if (!p) return;
      orbitRef.current.targetGoal.set(p.x + p.w / 2, p.y + p.h / 2, p.z + p.d / 2);
      orbitRef.current.radiusGoal = Math.max(p.w, p.h, p.d, 50) * 2.2;
      needsRenderRef.current = true;
    };
    renderer.domElement.addEventListener('dblclick', onDbl);
    window.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      // пока открыта схема сборки — 3D за полноэкранным оверлеем не рендерим
      if (showDocRef.current) return;
      const o = orbitRef.current;

      // рендер по требованию: рисуем кадр только если что-то изменилось
      // (иначе 60 fps вхолостую — на софтверном GL с фурнитурой это вешает вкладку)
      const camMoving = o.target.distanceTo(o.targetGoal) > 0.05
        || Math.abs(o.radius - o.radiusGoal) > 0.05
        || Math.abs(o.theta - o.thetaGoal) > 0.002 || Math.abs(o.phi - o.phiGoal) > 0.002
        || o.theta !== lastCam.theta || o.phi !== lastCam.phi || o.radius !== lastCam.radius;
      let partsMoving = false;
      const map = meshMapRef.current;
      for (const id in map) {
        if (map[id].group.position.distanceToSquared(map[id].moveTarget) > 0.0025) { partsMoving = true; break; }
      }
      if (!needsRenderRef.current && !camMoving && !partsMoving) return;

      o.target.lerp(o.targetGoal, 0.12);
      o.radius += (o.radiusGoal - o.radius) * 0.12;
      // плавный переход к выбранному виду (сверху/спереди/сбоку/изометрия)
      o.theta += (o.thetaGoal - o.theta) * 0.15;
      o.phi += (o.phiGoal - o.phi) * 0.15;
      const x = o.target.x + o.radius * Math.sin(o.phi) * Math.sin(o.theta);
      const y = o.target.y + o.radius * Math.cos(o.phi);
      const z = o.target.z + o.radius * Math.sin(o.phi) * Math.cos(o.theta);
      camera.position.set(x, y, z);
      camera.lookAt(o.target);
      lastCam.theta = o.theta; lastCam.phi = o.phi; lastCam.radius = o.radius;

      const openMap = animsOpenRef.current || {};
      const anims = animsRef.current;
      Object.keys(map).forEach((id) => {
        const m = map[id];
        m.group.position.lerp(m.moveTarget, 0.15);

        // --- анимация детали (дверь/ящик): поворот вокруг оси + смещение ---
        const part = partsByIdRef.current ? partsByIdRef.current[id] : null;
        const ai = part && typeof part.anim === 'number' ? part.anim : -1;
        const a = (anims && ai >= 0) ? anims[ai] : null;
        if (!a) {
          if (m.animP) { m.animP = 0; m.mesh.quaternion.set(0, 0, 0, 1); }
          return;
        }
        const target = openMap[ai] ? 1 : 0;
        if (m.animP === undefined) m.animP = 0;
        if (Math.abs(m.animP - target) > 0.0005) {
          m.animP += (target - m.animP) * 0.18;
          if (Math.abs(m.animP - target) <= 0.0005) m.animP = target;
        }
        const p = m.animP;
        if (p <= 0.0005) {
          m.mesh.quaternion.set(0, 0, 0, 1);
          m.mesh.position.copy(m.restPos);
          return;
        }
        const A = animAxisA.copy(new THREE.Vector3(a.ax[0], a.ax[1], a.ax[2]));
        const B = animAxisB.copy(new THREE.Vector3(a.bx[0], a.bx[1], a.bx[2]));
        const dir = animAxisD.copy(B).sub(A);
        if (dir.lengthSq() < 1e-6) { m.mesh.quaternion.set(0, 0, 0, 1); return; }
        dir.normalize();
        const angRad = (Number(a.ang) || 0) * Math.PI / 180 * p;   // DoorAngle в градусах
        const shift = (Number(a.shift) || 0) * p;
        const rest = m.restPos;                                     // позиция покоя детали
        animTmp.copy(rest).sub(A);
        animQuat.setFromAxisAngle(dir, angRad);
        animTmp.applyQuaternion(animQuat);
        m.mesh.position.copy(A).add(animTmp).addScaledVector(dir, shift);
        m.mesh.quaternion.copy(animQuat);
      });
      // пока анимация не доехала — кадры нужны дальше
      for (const id in map) {
        const m = map[id];
        if (m.animP !== undefined) {
          const part = partsByIdRef.current ? partsByIdRef.current[id] : null;
          const ai = part && typeof part.anim === 'number' ? part.anim : -1;
          const t = (ai >= 0 && openMap[ai]) ? 1 : 0;
          if (Math.abs((m.animP || 0) - t) > 0.0006) { partsMoving = true; break; }
        }
      }

      // кружки позиций и выноски — за деталями (в схеме сборки)
      const badges = badgeGroupRef.current;
      if (badges) {
        badges.children.forEach((o) => {
          const id = o.userData.partId;
          const c = partCentersRef.current[id];
          const mm = map[id];
          if (!c || !mm) return;
          const off = mm.badgeOffset || badgeZero;
          if (o.userData.lead) {
            const at = o.geometry.attributes.position;
            at.setXYZ(0, c.x + mm.group.position.x + off.x, c.y + mm.group.position.y + off.y, c.z + mm.group.position.z + off.z);
            at.setXYZ(1, c.x + mm.group.position.x, c.y + mm.group.position.y, c.z + mm.group.position.z);
            at.needsUpdate = true;
          } else {
            o.position.set(c.x + mm.group.position.x + off.x, c.y + mm.group.position.y + off.y, c.z + mm.group.position.z + off.z);
          }
        });
      }

      renderer.render(scene, camera);
      needsRenderRef.current = false;
    };
    const badgeZero = new THREE.Vector3();
    const animAxisA = new THREE.Vector3(), animAxisB = new THREE.Vector3();
    const animAxisD = new THREE.Vector3(), animTmp = new THREE.Vector3();
    const animQuat = new THREE.Quaternion();
    const lastCam = { theta: NaN, phi: NaN, radius: NaN }; // для детекта ручного поворота
    animate();

    const onResize = () => {
      const ww = mount.clientWidth;
      const hh = mount.clientHeight || h;   // в полноэкранном режиме высота контейнера
      camera.aspect = ww / hh;
      camera.updateProjectionMatrix();
      renderer.setSize(ww, hh);
      needsRenderRef.current = true;
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, []);

  /* ---------- построение мешей деталей ---------- */
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    Object.values(meshMapRef.current).forEach(({ mesh, edges }) => {
      scene.remove(mesh);
      scene.remove(edges);
      mesh.geometry.dispose();
      mesh.material.dispose();
      edges.geometry.dispose();
      edges.material.dispose();
    });
    meshMapRef.current = {};

    // декор-группа: дырки-цилиндры + фурнитура + пазы (перестраивается целиком)
    if (decorRef.current) {
      decorRef.current.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      scene.remove(decorRef.current);
    }
    const decor = new THREE.Group();
    decorRef.current = decor;
    scene.add(decor);
    // группы деталей (id -> THREE.Group): в них меш и ВЕСЬ декор этой детали,
    // чтобы разлёт/анимация двигали деталь вместе с присадкой и крепежом
    const partGroups = {};
    // центры деталей — нужны, чтобы привязать фурнитуру к «своей» детали
    const partCenters = {};
    partCentersRef.current = partCenters;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    parts.forEach((p) => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + p.w);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y + p.h);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z + p.d);
    });
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;

    parts.forEach((p) => {
      let geo, restX, restY, restZ;

      if (p.mode === 'panel3') {
        // ---- панель v3: контур + выдавливание на толщину + матрица ----
        // отрицательная толщина = погонаж выдавливается В ОБРАТНУЮ сторону
        // (у Базиса труба-нога может «расти» вниз от точки вставки)
        const shape = contourToShape(p.v3.contour || []);
        geo = new THREE.ExtrudeGeometry(shape, { depth: Math.abs(p.v3.thickness), bevelEnabled: false, curveSegments: 16 });
        if (p.v3.thickness < 0) geo.translate(0, 0, p.v3.thickness);
        const m = placementMatrix(p.v3.placement);
        geo.applyMatrix4(m);
        // позиция покоя = 0 (геометрия уже в мировых координатах)
        restX = 0; restY = 0; restZ = 0;
      } else if (p.mode === 'mesh') {
        geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
        geo.computeVertexNormals();
        restX = 0; restY = 0; restZ = 0;
      } else {
        geo = new THREE.BoxGeometry(p.w, p.h, p.d);
        restX = p.x + p.w / 2;
        restY = p.y + p.h / 2;
        restZ = p.z + p.d / 2;
      }

      const baseColor = p.matColor ? new THREE.Color(p.matColor).getHex() : (KIND_COLOR[p.kind] || 0xcccccc);
      const color = baseColor;
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide });
      // реальная текстура материала (dataUrl из экспорта), масштаб — шаг (Шаг, мм)
      if (p.mode === 'panel3' && p.matData) {
        new THREE.TextureLoader().load(p.matData.url, (tex) => {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          const step = p.matData.step || 600;
          tex.repeat.set(1 / step, 1 / step);
          mat.map = tex;
          mat.color.set(0xffffff);
          mat.needsUpdate = true;
          needsRenderRef.current = true;   // текстура подгрузилась позже — обновить кадр
        });
      }
      const mesh = new THREE.Mesh(geo, mat);
      // ГРУППА ДЕТАЛИ: меш + её декор (отверстия, кромка-лента, пазы, облицовка).
      // Декор лежит в мировых координатах, поэтому группу держим в нуле и везём
      // по разлёту только её: меш со своими координатами не трогаем, а присадка
      // и крепёж едут вместе с деталью, а не висят в воздухе.
      const group = new THREE.Group();
      group.add(mesh);
      scene.add(group);
      partGroups[p.id] = group;
      mesh.position.set(restX, restY, restZ);

      const edgesGeo = new THREE.EdgesGeometry(geo, 25);
      const edgesMat = new THREE.LineBasicMaterial({ color: 0x141416 });
      const edges = new THREE.LineSegments(edgesGeo, edgesMat);
      // кромки — ДЕТИ меша: следуют за ним при разлёте и анимации дверей.
      // Геометрия у обеих миров, поэтому смещение ребёнка = 0.
      mesh.add(edges);
      edges.position.set(0, 0, 0);

      // Разлёт: для panel3/mesh смещение по мировому положению bbox-центра
      const bcx = p.x + p.w / 2, bcy = p.y + p.h / 2;
      let delta = new THREE.Vector3(0, 0, 0);
      if (p.kind === 'back') delta.z = 200;
      else if (p.kind === 'facade') delta.z = -260;
      else if (p.kind === 'shelf') delta.y = (bcy < cy ? -1 : 1) * 220;
      else {
        const minDim = Math.min(p.w, p.h, p.d);
        if (minDim === p.w) delta.x = (bcx < cx ? -1 : 1) * 260;
        else if (minDim === p.h) delta.y = (bcy < cy ? -1 : 1) * 220;
        else delta.z = -200;
      }

      const restPos = new THREE.Vector3(restX, restY, restZ);
      const explodedPos = restPos.clone().add(delta);

      // радиальный разлёт (для схемы сборки): от центра модуля наружу.
      // Считаем здесь, но применяем только в режиме схемы
      partCenters[p.id] = new THREE.Vector3(p.x + p.w / 2, p.y + p.h / 2, p.z + p.d / 2);

      meshMapRef.current[p.id] = {
        group, mesh, edges, restPos, explodedPos,
        // moveTarget — куда едет ГРУППА (0 при собранной модели)
        moveTarget: new THREE.Vector3(0, 0, 0),
        delta: delta.clone(),
        deltaRadial: delta.clone(),
        normalColor: color,
      };

      // ---- облицовка пласти (Plastics): второй слой на пласти ----
      if (p.mode === 'panel3' && p.plastics && p.plastics.length) {
        p.plastics.forEach((pl) => {
          if (!pl.thick) return;
          try {
            const shape = contourToShape(p.v3.contour || []);
            const geo = new THREE.ExtrudeGeometry(shape, { depth: pl.thick, bevelEnabled: false, curveSegments: 12 });
            const m = placementMatrix(p.v3.placement);
            // side: 1 = задняя пласть (−Z), 0 = передняя (+Z)
            const zOff = pl.side === 1 ? -pl.thick : p.v3.thickness;
            m.multiply(new THREE.Matrix4().makeTranslation(0, 0, zOff));
            geo.applyMatrix4(m);
            const mesh2 = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
              color: 0xd8cdb8, roughness: 0.8, metalness: 0.02, side: THREE.DoubleSide,
            }));
            mesh2.userData.plastic = true;
            mesh2.userData.partId = p.id;
            group.add(mesh2);
          } catch (e) { /* контур не построился — пропускаем слой */ }
        });
      }

      // ---- фасадные фрезы (profile_cuts): призма по сечению+траектории ----
      if (p.mode === 'panel3' && p.profile_cuts && p.profile_cuts.length) {
        p.profile_cuts.forEach((pc) => {
          const geo = buildSweepGeometry(p.v3.placement, [[pc.a, pc.b]], pc.sec);
          if (!geo) return;
          const mesh3 = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            color: 0x6b5a45, roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide,
          }));
          mesh3.userData.sweep = true;
          mesh3.userData.partId = p.id;
          group.add(mesh3);
        });
      }

      // ---- запилы 45° (bevel_raw): та же призма по треугольному сечению ----
      if (p.mode === 'panel3' && p.bevel_raw && p.bevel_raw.length) {
        p.bevel_raw.forEach((bv) => {
          const geo = buildSweepGeometry(p.v3.placement, bv.traj, bv.sect);
          if (!geo) return;
          const mesh4 = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            color: 0x8a7a5f, roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide,
          }));
          mesh4.userData.sweep = true;
          mesh4.userData.partId = p.id;
          group.add(mesh4);
        });
      }
    });

    // ---- отверстия-цилиндры (мировые координаты; v3 и detalQR) ----
    if ((isV3 || isDetalQR) && loadedJSON.holes) {
      loadedJSON.holes.forEach((h, i) => {
        if (!h.p || !h.d || !h.r) return;
        // длина — как в модели: короткие присадки (2 мм) НЕ растягиваем,
        // иначе цилиндр вылезает из панели наружу
        const len = h.len > 0.5 ? h.len : 8;
        const geo = new THREE.CylinderGeometry(h.r, h.r, len, 12);
        const col = h.color ? new THREE.Color(h.color) : new THREE.Color(hashColor(h.name || 'крепёж'));
        const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.3 });
        const mesh = new THREE.Mesh(geo, m);
        const dir = new THREE.Vector3(h.d[0], h.d[1], h.d[2]).normalize();
        // цилиндр чуть выступает из грани (0.35 мм) — иначе колпачок лежит
        // вровень с пластью/кромкой и пропадает в z-файтинге
        const pos = new THREE.Vector3(h.p[0], h.p[1], h.p[2])
          .addScaledVector(dir, len / 2 - 0.35);
        mesh.position.copy(pos);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        mesh.userData.hole = true;
        if (h.pid) mesh.userData.partId = h.pid;   // привязка к детали (detalQR)
        if (partGroups[h.pid || p.id]) partGroups[h.pid || p.id].add(mesh); else decor.add(mesh);
      });
    }

    // куда положить фурнитуру/крепёж: в группу ближайшей детали СВОЕГО узла,
    // чтобы при разлёте и открытии двери она уезжала вместе с деталью.
    // Сначала пробуем «дверь + узел», потом только узел, потом вообще ближайшую.
    const nearestGroup = (point, gid, animIdx) => {
      const pick = (useAnim, useGid) => {
        let best = null, bestD = Infinity;
        for (const id in partCenters) {
          const pp = partsByIdRef.current ? partsByIdRef.current[id] : null;
          if (!pp) continue;
          if (useGid && gid && pp.v3 && pp.v3.asmGid && pp.v3.asmGid !== gid) continue;
          if (useAnim && animIdx >= 0 && pp.anim !== animIdx) continue;
          const d = partCenters[id].distanceToSquared(point);
          if (d < bestD) { bestD = d; best = partGroups[id]; }
        }
        return best;
      };
      return pick(true, true) || pick(false, true) || pick(false, false) || decor;
    };

    // ---- меши фурнитуры (v3 furn и detalQR fittings) ----
    if ((isV3 || isDetalQR) && loadedJSON.furn) {
      loadedJSON.furn.forEach((f) => {
        if (!f.verts || !f.tris || !f.tris.length) return;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(f.verts.length * 3);
        f.verts.forEach((v, i) => { pos[i * 3] = v[0]; pos[i * 3 + 1] = v[1]; pos[i * 3 + 2] = v[2]; });
        const idx = new Uint32Array(f.tris.length * 3);
        f.tris.forEach((t, i) => { idx[i * 3] = t[0]; idx[i * 3 + 1] = t[1]; idx[i * 3 + 2] = t[2]; });
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        // текстура поверхности фурнитуры: UV приходят по треугольникам, поэтому
        // геометрию разворачиваем в неиндексированную (вершины не делятся между гранями)
        const hasUV = f.uv && f.matData && f.uv.length === f.tris.length * 3;
        if (hasUV) {
          const p2 = new Float32Array(f.tris.length * 9);
          const t2 = new Float32Array(f.tris.length * 6);
          f.tris.forEach((t, i) => {
            for (let k = 0; k < 3; k++) {
              const v = f.verts[t[k]];
              p2[i * 9 + k * 3] = v[0]; p2[i * 9 + k * 3 + 1] = v[1]; p2[i * 9 + k * 3 + 2] = v[2];
              t2[i * 6 + k * 2] = f.uv[i * 3 + k][0]; t2[i * 6 + k * 2 + 1] = f.uv[i * 3 + k][1];
            }
          });
          geo.setAttribute('position', new THREE.BufferAttribute(p2, 3));
          geo.setAttribute('uv', new THREE.BufferAttribute(t2, 2));
        } else {
          geo.setIndex(new THREE.BufferAttribute(idx, 1));
        }
        geo.computeVertexNormals();
        const baseCol = f.color ? new THREE.Color(f.color) : new THREE.Color(0x8a8f98);
        const m = new THREE.MeshStandardMaterial({ color: baseCol, roughness: 0.35, metalness: 0.7, flatShading: true });
        if (hasUV) {
          new THREE.TextureLoader().load(f.matData.url, (tex) => {
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            m.map = tex;
            m.color = new THREE.Color(0xffffff);
            m.needsUpdate = true;
            needsRenderRef.current = true;
          });
        }
        const mesh = new THREE.Mesh(geo, m);
        mesh.userData.furn = true;
        mesh.userData.furnName = f.name || 'фурнитура';
        // центр меша — по вершинам, чтобы привязать к ближайшей детали
        const fc = new THREE.Vector3();
        if (f.verts.length) {
          let sx = 0, sy = 0, sz = 0;
          for (let vi = 0; vi < f.verts.length; vi++) { sx += f.verts[vi][0]; sy += f.verts[vi][1]; sz += f.verts[vi][2]; }
          fc.set(sx / f.verts.length, sy / f.verts.length, sz / f.verts.length);
        }
        nearestGroup(fc, f.gid, (typeof f.anim === 'number') ? f.anim : -1).add(mesh);
      });
    }

    // ---- крепёж — цилиндры по сечениям (v3 TFastener и detalQR fittings) ----
    if ((isV3 || isDetalQR) && loadedJSON.fasteners) {
      loadedJSON.fasteners.forEach((f) => {
        (f.sections || []).forEach((s) => {
          if (!s.p || !s.d || !s.r) return;
          // реальная длина из модели (у мелкого крепежа бывает 2 мм —
          // принудительный минимум 10 мм заставлял его торчать из деталей)
          const len = s.len > 0.5 ? s.len : 8;
          const geo = new THREE.CylinderGeometry(s.r, s.r, len, 12);
          const col = f.color
            ? new THREE.Color(f.color)
            : new THREE.Color(hashColor(f.name || 'крепёж')).lerp(new THREE.Color(0x888888), 0.35);
          const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.6 });
          const mesh = new THREE.Mesh(geo, m);
          const dir = new THREE.Vector3(s.d[0], s.d[1], s.d[2]).normalize();
          mesh.position.copy(new THREE.Vector3(s.p[0], s.p[1], s.p[2]).add(dir.clone().multiplyScalar(len / 2)));
          mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          mesh.userData.hole = true;
          mesh.userData.furnName = f.name || 'крепёж';
          nearestGroup(new THREE.Vector3(s.p[0], s.p[1], s.p[2]), f.gid, -1).add(mesh);
        });
      });
    }

    // ---- кромки (butts): тонкая полоса по ребру панели ----
    // цвет — из каталога Базиса (col) или нейтральный; полоса чуть выступает
    // за ребро, поэтому видна и не конфликтует с гранью панели
    parts.forEach((p) => {
      if (p.mode !== 'panel3' || !p.butts || !p.butts.length) return;
      const m = placementMatrix(p.v3.placement);
      p.butts.forEach((b) => {
        const seg = b.seg || segByElem(p.v3.contour, b.elem);
        if (!seg) return;
        const [q1, q2] = seg;
        const dx = q2[0] - q1[0], dy = q2[1] - q1[1];
        const len = Math.hypot(dx, dy);
        if (len < 0.5) return;
        const dir = new THREE.Vector3(dx / len, dy / len, 0);
        const nrm = new THREE.Vector3(-dir.y, dir.x, 0);
        const geo = new THREE.BoxGeometry(len, 0.8, p.v3.thickness);
        const basis = new THREE.Matrix4().makeBasis(dir, nrm, new THREE.Vector3(0, 0, 1));
        basis.setPosition((q1[0] + q2[0]) / 2, (q1[1] + q2[1]) / 2, p.v3.thickness / 2);
        geo.applyMatrix4(basis);
        geo.applyMatrix4(m);
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
          color: b.col ? new THREE.Color(b.col) : 0xc8b48c, roughness: 0.65, metalness: 0.03,
        }));
        mesh.userData.partId = p.id;
        partGroups[p.id] ? partGroups[p.id].add(mesh) : decor.add(mesh);
      });
    });

    // ---- пазы — полупрозрачные накладки на пласти ----
    // (паз, из которого сделан запил 45°, не рисуем — вместо него призма bevel_raw)
    if (isV3 || isDetalQR) {
      parts.forEach((p) => {
        if (p.mode !== 'panel3' || !p.pockets || !p.pockets.length) return;
        const bevelCis = (p.bevel_raw || []).map((bv) => bv.ci);
        const m = placementMatrix(p.v3.placement);
        p.pockets.forEach((pk) => {
          if (pk.ci !== undefined && bevelCis.indexOf(pk.ci) >= 0) return;
          let shape = null;
          if (pk.t === 'circle') {
            shape = new THREE.Shape();
            shape.absarc(pk.x, pk.y, pk.r, 0, Math.PI * 2, false);
          } else if (pk.pts && pk.pts.length >= 3) {
            shape = new THREE.Shape();
            pk.pts.forEach((q, i) => { if (i === 0) shape.moveTo(q[0], q[1]); else shape.lineTo(q[0], q[1]); });
            shape.closePath();
          }
          if (!shape) return;
          const geo = new THREE.ShapeGeometry(shape);
          const mm = m.clone();
          mm.multiply(new THREE.Matrix4().makeTranslation(0, 0, pk.face === 'B' ? p.v3.thickness - 0.15 : 0.15));
          geo.applyMatrix4(mm);
          const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: 0x5c4a2a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
          }));
          mesh.userData.pocket = true;
          mesh.userData.partId = p.id;
          partGroups[p.id] ? partGroups[p.id].add(mesh) : decor.add(mesh);
        });
      });
    }

    if (parts.length > 0) {
      orbitRef.current.target.set(cx, cy, cz);
      orbitRef.current.targetGoal.set(cx, cy, cz);
      orbitRef.current.radius = Math.max(600, (maxX - minX + maxY - minY) * 1.3);
      orbitRef.current.radiusGoal = orbitRef.current.radius;
    }

    // ракурс конструктора из файла — ставим камеру так, как модель стояла в БазИСе
    const dv = orbitFromView(loadedJSON && loadedJSON.view, [cx, cy, cz], orbitRef.current.radius);
    designViewRef.current = dv;
    setHasDesignView(!!dv);
    if (dv) {
      const o = orbitRef.current;
      o.theta = o.thetaGoal = dv.theta;
      o.phi = o.phiGoal = dv.phi;
      o.radius = o.radiusGoal = dv.radius;
      o.target.set(dv.target[0], dv.target[1], dv.target[2]);
      o.targetGoal.set(dv.target[0], dv.target[1], dv.target[2]);
    }

    if (dimGroupRef.current) {
      dimGroupRef.current.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
      scene.remove(dimGroupRef.current);
    }
    // размеры: если в модели есть TSize3D — берём их (как в Базисе, с цветом);
    // иначе — габаритные линии по bbox. Без модели — пустая группа.
    const dimGroup = (parts.length === 0) ? new THREE.Group()
      : ((isV3 || isDetalQR) && loadedJSON.dims && loadedJSON.dims.length)
        ? buildDimsGroupFromData(loadedJSON.dims)
        : buildDimensionsGroup(minX, maxX, minY, maxY, minZ, maxZ);
    dimGroup.visible = showDimensions;
    scene.add(dimGroup);
    dimGroupRef.current = dimGroup;
    needsRenderRef.current = true;   // сцена перестроена — нужен кадр
  }, [loadedJSON, loadedOBJ]);

  /* ---------- видимость / выделение ---------- */
  useEffect(() => {
    const partsById = {};
    parts.forEach((p) => { partsById[p.id] = p; });
    Object.entries(meshMapRef.current).forEach(([id, m]) => {
      // цель группы = смещение разлёта (0 при собранной модели)
      m.moveTarget.copy(scheme ? m.deltaRadial : m.delta).multiplyScalar(scheme ? explodeK : (exploded ? 1 : 0));
      const isSelected = id === selectedId;
      const isHover = id === hoverId && !isSelected;
      m.mesh.material.emissive = new THREE.Color(isSelected ? COLOR.accent : isHover ? 0xd68a34 : 0x000000);
      m.mesh.material.emissiveIntensity = isSelected ? 0.35 : isHover ? 0.22 : 0;

      if (!blueprintMode) {
        m.mesh.material.color.set(m.normalColor);
        m.mesh.material.roughness = 0.75;
        m.mesh.material.metalness = 0.05;
      }
      // прозрачный вид: панели полупрозрачные, фурнитура/присадки остаются
      // плотными (они рисуются отдельной группой и просвечивают насквозь)
      if (m.mesh.material.transparent !== transparentMode) {
        m.mesh.material.transparent = transparentMode;
        m.mesh.material.needsUpdate = true;
      }
      m.mesh.material.opacity = transparentMode ? 0.28 : 1;
      m.mesh.material.depthWrite = !transparentMode;
      if (transparentMode) m.mesh.material.side = THREE.DoubleSide;

      const part = partsById[id];
      // в схеме сборки показываем только детали выбранного модуля
      const inScheme = !scheme || !schemeAsm || !part || ((part.v3 && part.v3.assembly) || 'Модель') === schemeAsm;
      const visible = (part ? isPartVisible(part) : true) && inScheme;
      m.mesh.visible = visible && !blueprintMode;
      m.edges.visible = visible;
      // ДЕКОР ДЕТАЛИ лежит в её группе (после правки «группа на деталь»):
      // отверстия/кромка/пазы/облицовка — по правилам детали, фурнитура — по тумблеру
      m.group.children.forEach((c) => {
        if (c === m.mesh) return;
        const isFurn = !!c.userData.furn || (c.userData.hole && !c.userData.holeIsDrill);
        if (c.userData.hole) c.visible = showHoles && visible;
        else if (isFurn) c.visible = showFurn && visible;
        else c.visible = visible;
      });
    });

    if (decorRef.current) {
      decorRef.current.visible = !blueprintMode;
      decorRef.current.children.forEach((c) => {
        if (c.userData.hole) {
          // отверстия: показываем только у видимых деталей (изоляция/скрытие)
          const hpart = c.userData.partId ? partsById[c.userData.partId] : null;
          c.visible = showHoles && (hpart ? isPartVisible(hpart) : true);
        }
        else if (c.userData.furn) c.visible = showFurn;
        else if (c.userData.partId) {
          const part = partsById[c.userData.partId];
          c.visible = part ? isPartVisible(part) : true;
        }
      });
    }

    if (dimGroupRef.current) dimGroupRef.current.visible = showDimensions;
    needsRenderRef.current = true;   // видимость/подсветка изменились — нужен кадр
  }, [exploded, scheme, explodeK, schemeAsm, selectedId, parts.length, materialVisibility, blueprintMode, transparentMode, showDimensions, isolatedId, showHoles, showFurn, hiddenIds, hideFacades, hoverId]);

  /* ---------- схема сборки: модули и нумерация позиций ---------- */
  // модули = верхние узлы изделия (p.v3.assembly: «Model / Крышка мама»)
  const schemeModules = useMemo(() => {
    const m = new Map();
    parts.forEach((p) => {
      const asm = (p.v3 && p.v3.assembly) || 'Модель';
      m.set(asm, (m.get(asm) || 0) + 1);
    });
    return [...m.entries()];
  }, [parts]);

  // нумерация: ОДНА позиция на деталь (как у них — свой кружок, своя строка,
  // свой разлёт), порядок устойчивый: обозначение, имя, id
  const schemeRows = useMemo(() => {
    const list = parts
      .filter((p) => !schemeAsm || ((p.v3 && p.v3.assembly) || 'Модель') === schemeAsm)
      .slice()
      .sort((a, b) => String((a.v3 && a.v3.des) || '').localeCompare(String((b.v3 && b.v3.des) || ''), 'ru')
        || String(a.name || '').localeCompare(String(b.name || ''), 'ru')
        || String(a.id).localeCompare(String(b.id)));
    return list.map((p, i) => ({ num: i + 1, id: p.id, part: p }));
  }, [parts, schemeAsm]);
  const numById = useMemo(() => {
    const m = {};
    schemeRows.forEach((r) => { m[r.id] = r.num; });
    return m;
  }, [schemeRows]);

  // строки для списка и печати: номер, обозначение, название, размер
  const schemeUiRows = useMemo(() => schemeRows.map((r) => {
    const p = r.part;
    const des = (p.v3 && p.v3.des) || '';
    let title = String(p.name || '');
    const dash = title.indexOf('—');
    if (dash >= 0) title = title.slice(dash + 1).trim();
    const th = Math.abs((p.v3 && p.v3.thickness) || 0);
    return {
      num: r.num, id: r.id, des,
      title: title || des || 'Деталь',
      size: `${Math.round(p.faceW)}×${Math.round(p.faceH)}×${Math.round(th)}`,
      mat: String(p.material || '').replace(/^.*?\d+\s*мм\s*/i, '').slice(0, 42),
    };
  }), [schemeRows]);

  // крепёж и фурнитура выбранного модуля: по gid деталей, иначе по названиям отверстий
  const schemeFittings = useMemo(() => {
    const acc = {};
    const byGid = (loadedJSON && loadedJSON.fittingsByGid) || null;
    if (byGid) {
      const seen = {};
      schemeRows.forEach((r) => {
        const g = (r.part.v3 && r.part.v3.asmGid) || '';
        if (!g || seen[g]) return;
        seen[g] = 1;
        (byGid[g] || []).forEach((it) => { acc[it.kind] = (acc[it.kind] || 0) + it.count; });
      });
    }
    if (!Object.keys(acc).length) {
      schemeRows.forEach((r) => (r.part.holes || []).forEach((h) => {
        const n = h.name || 'крепёж';
        acc[n] = (acc[n] || 0) + 1;
      }));
    }
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }, [schemeRows, loadedJSON]);

  // печать: снимок кадра + легенда позиций + крепёж
  const printScheme = useCallback(() => {
    const url = captureRef.current ? captureRef.current() : null;
    const mod = schemeAsm ? String(schemeAsm).split(' / ').pop() : 'все модули';
    setPrintSheet({
      url,
      title: loadedFileName || 'Модель',
      subtitle: 'модуль: ' + mod,
      rows: schemeUiRows,
      fittings: schemeFittings,
      dateStr: new Date().toLocaleDateString('ru-RU'),
    });
  }, [schemeAsm, schemeUiRows, schemeFittings, loadedFileName]);

  /* кружки позиций и радиальный разлёт: строим/обновляем, когда открыли схему,
   * сменили модуль или тумблеры. Сами позиции кружков каждый кадр подтягивает
   * цикл отрисовки — они едут вместе с деталями. */
  useEffect(() => {
    const map = meshMapRef.current;
    const ids = Object.keys(map);
    const inMod = (id) => {
      const p = partsByIdRef.current ? partsByIdRef.current[id] : null;
      return !!p && (!schemeAsm || ((p.v3 && p.v3.assembly) || 'Модель') === schemeAsm);
    };
    // 1) радиальные смещения от центра модуля (в схеме разъезжаемся «врозь»)
    const box = new THREE.Box3();
    ids.forEach((id) => { if (inMod(id) && partCentersRef.current[id]) box.expandByPoint(partCentersRef.current[id]); });
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const diag = box.isEmpty() ? 600 : box.getSize(new THREE.Vector3()).length();
    ids.forEach((id) => {
      const m = map[id], c = partCentersRef.current[id];
      if (!c) return;
      const dir = c.clone().sub(center);
      if (dir.lengthSq() < 1) dir.set(0, 1, 0);
      m.deltaRadial.copy(dir.normalize()).multiplyScalar(diag * 0.35);
      // куда вынести кружок позиции: наружу от центра модуля, чуть выше
      m.badgeOffset = dir.clone().multiplyScalar(diag * 0.12).add(new THREE.Vector3(0, diag * 0.05, 0));
    });
    // 2) кружки позиций (спрайты) и выноски — только для деталей модуля
    const scn = sceneRef.current;
    const old = badgeGroupRef.current;
    if (old && scn) {
      old.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      });
      scn.remove(old);
      badgeGroupRef.current = null;
    }
    if (!scheme || !showPos || !scn) { needsRenderRef.current = true; return; }
    const g = new THREE.Group();
    ids.forEach((id) => {
      if (!inMod(id) || !numById[id] || !partCentersRef.current[id]) return;
      const sp = makeBadgeSprite(numById[id], false);
      sp.userData.partId = id;
      g.add(sp);
      const lead = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineBasicMaterial({ color: 0x4a4a44, transparent: true, opacity: 0.7 })
      );
      lead.userData.partId = id;
      lead.userData.lead = true;
      lead.visible = !!showLead;
      g.add(lead);
    });
    scn.add(g);
    badgeGroupRef.current = g;
    needsRenderRef.current = true;
  }, [scheme, schemeAsm, showPos, showLead, parts, numById]);

  const zoomToSelected = useCallback((part) => {
    if (!part) return;
    const cx = part.x + part.w / 2;
    const cy = part.y + part.h / 2;
    const cz = part.z + part.d / 2;
    const maxDim = Math.max(part.w, part.h, part.d, 50);
    orbitRef.current.targetGoal.set(cx, cy, cz);
    orbitRef.current.radiusGoal = maxDim * 2.4;
  }, []);

  // вернуть ракурс, с которого модель смотрели в БазИСе (поле `view` в выгрузке)
  const applyDesignView = useCallback(() => {
    const dv = designViewRef.current;
    if (!dv) return;
    const o = orbitRef.current;
    o.thetaGoal = dv.theta;
    o.phiGoal = dv.phi;
    o.radiusGoal = dv.radius;
    o.targetGoal.set(dv.target[0], dv.target[1], dv.target[2]);
    needsRenderRef.current = true;
  }, []);

  // виды камеры (как «Tepa/Old/Yon» у detalQR): плавный переход через theta/phi
  const applyView = useCallback((view) => {
    const o = orbitRef.current;
    if (view === 'top') { o.thetaGoal = 0; o.phiGoal = 0.16; }
    else if (view === 'front') { o.thetaGoal = 0; o.phiGoal = Math.PI / 2; }
    else if (view === 'side') { o.thetaGoal = Math.PI / 2; o.phiGoal = Math.PI / 2; }
    else { o.thetaGoal = 0.785; o.phiGoal = 1.0; }   // изометрия
    needsRenderRef.current = true;
  }, []);

  // «В центр»: вписать модель в кадр
  const fitToModel = useCallback(() => {
    const o = orbitRef.current;
    if (!parts.length) return;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    parts.forEach((p) => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + p.w);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y + p.h);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z + p.d);
    });
    o.targetGoal.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 100);
    o.radiusGoal = Math.max(600, size * 1.9);
    needsRenderRef.current = true;
  }, [parts]);

  /* ---------- полноэкранный режим: Esc/ресайз/браузерный полный экран ---------- */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setFullView(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    // контейнер сменил размер — говорим рендереру пересчитаться
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    try {
      if (fullView && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (!fullView && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (e) { /* встроенный браузер мог запретить — наш оверлей и так на весь экран */ }
    return () => cancelAnimationFrame(id);
  }, [fullView]);

  const toggleCheck = useCallback((id) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const checkedCount = parts.filter((p) => checked[p.id]).length;


  return (
    <div style={{ background: COLOR.bg, color: COLOR.text, fontFamily: 'ui-sans-serif, system-ui, sans-serif', border: `1px solid ${COLOR.hairline}`, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${COLOR.hairline}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Layers3 size={16} color={COLOR.accent} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>Мебель — 3D просмотр</span>
          {(isV3 || isDetalQR) && (
            <span style={{ fontSize: 10.5, color: COLOR.accent, border: `1px solid ${COLOR.accent}`, padding: '1px 6px' }}>
              {isDetalQR ? 'detalQR' : 'v3'}: {loadedJSON.holes ? loadedJSON.holes.length : 0} отв. · {isDetalQR && loadedJSON.fittingsCount != null
                ? loadedJSON.fittingsCount
                : loadedJSON.furn ? loadedJSON.furn.length : 0} фурн.
            </span>
          )}
        </div>
        {isLoaded && (
          <span style={{ fontSize: 12, color: COLOR.textMuted, fontFamily: 'ui-monospace, monospace', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>{visibleParts.length}/{parts.length} деталей · {checkedCount}/{parts.length} отмечено</span>
            {parts.length - visibleParts.length > 0 && (
              <span
                onClick={unhideAll}
                style={{ color: COLOR.accent, cursor: 'pointer', border: `1px solid ${COLOR.accent}`, padding: '1px 6px' }}
                title="Показать все скрытые детали и фасады"
              >
                Показать скрытые ({parts.length - visibleParts.length})
              </span>
            )}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: embedded ? '1fr 220px' : '200px 1fr 220px' }}>
        {!embedded && (
        <div style={{ padding: 16, borderRight: `1px solid ${COLOR.hairline}` }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.obj,application/json"
            onChange={handleFile}
            style={{ display: 'none' }}
          />

          {isLoaded ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: COLOR.textMuted, marginBottom: 8, letterSpacing: 0.2 }}>
                Загруженная модель
              </div>
              <div style={{ fontSize: 12.5, marginBottom: 4, wordBreak: 'break-all' }}>{loadedFileName}</div>
              <div style={{ fontSize: 11, color: COLOR.textMuted, marginBottom: 12 }}>
                {loadedOBJ ? 'формат: OBJ (реальная геометрия)'
                  : isDetalQR ? 'формат: detalQR (контуры + присадки + фурнитура)'
                  : isV3 ? 'формат: JSON v3 (контуры + присадки + фурнитура)'
                  : 'формат: JSON (габариты)'}
              </div>
              <button
                onClick={unloadModel}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '8px 10px', fontSize: 13, cursor: 'pointer',
                  background: 'transparent', color: COLOR.textMuted,
                  border: `1px solid ${COLOR.hairline}`,
                }}
              >
                <X size={14} />
                Выгрузить модель
              </button>

              {modelToolsBlock}
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: COLOR.textMuted, marginBottom: 8, letterSpacing: 0.2 }}>Модель не загружена</div>
              <div style={{ fontSize: 12, color: COLOR.textMuted, lineHeight: 1.6 }}>
                Нажмите «Загрузить модель» или перетащите файл .json/.obj в окно просмотра.
              </div>
            </div>
          )}

          <button
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '8px 10px', fontSize: 13, cursor: 'pointer', marginBottom: 8,
              background: 'transparent', color: COLOR.accent,
              border: `1px solid ${COLOR.accent}`,
            }}
          >
            <Upload size={14} />
            Загрузить модель (JSON/OBJ)
          </button>
          {loadError && (
            <div style={{ fontSize: 11.5, color: '#e2726c', marginBottom: 12 }}>{loadError}</div>
          )}

          {isLoaded && (
            <button
              onClick={() => setExploded((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 10px', fontSize: 13, cursor: 'pointer', marginBottom: 8,
                background: exploded ? COLOR.accentDim : 'transparent',
                color: exploded ? COLOR.accent : COLOR.text,
                border: `1px solid ${exploded ? COLOR.accent : COLOR.hairline}`,
              }}
            >
              <RotateCw size={14} />
              {exploded ? 'Собрать' : 'Разнести детали'}
            </button>
          )}

          {isLoaded && parts.some((p) => p.kind === 'facade') && (
            <button
              onClick={() => setHideFacades((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 10px', fontSize: 13, cursor: 'pointer', marginBottom: 8,
                background: hideFacades ? COLOR.accentDim : 'transparent',
                color: hideFacades ? COLOR.accent : COLOR.text,
                border: `1px solid ${hideFacades ? COLOR.accent : COLOR.hairline}`,
              }}
            >
              {hideFacades ? <EyeOff size={14} /> : <Eye size={14} />}
              {hideFacades ? 'Показать фасады' : 'Скрыть фасады'}
            </button>
          )}

          {isLoaded && (
            <button
              onClick={() => setBlueprintMode((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 10px', fontSize: 13, cursor: 'pointer',
                background: blueprintMode ? COLOR.accentDim : 'transparent',
                color: blueprintMode ? COLOR.accent : COLOR.text,
                border: `1px solid ${blueprintMode ? COLOR.accent : COLOR.hairline}`,
              }}
            >
              <PenTool size={14} />
              {blueprintMode ? 'Обычный вид' : 'Режим чертежа'}
            </button>
          )}

          {isLoaded && (
            <button
              onClick={() => setTransparentMode((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 10px', fontSize: 13, cursor: 'pointer', marginTop: 8,
                background: transparentMode ? COLOR.accentDim : 'transparent',
                color: transparentMode ? COLOR.accent : COLOR.text,
                border: `1px solid ${transparentMode ? COLOR.accent : COLOR.hairline}`,
              }}
              title="Корпус становится полупрозрачным — видно фурнитуру и присадки внутри"
            >
              <Eye size={14} />
              {transparentMode ? 'Обычный вид' : 'Прозрачный вид'}
            </button>
          )}

          {isLoaded && (
            <button
              onClick={() => setShowDimensions((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 10px', fontSize: 13, cursor: 'pointer', marginTop: 8,
                background: showDimensions ? COLOR.accentDim : 'transparent',
                color: showDimensions ? COLOR.accent : COLOR.text,
                border: `1px solid ${showDimensions ? COLOR.accent : COLOR.hairline}`,
              }}
            >
              <Ruler size={14} />
              {showDimensions ? 'Скрыть размеры' : 'Показать размеры'}
            </button>
          )}

          {isLoaded && (
            <button
              onClick={() => setShowSpec(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 10px', fontSize: 13, cursor: 'pointer', marginTop: 8,
                background: 'transparent', color: COLOR.accent,
                border: `1px solid ${COLOR.accent}`,
              }}
            >
              <FileText size={14} />
              Спецификация деталей (печать)
            </button>
          )}

          {(isV3 || isDetalQR) && (
            <button
              onClick={() => { setScheme(true); setExplodeK(1); fitToModel(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 10px', fontSize: 13, cursor: 'pointer', marginTop: 8,
                background: COLOR.accent, color: '#fff',
                border: `1px solid ${COLOR.accent}`,
              }}
            >
              <FileText size={14} />
              Схема сборки 3D
            </button>
          )}

          {(isV3 || isDetalQR) && (
            <button
              onClick={() => setShowDoc(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 10px', fontSize: 12, cursor: 'pointer', marginTop: 6,
                background: 'transparent', color: COLOR.textMuted,
                border: `1px solid ${COLOR.hairline}`,
              }}
              title="Плоский чертёж узлов с таблицами — для печати"
            >
              <Printer size={13} />
              Чертёж сборки (2D, печать)
            </button>
          )}
        </div>
        )}

        <div
          style={{
            position: fullView ? 'fixed' : 'relative',
            inset: fullView ? 0 : 'auto',
            height: fullView ? '100vh' : 'auto',
            zIndex: fullView ? (embedded ? 1300 : 5) : 'auto',
            background: COLOR.bg,
            display: 'flex', flexDirection: 'column',
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div ref={mountRef} style={{ width: '100%', height: fullView ? '100%' : (embedded ? '62vh' : 480), flex: 1, minHeight: 0, cursor: 'grab' }} />
          {/* схема сборки: полоса управления и список позиций поверх 3D */}
          {scheme && isLoaded && (
            <>
              <SchemeBar
                modules={schemeModules}
                asm={schemeAsm}
                setAsm={setSchemeAsm}
                explodeK={explodeK}
                setExplodeK={setExplodeK}
                showPos={showPos}
                setShowPos={setShowPos}
                showFast={showFurn}
                setShowFast={setShowFurn}
                showLead={showLead}
                setShowLead={setShowLead}
                rowsCount={schemeUiRows.length}
                onPrint={printScheme}
                onExit={() => { setScheme(false); setExplodeK(0); setExploded(false); }}
              />
              <SchemeSpec
                rows={schemeUiRows}
                selectedId={selectedId}
                hoverId={hoverId}
                setHoverId={setHoverId}
                onPick={(id) => { setSelectedId(id); const p = partsById[id]; if (p) zoomToSelected(p); }}
                fittings={schemeFittings}
              />
            </>
          )}

          {/* лист печати инструкции сборки: порталом в body — в CRM окно модели
              при печати скрыто (display:none у .dialog-backdrop), а этот лист нет */}
          {printSheet && <SchemePrintSheet data={printSheet} onClose={() => setPrintSheet(null)} />}
          {isLoaded && (
            <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[['iso', 'Изометрия'], ['top', 'Сверху'], ['front', 'Спереди'], ['side', 'Сбоку'], ['fit', 'В центр']].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => (k === 'fit' ? fitToModel() : applyView(k))}
                  style={{
                    fontSize: 11, padding: '4px 8px', cursor: 'pointer',
                    background: 'rgba(230,240,223,0.92)', color: COLOR.text,
                    border: `1px solid ${COLOR.hairline}`,
                  }}
                  title={k === 'fit' ? 'Вписать модель в кадр' : 'Вид: ' + label}
                >
                  {label}
                </button>
              ))}
              {hasDesignView && (
                <button
                  onClick={applyDesignView}
                  style={{
                    fontSize: 11, padding: '4px 8px', cursor: 'pointer',
                    background: 'rgba(230,240,223,0.92)', color: COLOR.accent,
                    border: `1px solid ${COLOR.accent}`,
                  }}
                  title="Ракурс, с которого модель смотрели в БазИСе при выгрузке"
                >
                  Как в БазИСе
                </button>
              )}
              {embedded && (isV3 || isDetalQR || materialsList.length > 1) && (
                <button
                  onClick={() => setToolsOpen((v) => !v)}
                  style={{
                    fontSize: 11, padding: '4px 8px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: toolsOpen ? COLOR.accent : 'rgba(230,240,223,0.92)',
                    color: toolsOpen ? '#fff' : COLOR.text,
                    border: `1px solid ${toolsOpen ? COLOR.accent : COLOR.hairline}`,
                  }}
                  title="Материалы и слои модели: скрыть/показать материалы, отверстия, фурнитуру"
                >
                  <Layers3 size={12} />
                  Материалы
                </button>
              )}
            </div>
          )}
          {embedded && toolsOpen && isLoaded && (
            <div
              style={{
                position: 'absolute', top: 40, left: 8, width: 236,
                maxHeight: '55vh', overflowY: 'auto', zIndex: 12,
                background: 'rgba(255,255,255,0.97)',
                border: `1px solid ${COLOR.hairline}`,
                boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
                padding: '10px 12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: COLOR.textMuted, letterSpacing: 0.2 }}>Материалы и слои</span>
                <span onClick={() => setToolsOpen(false)} style={{ cursor: 'pointer', color: COLOR.textMuted, display: 'flex' }}>
                  <X size={13} />
                </span>
              </div>
              {modelToolsBlock}
            </div>
          )}

          {/* правая группа: документация + полный экран; режимы — когда панели скрыты */}
          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, maxWidth: '70%' }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {isLoaded && (
                <button
                  onClick={() => setShowSpec(true)}
                  style={{
                    fontSize: 11, padding: '4px 8px', cursor: 'pointer',
                    background: 'rgba(230,240,223,0.92)', color: COLOR.accent,
                    border: `1px solid ${COLOR.accent}`,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                  title="Деталировка: список деталей с размерами и кромкой (можно распечатать)"
                >
                  <FileText size={12} />
                  Деталировка
                </button>
              )}
              {isLoaded && (isV3 || isDetalQR) && (
                <button
                  onClick={() => { setScheme(true); setExplodeK(1); fitToModel(); }}
                  style={{
                    fontSize: 11, padding: '4px 8px', cursor: 'pointer',
                    background: COLOR.accent, color: '#fff',
                    border: `1px solid ${COLOR.accent}`,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                  title="Схема сборки в 3D: разлёт деталей, позиции, выноски, печать"
                >
                  <FileText size={12} />
                  Схема сборки 3D
                </button>
              )}
              <button
                onClick={() => setFullView((v) => !v)}
                style={{
                  fontSize: 11, padding: '4px 8px', cursor: 'pointer',
                  background: 'rgba(230,240,223,0.92)', color: COLOR.text,
                  border: `1px solid ${COLOR.hairline}`,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
                title={fullView ? 'Вернуть панели (Esc)' : '3D-просмотр на весь экран'}
              >
                {fullView ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                {fullView ? 'Обычный вид (Esc)' : 'На весь экран'}
              </button>
            </div>
            {fullView && isLoaded && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {[
                  { label: exploded ? 'Собрать' : 'Разнести', on: exploded, act: () => setExploded((v) => !v) },
                  { label: hideFacades ? 'Показать фасады' : 'Скрыть фасады', on: hideFacades, act: () => setHideFacades((v) => !v) },
                  { label: 'Чертёж', on: blueprintMode, act: () => setBlueprintMode((v) => !v) },
                  { label: 'Прозрачный', on: transparentMode, act: () => setTransparentMode((v) => !v) },
                  { label: 'Размеры', on: showDimensions, act: () => setShowDimensions((v) => !v) },
                  { label: 'Отверстия', on: showHoles, act: () => setShowHoles((v) => !v) },
                  { label: 'Фурнитура', on: showFurn, act: () => setShowFurn((v) => !v) },
                ].filter((b) => !(b.label === 'Отверстия' || b.label === 'Фурнитура') || isV3 || isDetalQR).map((b) => (
                  <button
                    key={b.label}
                    onClick={b.act}
                    style={{
                      fontSize: 11, padding: '4px 8px', cursor: 'pointer',
                      background: b.on ? COLOR.accent : 'rgba(230,240,223,0.92)',
                      color: b.on ? '#fff' : COLOR.text,
                      border: `1px solid ${COLOR.hairline}`,
                    }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!isLoaded && (
            <div
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <div style={{ textAlign: 'center', color: COLOR.textMuted }}>
                <Upload size={40} color={COLOR.accent} style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 15, color: COLOR.text, marginBottom: 4 }}>Загрузите модель</div>
                <div style={{ fontSize: 12 }}>Перетащите сюда файл .json/.obj</div>
                <div style={{ fontSize: 12 }}>или нажмите «Загрузить модель (JSON/OBJ)» слева</div>
              </div>
            </div>
          )}
          <div style={{ padding: '6px 12px', fontSize: 11, color: COLOR.textMuted, borderTop: `1px solid ${COLOR.hairline}` }}>
            {embedded ? 'Мышью — поворот · колесо — масштаб' : 'Мышью — поворот · колесо — масштаб · перетащите сюда файл .json/.obj'}
          </div>
          {isDragOver && (
            <div
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(214,138,52,0.15)', border: `2px dashed ${COLOR.accent}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: COLOR.accent, background: COLOR.bg, padding: '10px 16px', border: `1px solid ${COLOR.accent}` }}>
                <Upload size={16} />
                Отпустите файл здесь
              </div>
            </div>
          )}

          {(() => {
            const part = parts.find((p) => p.id === selectedId);
            if (!part) return null;
            return (
              <div
                style={{
                  position: 'absolute', left: 12, bottom: 12, maxWidth: 280,
                  background: COLOR.bg, border: `1px solid ${COLOR.hairline}`,
                  padding: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                }}
              >
                <div style={{ fontSize: 14, color: COLOR.accent, marginBottom: 4 }}>{part.name}</div>
                <div style={{ fontSize: 11.5, color: COLOR.textMuted, fontFamily: 'ui-monospace, monospace', marginBottom: 2 }}>
                  {part.mode === 'panel3'
                    ? `${Math.round(part.faceW)} × ${Math.round(part.faceH)} × ${Math.round(part.v3.thickness)} мм (пласть × толщина)`
                    : `${Math.round(part.w)} × ${Math.round(part.h)} × ${Math.round(part.d)} мм`}
                </div>
                {part.material && (
                  <div style={{ fontSize: 11.5, color: COLOR.textMuted, marginBottom: 2 }}>{part.material}</div>
                )}
                {part.butts && part.butts.length > 0 && (
                  <div style={{ fontSize: 11, color: COLOR.textMuted, marginBottom: 8 }}>
                    Кромка: {part.butts.map((e) => e.mat).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                  </div>
                )}
                {part.pockets && part.pockets.length > 0 && (
                  <div style={{ fontSize: 11, color: COLOR.textMuted, marginBottom: 8 }}>
                    Пазов/фрезеровок: {part.pockets.length}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {part.holes && part.holes.length > 0 && (
                    <button
                      onClick={() => setExpandedId(part.id)}
                      style={{ fontSize: 11, padding: '5px 8px', cursor: 'pointer', background: 'transparent', color: COLOR.text, border: `1px solid ${COLOR.hairline}` }}
                    >
                      Присадки ({part.holes.length})
                    </button>
                  )}
                  <button
                    onClick={() => setIsolatedId(isolatedId === part.id ? null : part.id)}
                    style={{
                      fontSize: 11, padding: '5px 8px', cursor: 'pointer',
                      background: isolatedId === part.id ? COLOR.accentDim : 'transparent',
                      color: isolatedId === part.id ? COLOR.accent : COLOR.text,
                      border: `1px solid ${isolatedId === part.id ? COLOR.accent : COLOR.hairline}`,
                    }}
                  >
                    {isolatedId === part.id ? 'Показать всё' : 'Изолировать'}
                  </button>
                  <button
                    onClick={() => zoomToSelected(part)}
                    style={{ fontSize: 11, padding: '5px 8px', cursor: 'pointer', background: 'transparent', color: COLOR.text, border: `1px solid ${COLOR.hairline}` }}
                  >
                    Приблизить
                  </button>
                  <button
                    onClick={() => { setSelectedId(null); setIsolatedId(null); }}
                    style={{ fontSize: 11, padding: '5px 8px', cursor: 'pointer', background: 'transparent', color: COLOR.textMuted, border: `1px solid ${COLOR.hairline}` }}
                  >
                    Снять выбор
                  </button>
                </div>
              </div>
            );
          })()}
        </div>

        <div style={{ borderLeft: `1px solid ${COLOR.hairline}`, maxHeight: 520, overflowY: 'auto' }}>
          {isLoaded && (
            <div style={{ padding: '10px 12px 6px', borderBottom: `1px solid ${COLOR.hairline}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${COLOR.hairline}`, padding: '4px 8px' }}>
                <Search size={13} color={COLOR.textMuted} />
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Поиск (код, название)…"
                  style={{ border: 'none', outline: 'none', flex: 1, fontSize: 12, background: 'transparent', color: COLOR.text, fontFamily: 'inherit' }}
                />
                {searchQ && (
                  <span onClick={() => setSearchQ('')} style={{ cursor: 'pointer', color: COLOR.textMuted, display: 'flex' }}><X size={13} /></span>
                )}
              </div>
            </div>
          )}

          {/* строка детали: чекбокс + обозначение/имя + глаз */}
          {(() => {
            const renderRow = (p, extraHidden) => {
              const isChecked = !!checked[p.id];
              const isSelected = p.id === selectedId;
              const isHovered = p.id === hoverId;
              const isHidden = !!hiddenIds[p.id] || (hideFacades && p.kind === 'facade');
              const des = p.v3 && p.v3.des ? p.v3.des : '';
              const cleanName = des ? String(p.name).replace(des + ' — ', '') : p.name;
              const q = searchQ.trim().toLowerCase();
              const matchQ = !q || p.name.toLowerCase().indexOf(q) >= 0 || (p.material || '').toLowerCase().indexOf(q) >= 0;
              if (q && !matchQ) return null;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
                  onMouseEnter={() => setHoverId(p.id)}
                  onMouseLeave={() => setHoverId(null)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '7px 12px', cursor: 'pointer',
                    background: isSelected ? COLOR.accentDim : isHovered ? 'rgba(181,112,31,0.08)' : 'transparent',
                    borderBottom: `1px solid ${COLOR.hairline}`,
                    opacity: isHidden ? 0.45 : 1,
                  }}
                >
                  <span
                    onClick={(e) => { e.stopPropagation(); toggleCheck(p.id); }}
                    style={{ marginTop: 1, color: isChecked ? COLOR.accent : COLOR.textMuted, flexShrink: 0 }}
                  >
                    {isChecked ? <CheckSquare size={15} /> : <Square size={15} />}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, color: isSelected ? COLOR.accent : COLOR.text, lineHeight: 1.3 }}>
                      {des && <span style={{ fontFamily: 'ui-monospace, monospace', color: COLOR.accent, marginRight: 6 }}>{des}</span>}
                      {cleanName}
                    </div>
                    <div style={{ fontSize: 11, color: COLOR.textMuted, fontFamily: 'ui-monospace, monospace' }}>
                      {p.mode === 'panel3'
                        ? `${Math.round(p.faceW)}×${Math.round(p.faceH)}×${Math.round(p.v3.thickness)}`
                        : `${Math.round(p.w)}×${Math.round(p.h)}×${Math.round(p.d)}`}
                    </div>
                    {p.material && (
                      <div style={{ fontSize: 10.5, color: COLOR.textMuted }}>{p.material}</div>
                    )}
                    {isSelected && p.holes && p.holes.length > 0 && (
                      <div style={{ marginTop: 8, borderTop: `1px solid ${COLOR.hairline}`, paddingTop: 6 }}>
                        <div
                          onClick={(e) => { e.stopPropagation(); setExpandedId(p.id); }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            fontSize: 10.5, color: COLOR.textMuted, marginBottom: 4, cursor: 'pointer',
                          }}
                        >
                          <span>Присадки ({p.holes.length}), пласть</span>
                          <Maximize2 size={12} color={COLOR.accent} />
                        </div>
                        <div onClick={(e) => { e.stopPropagation(); setExpandedId(p.id); }} style={{ cursor: 'zoom-in' }}>
                          <PanelDiagram part={p} />
                        </div>
                      </div>
                    )}
                    {isSelected && p.butts && p.butts.length > 0 && (
                      <div style={{ marginTop: 8, fontSize: 10.5 }}>
                        <div style={{ color: COLOR.textMuted, marginBottom: 2 }}>Кромка:</div>
                        {p.butts.map((e, ei) => (
                          <div key={ei} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                            <span style={{ color: COLOR.textMuted }}>{e.sign || ('край ' + e.elem)}</span>
                            <span style={{ color: COLOR.text }}>{e.mat}{e.thick ? ` ${e.thick}мм` : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {isSelected && p.pockets && p.pockets.length > 0 && (
                      <div style={{ marginTop: 6, fontSize: 10.5, color: COLOR.textMuted }}>
                        Пазы/фрезеровки: {p.pockets.length} (глубины: {[...new Set(p.pockets.map((x) => x.depth))].join(', ')} мм)
                      </div>
                    )}
                    {isSelected && (!p.holes || p.holes.length === 0) && (
                      <div style={{ fontSize: 10.5, color: COLOR.textMuted, marginTop: 6, fontStyle: 'italic' }}>
                        Нет данных о присадках
                      </div>
                    )}
                  </div>
                  <span
                    onClick={(e) => { e.stopPropagation(); setHiddenIds((prev) => ({ ...prev, [p.id]: !prev[p.id] })); }}
                    style={{ marginTop: 1, color: COLOR.textMuted, flexShrink: 0, cursor: 'pointer' }}
                    title={isHidden ? 'Показать деталь' : 'Скрыть деталь'}
                  >
                    {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  </span>
                </div>
              );
            };

            const fastenerRows = (list) => {
              const cnt = {};
              list.forEach((p) => (p.holes || []).forEach((h) => {
                const n = h.name || h.fastenerName || 'крепёж';
                cnt[n] = (cnt[n] || 0) + 1;
              }));
              const entries = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
              if (!entries.length) return null;
              return (
                <div>
                  {entries.map(([name, c], i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 12px 3px 30px', fontSize: 11, color: COLOR.textMuted, borderBottom: `1px solid ${COLOR.hairline}` }}>
                      <span>🔩</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      <span style={{ fontFamily: 'ui-monospace, monospace' }}>{c} шт</span>
                    </div>
                  ))}
                </div>
              );
            };

            // фурнитура узла (detalQR: fittings с gid узла — меши и крепёж)
            const fittingsByGid = loadedJSON && loadedJSON.fittingsByGid ? loadedJSON.fittingsByGid : null;
            const fittingRows = (gidPathKey) => {
              if (!fittingsByGid || !gidPathKey) return null;
              const list = fittingsByGid[gidPathKey];
              if (!list || !list.length) return null;
              return (
                <div>
                  {list.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 12px 3px 30px', fontSize: 11, color: COLOR.textMuted, borderBottom: `1px solid ${COLOR.hairline}` }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.color || '#8a8f98', flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.kind}</span>
                      <span style={{ fontFamily: 'ui-monospace, monospace' }}>{f.count} шт</span>
                    </div>
                  ))}
                </div>
              );
            };

            // дерево по assembly (v3): рекурсивные узлы + детали + крепёж узла
            const renderTreeNode = (node, depth) => {
              const key = node.path;
              const collapsed = !!collapsedAsm[key];
              const allParts = node.allParts;
              const visibleCount = allParts.filter(isPartVisible).length;
              return (
                <div key={key}>
                  <div
                    onClick={() => setCollapsedAsm((prev) => ({ ...prev, [key]: !prev[key] }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', cursor: 'pointer', userSelect: 'none',
                      background: depth === 0 ? 'rgba(0,0,0,0.03)' : 'transparent',
                      borderBottom: `1px solid ${COLOR.hairline}`,
                    }}
                  >
                    <span style={{ display: 'flex', color: COLOR.textMuted }}>
                      {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: COLOR.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {node.name}
                    </span>
                    <span style={{ fontSize: 10.5, color: COLOR.textMuted, fontFamily: 'ui-monospace, monospace' }}>
                      {visibleCount}
                    </span>
                  </div>
                  {!collapsed && (
                    <div>
                      {node.parts.map((p) => renderRow(p))}
                      {fastenerRows(node.parts)}
                      {fittingRows(node.path)}
                      {node.childOrder.map((cn) => renderTreeNode(node.children[cn], depth + 1))}
                    </div>
                  )}
                </div>
              );
            };

            if ((isV3 || isDetalQR) && !searchQ.trim()) {
              // построение дерева из путей assembly/gid
              const root = { name: 'Модель', path: '', children: {}, childOrder: [], parts: [], allParts: [] };
              parts.forEach((p) => {
                const asm = p.v3.assembly || '';
                const names = asm ? asm.split(' / ') : [];
                // ключ пути — gid (в detalQR одинаковые имена групп могут быть разными узлами);
                // без gid — индексная цепочка
                const gids = p.v3.asmGid ? p.v3.asmGid.split('/') : names.map((_, i) => String(i));
                let cur = root;
                for (let i = 0; i < names.length; i++) {
                  const cpath = gids.slice(0, i + 1).join('/');
                  if (!cur.children[cpath]) {
                    cur.children[cpath] = { name: names[i], path: cpath, children: {}, childOrder: [], parts: [], allParts: [] };
                    cur.childOrder.push(cpath);
                  }
                  cur = cur.children[cpath];
                }
                cur.parts.push(p);
              });
              // подсчёт деталей в поддереве
              const fill = (n) => {
                n.allParts = n.parts.slice();
                n.childOrder.forEach((c) => { fill(n.children[c]); n.allParts = n.allParts.concat(n.children[c].allParts); });
              };
              fill(root);
              return (
                <div>
                  <div style={{ fontSize: 11, color: COLOR.textMuted, padding: '10px 12px 6px' }}>Спецификация (по узлам)</div>
                  {root.childOrder.length === 0
                    ? root.parts.map((p) => renderRow(p))
                    : root.childOrder.map((c) => renderTreeNode(root.children[c], 0))}
                  {root.parts.length > 0 && fastenerRows(root.parts)}
                </div>
              );
            }

            return (
              <div>
                <div style={{ fontSize: 11, color: COLOR.textMuted, padding: '10px 12px 6px' }}>
                  {searchQ.trim() ? `Поиск: «${searchQ.trim()}»` : 'Спецификация'}
                </div>
                {visibleParts.map((p) => renderRow(p))}
              </div>
            );
          })()}
        </div>
      </div>

      {expandedId && (() => {
        const part = parts.find((p) => p.id === expandedId);
        if (!part) return null;
        return (
          <div
            onClick={() => setExpandedId(null)}
            style={{
              position: 'absolute', inset: 0, background: 'rgba(10,10,11,0.85)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: COLOR.bg, border: `1px solid ${COLOR.hairline}`,
                padding: 20, maxHeight: '90%', overflowY: 'auto',
                display: 'flex', gap: 20, alignItems: 'flex-start',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, color: COLOR.accent }}>{part.name}</div>
                    <div style={{ fontSize: 12, color: COLOR.textMuted, fontFamily: 'ui-monospace, monospace' }}>
                      {part.mode === 'panel3'
                        ? `${Math.round(part.faceW)}×${Math.round(part.faceH)}×${Math.round(part.v3.thickness)}`
                        : `${Math.round(part.w)}×${Math.round(part.h)}×${Math.round(part.d)}`}
                    </div>
                    {part.material && (
                      <div style={{ fontSize: 11.5, color: COLOR.textMuted }}>{part.material}</div>
                    )}
                    {part.butts && part.butts.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        {part.butts.map((e, ei) => (
                          <span key={ei} style={{ fontSize: 11, color: COLOR.textMuted, marginRight: 10 }}>
                            {e.sign || ('край ' + e.elem)}:{' '}
                            <span style={{ color: COLOR.text }}>{e.mat}{e.thick ? ` ${e.thick}мм` : ''}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setExpandedId(null)}
                    style={{ background: 'transparent', border: `1px solid ${COLOR.hairline}`, color: COLOR.text, padding: 6, cursor: 'pointer', marginLeft: 24 }}
                  >
                    <X size={16} />
                  </button>
                </div>
                <PanelDiagram part={part} maxW={560} maxH={560} fontScale={1.3} showLabels />
              </div>
            </div>
          </div>
        );
      })()}
      {showSpec && isLoaded && (
        <SpecSheet
          parts={parts}
          modelName={loadedFileName || 'Модель'}
          onClose={() => setShowSpec(false)}
        />
      )}
      {showDoc && (isV3 || isDetalQR) && (
        <AssemblyDoc
          parts={parts}
          modelName={loadedFileName || 'Модель'}
          onClose={() => setShowDoc(false)}
        />
      )}
    </div>
  );
}

export default CabinetViewer;
export { PanelDiagram, edgeColorFor, contourToShape };   // для тестов схемы/геометрии контура
