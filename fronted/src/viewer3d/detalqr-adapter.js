// Адаптер формата detalQR (furniture_model.json) -> внутреннее представление вьюера.
//
// Формат detalQR (та же модель, что открывает их вьюер):
//   info {article, name, order, source_file}
//   panels[] { des, name, artpos, mat, thick, w, h, poly[[x,y]..], cuts[], pockets[],
//              pos[x,y,z], quat[x,y,z,w], butts[], group, gid, layout, anim, grain, holes[], tex }
//   holes: face "A" (+Z пласть) / "B" (−Z) с локальными x,y; face "T" (торец) — x,y на
//          кромке, z — смещение по толщине, ang 0/180 — направление сверления
//   fittings[] { kind, color, mesh? (индекс в furn_meshes), pos/quat,
//                sections? [{p,d,r,len}], anim, gid, sub }
//   furn_meshes[] {verts, tris} (локальные, ставятся через fittings)
//   furniture[] (сводка), dims[] {value,a,b,ea,eb,col}, anims[], texts[]
//
// На выходе — объект в формате, который уже умеет вьюер (panel3 + мировые
// цилиндры отверстий + меши фурнитуры в мировых координатах + крепёж).

import * as THREE from 'three';

// те же цвета типов присадок, что у detalQR
const HOLE_COLORS = { Shkant: '#c08a3e', Evrovint: '#ff5a3c', Samorez: '#d6b13c', Teshik: '#9aa4b0' };
const HOLE_NAMES = { Shkant: 'Шкант', Evrovint: 'Евровинт', Samorez: 'Саморез', Teshik: 'Отверстие' };

// деревянная палитра для материалов без цвета (детерминированный хэш)
const WOOD_PALETTE = ['#c9a36a', '#b08a55', '#d6b98c', '#a4845c', '#c7b088', '#9c7a4e', '#e0c79b', '#b3956c', '#8a6b45', '#d2a86e'];

function hashColor(key, palette) {
  let h = 0;
  const s = key || '';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

// «заглушка» Базиса: цвет материала не задан (colorUse = 0) — там салатовый.
// правило то же, что во вьюере (isPlaceholderGreen): почти чистый зелёный
function isPlaceholderGreen(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return ((n >> 16) & 255) < 40 && ((n >> 8) & 255) > 215 && (n & 255) < 40;
}

function classifyKind(name) {
  const n = (name || '').toLowerCase();
  if (n.indexOf('фасад') >= 0 || n.indexOf('двер') >= 0) return 'facade';
  if (n.indexOf('полк') >= 0) return 'shelf';
  if (n.indexOf('задн') >= 0) return 'back';
  return 'corpus';
}

// имя материала одной строкой (в detalQR встречаются переносы)
function shortMat(m) {
  return String(m || '').replace(/\s*\n\s*/g, ' ').trim();
}

// кватернион [x,y,z,w] + позиция -> плейсмент {origin, ax, ay, az}
function placementFromPosQuat(pos, quat) {
  const q = new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]).normalize();
  const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const ay = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const az = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  return {
    origin: { x: pos[0] || 0, y: pos[1] || 0, z: pos[2] || 0 },
    ax: { x: ax.x, y: ax.y, z: ax.z },
    ay: { x: ay.x, y: ay.y, z: ay.z },
    az: { x: az.x, y: az.y, z: az.z },
  };
}

// замкнутый плотный контур -> элементы contour (линии по точкам) + вырезы cuts
function panelContour(poly, cuts) {
  const elems = [];
  const pts = poly || [];
  const n = pts.length;
  if (n >= 3) {
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      elems.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
    }
  }
  (cuts || []).forEach((c) => {
    if (c.t === 'circle') elems.push({ t: 'circle', cx: c.x, cy: c.y, r: c.r });
    else if (c.t === 'poly' && c.pts && c.pts.length >= 3) {
      const cpts = c.pts.map((q) => [q[0], q[1]]);
      if (Math.hypot(cpts[0][0] - cpts[cpts.length - 1][0], cpts[0][1] - cpts[cpts.length - 1][1]) < 1e-6) cpts.pop();
      elems.push({ t: 'hole', pts: cpts });   // полигональный сквозной вырез
    }
  });
  return elems;
}

function contourBBox(elems) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x, y) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };
  elems.forEach((e) => {
    if (e.t === 'line') { add(e.x1, e.y1); add(e.x2, e.y2); }
    else if (e.t === 'circle') { add(e.cx - e.r, e.cy - e.r); add(e.cx + e.r, e.cy + e.r); }
  });
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// мировой bbox панели (как panelWorldBBox во вьюере)
function worldBBox(contour, placement, thickness) {
  const bb = contourBBox(contour);
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(placement.ax.x, placement.ax.y, placement.ax.z),
    new THREE.Vector3(placement.ay.x, placement.ay.y, placement.ay.z),
    new THREE.Vector3(placement.az.x, placement.az.y, placement.az.z)
  ).setPosition(placement.origin.x, placement.origin.y, placement.origin.z);
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let cx = 0; cx <= 1; cx++) for (let cy = 0; cy <= 1; cy++) for (let cz = 0; cz <= 1; cz++) {
    const v = new THREE.Vector3(cx ? bb.maxX : bb.minX, cy ? bb.maxY : bb.minY, cz ? thickness : 0).applyMatrix4(m);
    if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
    if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
  }
  return { x: minX, y: minY, z: minZ, w: maxX - minX, h: maxY - minY, d: maxZ - minZ };
}

// нормаль кромки в локальной плоскости по точке (x,y) на границе контура
function edgeNormal(bb, x, y) {
  const tol = 1.5;
  const dxMin = Math.abs(x - bb.minX), dxMax = Math.abs(x - bb.maxX);
  const dyMin = Math.abs(y - bb.minY), dyMax = Math.abs(y - bb.maxY);
  const best = Math.min(dxMin, dxMax, dyMin, dyMax);
  if (best === dxMin) return [-1, 0];
  if (best === dxMax) return [1, 0];
  if (best === dyMin) return [0, -1];
  return [0, 1];
}

// мировые цилиндры всех отверстий панели (A — пласть +Z, B — −Z, T — торец)
function panelHolesWorld(p, placement, thickness) {
  const out = [];
  const o = placement.origin, ax = placement.ax, ay = placement.ay, az = placement.az;
  const bb = contourBBox(p.v3.contour);
  (p.holes || []).forEach((h) => {
    const r = (h.diameter || 0) / 2;
    if (r <= 0) return;
    const len = Math.max(h.depth || 0, 1);
    let dir, pos;
    if (h.side === 'T') {
      // торец: ось — нормаль кромки в плоскости пласти, сверление ВНУТРЬ панели
      // (наружная нормаль с обратным знаком), z — смещение по толщине от пласти B
      const [nx, ny] = edgeNormal(bb, h.faceX, h.faceY);
      dir = new THREE.Vector3(-(ax.x * nx + ay.x * ny), -(ax.y * nx + ay.y * ny), -(ax.z * nx + ay.z * ny));
      const zc = (h.z !== undefined && h.z !== null) ? h.z : thickness / 2;
      pos = new THREE.Vector3(
        o.x + ax.x * h.faceX + ay.x * h.faceY + az.x * zc,
        o.y + ax.y * h.faceX + ay.y * h.faceY + az.y * zc,
        o.z + ax.z * h.faceX + ay.z * h.faceY + az.z * zc
      );
    } else if (h.side === 'B') {
      dir = new THREE.Vector3(az.x, az.y, az.z);           // вход с −Z, сверлим в +Z
      pos = new THREE.Vector3(o.x + ax.x * h.faceX + ay.x * h.faceY,
                              o.y + ax.y * h.faceX + ay.y * h.faceY,
                              o.z + ax.z * h.faceX + ay.z * h.faceY);
    } else {
      dir = new THREE.Vector3(-az.x, -az.y, -az.z);        // вход с +Z (пласть A)
      pos = new THREE.Vector3(
        o.x + ax.x * h.faceX + ay.x * h.faceY + az.x * thickness,
        o.y + ax.y * h.faceX + ay.y * h.faceY + az.y * thickness,
        o.z + ax.z * h.faceX + ay.z * h.faceY + az.z * thickness
      );
    }
    // p — ТОЧКА ВХОДА на поверхности (как в v3): цилиндр от входа внутрь,
    // сдвиг на len/2 делает уже вьюер. Раньше сдвигали и здесь — цилиндр
    // уходил вглубь на пол-длины и сквозные отверстия торчали из обратной пласти
    out.push({ p: [pos.x, pos.y, pos.z], d: [dir.x, dir.y, dir.z], r, len, name: h.name, color: h.color, pid: p.id });
  });
  return out;
}

// fittings + furn_meshes -> меши в мировых координатах + крепёж-секции
function parseFittings(data) {
  const furn = [];
  const fasteners = [];
  // цвета по видам фурнитуры из сводки furniture (у них — как в каталоге)
  const kindColors = {};
  (data.furniture || []).forEach((f) => { if (f && f.kind && f.color) kindColors[f.kind] = f.color; });
  (data.fittings || []).forEach((f) => {
    const col = f.col || f.color || kindColors[f.kind] || hashColor(f.kind, FURN_PALETTE);
    if (f.mesh !== undefined && f.mesh !== null && data.furn_meshes && data.furn_meshes[f.mesh]) {
      const src = data.furn_meshes[f.mesh];
      if (!src.verts || !src.tris || !src.tris.length) return;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(f.pos ? f.pos[0] : 0, f.pos ? f.pos[1] : 0, f.pos ? f.pos[2] : 0),
        new THREE.Quaternion(f.quat ? f.quat[0] : 0, f.quat ? f.quat[1] : 0, f.quat ? f.quat[2] : 0, f.quat ? f.quat[3] : 1).normalize(),
        new THREE.Vector3(1, 1, 1)
      );
      const verts = src.verts.map((v) => new THREE.Vector3(v[0], v[1], v[2]).applyMatrix4(m));
      furn.push({
        name: f.kind || 'фурнитура',
        verts: verts.map((v) => [v.x, v.y, v.z]),
        tris: src.tris,
        color: col,
      });
    } else if (f.sections && f.sections.length) {
      fasteners.push({
        name: f.kind || 'крепёж',
        color: col,
        sections: f.sections.map((s) => ({ p: s.p, d: s.d, r: s.r, len: s.len })),
      });
    }
  });
  return { furn, fasteners };
}

// фурнитура по узлам (gid) — для дерева спецификации
function fittingsByGidOf(data) {
  const map = {};
  const kindColors = {};
  (data.furniture || []).forEach((f) => { if (f && f.kind && f.color) kindColors[f.kind] = f.color; });
  (data.fittings || []).forEach((f) => {
    const gid = f.gid || '';
    if (!gid) return;
    const kind = f.kind || 'фурнитура';
    if (!map[gid]) map[gid] = {};
    if (!map[gid][kind]) map[gid][kind] = { kind, count: 0, color: f.col || f.color || kindColors[kind] || hashColor(kind, FURN_PALETTE) };
    map[gid][kind].count += 1;
  });
  // в каждом узле — отсортированный список
  Object.keys(map).forEach((gid) => {
    map[gid] = Object.values(map[gid]).sort((a, b) => b.count - a.count);
  });
  return map;
}

function materialsMap(data) {
  const map = {};
  (data.materials || []).forEach((m) => {
    if (!m || !m.mat || !m.color) return;
    // colorUse: 0 — «цвет не задан» (в Базисе там заглушка #00ff00);
    // рисовать детали салатовым нельзя — отдаём на подбор по названию
    if (m.colorUse === 0 || isPlaceholderGreen(m.color)) return;
    map[m.mat] = m.color;
  });
  return map;
}

// цвет по названию материала — когда в модели цвет не задан (colorUse = 0).
// «ЛХДФ Чёрный 2800х2070х03мм» должно быть тёмным, а не салатовым
function nameColorHint(name) {
  const n = String(name || '').toLowerCase();
  if (/ч[её]рн|black/.test(n)) return '#2c2c2e';
  if (/бел|white/.test(n)) return '#f0ece4';
  if (/графит|сер/.test(n)) return '#9a9a9c';
  if (/венге/.test(n)) return '#4a3529';
  if (/лхдф|двп|хдф|мдф|оргалит/.test(n)) return '#cdb894';   // оргалит — светлый крафт
  if (/дуб|орех|ясень|бук|сосн|ольх|акаци|каштан|венге/.test(n)) return hashColor(n, WOOD_PALETTE);
  return hashColor(n, WOOD_PALETTE);
}

/* ---------------- чтение файла модели ---------------- */
// Классический Базис 8 пишет текст в Windows-1251 (ANSI), новый — в UTF-8.
// Читаем как UTF-8; если появились символы-замены (U+FFFD) — перечитываем cp1251.
// Без этого названия деталей и материалы приходят «кракозябрами».
export function decodeModelText(buf) {
  const bytes = (buf instanceof Uint8Array) ? buf : new Uint8Array(buf);
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (utf8.indexOf('\uFFFD') === -1) return utf8;
  try {
    const cp = new TextDecoder('windows-1251').decode(bytes);
    return cp.indexOf('\uFFFD') === -1 ? cp : utf8;
  } catch (e) {
    return utf8;
  }
}

/* Конвенция модели: у деталей ОДНОГО СЕЧЕНИЯ ЛСК должна быть одинаковой.
 *
 * Зачем. Базис отдаёт размещение кватернионом, а кватернион не умеет отражение:
 * у зеркальных тел контур приходит отражённым, а рамка — «вывернутой» на 180°
 * вокруг az (ax и ay меняют знак). Двойное отражение уводит деталь на двойное
 * смещение сечения: у стола Solito правая нижняя царга вставала X[1274..1314]
 * вместо X[1235..1275] и на 3.3 мм выше. Правильные три царги из четырёх имеют
 * одну и ту же рамку — по этому большинству и определяем вывернутую.
 *
 * Переворачиваем, только если это ЛЕЧИТ: у детали нет зеркального близнеца на
 * своём месте, зато он появляется после переворота. Так честно отражённые пары
 * (у которых рамки разные по-настоящему) не трогаются. */
function frameConventionFix(parts) {
  const prof = (parts || []).filter((p) => p.kind === 'profile'
    && p.v3 && p.v3.placement && p.v3.contour && p.v3.contour.length
    && p.w > 0 && p.h > 0 && p.d > 0);
  if (prof.length < 3) return 0;

  // середина модели по X: по всем деталям (ширину задаёт столешница)
  let mnX = Infinity, mxX = -Infinity;
  (parts || []).forEach((p) => {
    if (!(p.w > 0)) return;
    if (p.x < mnX) mnX = p.x;
    if (p.x + p.w > mxX) mxX = p.x + p.w;
  });
  if (!isFinite(mnX) || mxX - mnX < 1) return 0;
  const mid = (mnX + mxX) / 2;

  const r2 = (n) => Math.round(n * 100) / 100;
  // подпись сечения: точки контура по модулю X — отражённые близнецы совпадают
  const sectionKey = (p) => {
    const pts = [];
    p.v3.contour.forEach((e) => {
      if (e.t === 'line') { pts.push([r2(Math.abs(e.x1)), r2(e.y1)]); pts.push([r2(Math.abs(e.x2)), r2(e.y2)]); }
    });
    if (!pts.length) return null;
    return pts.map((q) => q[0] + ':' + q[1]).sort().join(' ') + '|' + r2(Math.abs(p.v3.thickness));
  };
  const frameKey = (p) => {
    const pl = p.v3.placement;
    return [pl.ax.x, pl.ax.y, pl.ax.z, pl.ay.x, pl.ay.y, pl.ay.z].map((v) => Math.round(v * 1000) / 1000).join(',');
  };
  const flip = (pl) => ({
    origin: pl.origin,
    ax: { x: -pl.ax.x, y: -pl.ax.y, z: -pl.ax.z },
    ay: { x: -pl.ay.x, y: -pl.ay.y, z: -pl.ay.z },
    az: pl.az,
  });
  const boxOf = (p, placement) => worldBBox(p.v3.contour, placement, p.v3.thickness);
  const TOL = 3;
  // есть ли у коробки зеркальный близнец среди деталей того же сечения
  const hasTwin = (b, key, self) => prof.some((q) => q !== self && sectionKey(q) === key
    && Math.abs((2 * mid - b.x - b.w) - q.x) < TOL && Math.abs((2 * mid - b.x) - (q.x + q.w)) < TOL
    && Math.abs(b.y - q.y) < TOL && Math.abs(b.z - q.z) < TOL
    && Math.abs(b.h - q.h) < TOL && Math.abs(b.d - q.d) < TOL);

  // группы одного сечения
  const groups = new Map();
  prof.forEach((p) => {
    const k = sectionKey(p);
    if (!k) return;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  });

  let fixed = 0;
  groups.forEach((group, key) => {
    if (group.length < 3) return;
    const votes = new Map();
    group.forEach((p) => votes.set(frameKey(p), (votes.get(frameKey(p)) || 0) + 1));
    const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length < 2 || ranked[0][1] * 2 <= group.length) return;   // строгого большинства нет
    const topFrame = ranked[0][0];
    group.forEach((p) => {
      if (frameKey(p) === topFrame) return;
      const asIs = { x: p.x, y: p.y, z: p.z, w: p.w, h: p.h, d: p.d };
      const flipped = boxOf(p, flip(p.v3.placement));
      if (hasTwin(asIs, key, p)) return;                  // на своём месте всё сходится
      if (!hasTwin(flipped, key, p)) return;              // переворот ничего не лечит
      p.v3.placement = flip(p.v3.placement);
      p.x = flipped.x; p.y = flipped.y; p.z = flipped.z;
      p.w = flipped.w; p.h = flipped.h; p.d = flipped.d;
      fixed += 1;
    });
  });
  return fixed;
}

/* Совместимость со старыми выгрузками нашего скрипта (до правила знака).
 * У них тела из узлов «Вычитание тел2..N» записаны с ПОЛОЖИТЕЛЬНОЙ толщиной,
 * хотя Базис выдавливает их в обратную сторону — деталь (ножка-салазки) уезжает
 * из модели. У эталонных выгрузок detalQR знак уже отрицательный, поэтому
 * правило идемпотентно: трогаем только положительные.
 *
 * Переворачиваем НЕ ВСЕ подряд: в «Вычитание тел2..N» попадаются детали, у
 * которых плюс правильный (в Столе Color Block это бруски 26 мм). Признак
 * настоящей ошибки — деталь торчит из габарита модели: считаем габарит по всем
 * ОСТАЛЬНЫМ деталям и переворачиваем, только если так деталь перестаёт вылезать. */
function legacyExtrusionSignFix(parts) {
  const re = /Вычитание тел(\d+)\s*$/;
  const suspects = [];
  (parts || []).forEach((p) => {
    const asm = String((p.v3 && p.v3.assembly) || '');
    const m = asm.match(re);
    if (!m || Number(m[1]) < 2) return;
    if (!(p.v3 && p.v3.thickness > 0 && p.v3.contour && p.v3.contour.length && p.v3.placement)) return;
    if (!(p.w > 0 && p.h > 0 && p.d > 0)) return;
    suspects.push(p);
  });
  if (!suspects.length) return 0;

  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  (parts || []).forEach((p) => {
    if (suspects.indexOf(p) >= 0) return;
    if (!(p.w > 0 && p.h > 0 && p.d > 0)) return;
    const a = [p.x, p.y, p.z], size = [p.w, p.h, p.d];
    for (let i = 0; i < 3; i++) {
      if (a[i] < mn[i]) mn[i] = a[i];
      if (a[i] + size[i] > mx[i]) mx[i] = a[i] + size[i];
    }
  });
  if (!isFinite(mn[0])) return 0;

  // насколько коробка выходит за габарит модели, мм
  const outOf = (b) => {
    const a = [b.x, b.y, b.z], size = [b.w, b.h, b.d];
    let worst = 0;
    for (let i = 0; i < 3; i++) {
      const d = Math.max(mn[i] - a[i], (a[i] + size[i]) - mx[i], 0);
      if (d > worst) worst = d;
    }
    return worst;
  };

  let fixed = 0;
  suspects.forEach((p) => {
    const th = Math.abs(p.v3.thickness);
    const asIs = { x: p.x, y: p.y, z: p.z, w: p.w, h: p.h, d: p.d };
    const flipped = worldBBox(p.v3.contour, p.v3.placement, -th);
    const outAsIs = outOf(asIs), outFlipped = outOf(flipped);
    if (outAsIs > 5 && outFlipped * 2 <= outAsIs) {
      p.v3.thickness = -th;
      // габарит детали пересчитываем: он был посчитан по старому знаку
      p.x = flipped.x; p.y = flipped.y; p.z = flipped.z;
      p.w = flipped.w; p.h = flipped.h; p.d = flipped.d;
      fixed += 1;
    }
  });
  return fixed;
}

/* ---------------- главная функция ---------------- */


export function parseDetalQR(data) {
  const matColors = materialsMap(data);
  const matTex = {};   // материал -> встроенная текстура (materials[].dataUrl)
  // Текстуры их выгрузок: панель несёт хэш (`tex`), tex_meta — физический размер
  // текстуры в мм (tw/th). Картинки лежат по публичному адресу
  // https://detalqr.uz/tex/<хэш>.webp (так грузит их вьюер). Наши собственные
  // экспорты встраивают текстуру как dataUrl в materials[] — этот путь приоритетный.
  const texMeta = (data.tex_meta && typeof data.tex_meta === 'object') ? data.tex_meta : {};
  const texByHash = (hash) => {
    if (!hash) return null;
    const m = texMeta[hash] || {};
    return {
      url: 'https://detalqr.uz/tex/' + encodeURIComponent(hash) + '.webp',
      step: Number(m.tw) || 600,
      external: true,
    };
  };
  (data.materials || []).forEach((m) => {
    if (m && m.mat && m.dataUrl) matTex[m.mat] = { url: m.dataUrl, step: m.stepX || m.stepY || 600 };
  });

  // панели + профили (TExtrusionBody) — рисуются одинаково: контур + толщина
  const parts = (data.panels || []).map((p, idx) => {
    // ОСИ ЛСК предпочтительнее кватерниона: у зеркальных деталей (половинки
    // столешницы и т.п.) базис левосторонний, а кватернион отражение не выражает.
    const placement = p.placement
      ? {
        origin: { x: p.placement.origin.x, y: p.placement.origin.y, z: p.placement.origin.z },
        ax: { x: p.placement.ax.x, y: p.placement.ax.y, z: p.placement.ax.z },
        ay: { x: p.placement.ay.x, y: p.placement.ay.y, z: p.placement.ay.z },
        az: { x: p.placement.az.x, y: p.placement.az.y, z: p.placement.az.z },
      }
      : placementFromPosQuat(p.pos, p.quat);
    const contour = panelContour(p.poly, p.cuts);
    const bb = contourBBox(contour);
    const wbb = worldBBox(contour, placement, p.thick || 0);
    // знак толщины ВАЖЕН: у профилей (трубы, «Вычитание тел») экструзия может идти
    // в −Z локально (thick<0). Срезали знак через Math.abs — деталь уезжает в
    // противоположную сторону (пример: ножки-салазки Color Block оказывались под полом).
    const thRaw = Number(p.thick) || 0;
    const signedThick = thRaw < 0 ? thRaw : (thRaw || 16);
    const kind = classifyKind(p.name);
    const mat = shortMat(p.mat);
    const holes = (p.holes || []).map((h) => ({
      faceX: h.x || 0,
      faceY: h.y || 0,
      diameter: h.d || 0,
      depth: h.thru ? Math.abs(signedThick) : (h.depth || 0),
      side: h.face === 'B' ? 'B' : h.face === 'T' ? 'T' : 'A',
      name: HOLE_NAMES[h.type] || h.type || 'крепёж',
      color: h.color || HOLE_COLORS[h.type] || null,
      z: h.z, ang: h.ang,
    }));
    const pockets = (p.pockets || []).map((pk) => {
      if (pk.t === 'circle') return { t: 'circle', x: pk.x, y: pk.y, r: pk.r, depth: pk.depth, face: pk.face === 'B' ? 'B' : 'A' };
      return { t: 'poly', pts: pk.pts || [], depth: pk.depth, face: pk.face === 'B' ? 'B' : 'A' };
    });
    return {
      id: 'b' + idx,
      mode: 'panel3',
      name: p.des ? (p.des + ' — ' + p.name) : (p.name || 'Деталь'),
      kind,
      material: mat || null,
      v3: {
        des: p.des || '',
        name: p.name || '',
        contour,
        placement,
        thickness: signedThick,
        assembly: p.group || '',
        asmNames: (p.group || '').split(' / '),
        asmGid: p.gid || '',
        grain: p.grain,
      },
      matColor: matColors[mat] || nameColorHint(mat || p.name || p.des),
      matData: matTex[mat] || texByHash(p.tex),
      x: wbb.x, y: wbb.y, z: wbb.z, w: wbb.w, h: wbb.h, d: wbb.d,
      faceW: bb.w, faceH: bb.h,
      butts: (p.butts || []).map((b) => ({
        sign: b.sign || '', mat: b.mat || '', thick: b.thick || 0, width: b.width || 0,
        elem: b.elem, seg: b.seg || null, col: b.col || null,
      })),
      holes,
      pockets,
      // облицовка пластей / запилы 45° / сложные фрезы (если экспортёр их положил)
      plastics: p.plastics || [],
      profile_cuts: p.profile_cuts || [],
      bevel_raw: p.bevel_raw || [],
    };
  });

  // профили (погонаж, ручки-профили) — как отдельные детали
  (data.profiles || []).forEach((pr, idx) => {
    // поддерживаем оба вида: poly+pos/quat и contour+placement
    const hasPoly = Array.isArray(pr.poly) && pr.poly.length >= 3;
    const contour = hasPoly ? panelContour(pr.poly, pr.cuts || []) : (pr.contour || []);
    if (!contour.length) return;
    // «Отверстие»/«Отверстия» — служебные CSG-тела Базиса (инструмент сверления),
    // а не детали: в выгрузке detalQR их нет, наш новый экспортёр их тоже
    // пропускает, а в старых файлах они рисовались лишними планками
    if (/^\u041e\u0442\u0432\u0435\u0440\u0441\u0442/i.test(String(pr.name || ''))) return;
    const placement = pr.placement
      ? {
        origin: { x: pr.placement.origin.x, y: pr.placement.origin.y, z: pr.placement.origin.z },
        ax: { x: pr.placement.ax.x, y: pr.placement.ax.y, z: pr.placement.ax.z },
        ay: { x: pr.placement.ay.x, y: pr.placement.ay.y, z: pr.placement.ay.z },
        az: { x: pr.placement.az.x, y: pr.placement.az.y, z: pr.placement.az.z },
      }
      : placementFromPosQuat(pr.pos, pr.quat);
    const bb = contourBBox(contour);
    // знак толщины = направление выдавливания (нога-труба «растёт» вниз)
    const thRaw = Number(pr.thick !== undefined ? pr.thick : (pr.thickness !== undefined ? pr.thickness : 20)) || 20;
    const th = Math.abs(thRaw);
    const wbb = worldBBox(contour, placement, thRaw < 0 ? -th : th);
    const mat = shortMat(pr.material || pr.mat);
    parts.push({
      id: 'b' + (parts.length + idx),
      mode: 'panel3',
      name: 'Профиль: ' + (pr.name || 'погонаж'),
      kind: 'profile',
      material: mat || null,
      v3: {
        des: pr.des || '',
        name: (pr.name || 'профиль'),
        contour,
        placement,
        thickness: thRaw < 0 ? -th : th,
        assembly: pr.group || pr.assembly || '',
        asmNames: (pr.group || pr.assembly || '').split(' / '),
        asmGid: pr.gid || '',
      },
      matColor: matColors[mat] || nameColorHint(mat || pr.name),
      matData: matTex[mat] || texByHash(pr.tex),
      anim: (typeof pr.anim === 'number' && pr.anim >= 0) ? pr.anim : -1,
      uid: Number(pr.uid) || 0,
      x: wbb.x, y: wbb.y, z: wbb.z, w: wbb.w, h: wbb.h, d: wbb.d,
      faceW: bb.w, faceH: bb.h,
      butts: [],
      holes: [],
      pockets: [],
      plastics: [],
      profile_cuts: [],
      bevel_raw: [],
    });
  });


  // совместимость со старыми файлами (знак выдавливания у «Вычитание тел»)
  legacyExtrusionSignFix(parts);
  // и вывернутые рамки у зеркальных тел (конвенция одного сечения)
  frameConventionFix(parts);

  // мировые цилиндры отверстий (для 3D)
  const worldHoles = [];
  parts.forEach((p) => worldHoles.push(...panelHolesWorld(p, p.v3.placement, p.v3.thickness)));

  const { furn, fasteners } = parseFittings(data);
  // текстуры фурнитуры: у меша есть материал поверхности — отдаём вьюеру его текстуру
  furn.forEach((f) => { if (f.mat && matTex[f.mat]) f.matData = matTex[f.mat]; });

  return {
    source: 'detalqr-model',
    displayParts: true,
    info: data.info || null,
    // ракурс камеры Базиса на момент выгрузки: вьюер открывает модель под ним
    // (кнопка «Как в Базисе» возвращает его после вращения)
    view: (data.view && typeof data.view === 'object') ? data.view : null,
    parts,
    holes: worldHoles,
    furn,
    fasteners,
    fittingsByGid: fittingsByGidOf(data),
    dims: (data.dims || []).map((d) => ({ value: d.value, a: d.a, b: d.b, ea: d.ea, eb: d.eb, col: d.col })),
    // анимации (TFurnAnimation): {ax, bx} — ось в мировых координатах, ang — угол
    anims: Array.isArray(data.anims) ? data.anims : [],
    fittingsCount: (data.fittings || []).length,
    furniture: data.furniture || [],
  };
}

export function isDetalQRData(data) {
  return !!(data && data.info && Array.isArray(data.panels));
}
