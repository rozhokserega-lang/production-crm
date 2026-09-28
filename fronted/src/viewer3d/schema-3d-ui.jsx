import { createPortal } from 'react-dom';
import { Printer, X, Search, Pin } from 'lucide-react';
import { DimMark } from './spec-sheet.jsx';

/* UI схемы сборки: полоса управления, список позиций и лист печати.
 * Сама 3D-сцена живёт во вьюере — здесь только «бумажная» часть, чтобы
 * вьюер не разрастался. */

const C = {
  bg: '#f7f5ee',
  panel: 'rgba(252,250,244,0.96)',
  hairline: '#c9c9c2',
  text: '#25301f',
  muted: '#6d6f66',
  accent: '#b5701f',
  accentDim: '#f0e2cf',
};

/* ---------- полоса управления схемой ---------- */
export function SchemeBar({
  modules, asm, setAsm, explodeK, setExplodeK,
  showPos, setShowPos, showFast, setShowFast, showLead, setShowLead,
  rowsCount, onPrint, onExit,
  standalone = false, modelName = '', search = '', setSearch,
  shotsCount = 0, msg = '', onFix, onPrintPack, onClearShots,
}) {
  const btn = (on) => ({
    fontSize: 11.5, padding: '5px 10px', cursor: 'pointer',
    background: on ? C.accent : 'transparent',
    color: on ? '#fff' : C.text,
    border: `1px solid ${on ? C.accent : C.hairline}`,
  });
  const asmShort = asm ? String(asm).split(' / ').pop() : 'все модули';
  return (
    <div
      style={{
        position: 'absolute', top: 8, left: 8, right: 8, zIndex: 30,
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
        padding: '7px 10px', background: C.panel, border: `1px solid ${C.hairline}`,
        borderRadius: 4,
      }}
    >
      <button onClick={onExit} style={{ ...btn(false), display: 'flex', alignItems: 'center', gap: 5 }}
        title={standalone ? 'Закрыть вкладку схемы' : 'Вернуться к обычному просмотру'}>
        <X size={12} /> {standalone ? 'Закрыть вкладку' : 'Выйти из схемы'}
      </button>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>
        Схема сборки — {asmShort}
      </span>
      {modelName && (
        <span style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }} title={modelName}>
          Модель: {modelName}
        </span>
      )}
      {setSearch && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: `1px solid ${C.hairline}`, padding: '3px 6px', background: '#fff' }}>
          <Search size={12} color={C.muted} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск…"
            style={{ border: 'none', outline: 'none', width: 96, fontSize: 11.5, background: 'transparent', color: C.text, fontFamily: 'inherit' }}
          />
        </span>
      )}
      <span style={{ fontSize: 11.5, color: C.muted }}>Модуль</span>
      <select
        value={asm}
        onChange={(e) => setAsm(e.target.value)}
        style={{ fontSize: 11.5, padding: '4px 6px', border: `1px solid ${C.hairline}`, background: '#fff', maxWidth: 240 }}
      >
        <option value="">Все модули</option>
        {modules.map(([name, n]) => (
          <option key={name} value={name}>{shortAsm(name)} ({n})</option>
        ))}
      </select>
      <span style={{ fontSize: 11.5, color: C.muted }}>Разлёт</span>
      <input
        type="range" min="0" max="150" value={Math.round(explodeK * 100)}
        onChange={(e) => setExplodeK(Number(e.target.value) / 100)}
        style={{ width: 130 }}
        title="Насколько разнести детали"
      />
      <span style={{ fontSize: 11, color: C.muted, width: 34 }}>{Math.round(explodeK * 100)}%</span>
      <button onClick={() => setShowPos((v) => !v)} style={btn(showPos)} title="Кружки с номерами позиций">Позиции</button>
      <button onClick={() => setShowFast((v) => !v)} style={btn(showFast)} title="Показывать крепёж">Крепёж</button>
      <button onClick={() => setShowLead((v) => !v)} style={btn(showLead)} title="Линии от номера к детали">Выноски</button>
      <span style={{ flex: 1 }} />
      {msg && (
        <span style={{ fontSize: 11, color: C.accent, whiteSpace: 'nowrap' }}>{msg}</span>
      )}
      <span style={{ fontSize: 11, color: C.muted }}>позиций: {rowsCount}</span>
      {onFix && (
        <button onClick={onFix} style={{ ...btn(false), display: 'flex', alignItems: 'center', gap: 5 }}
          title="Запомнить текущий вид этой схемы для общей печати">
          <Pin size={12} /> Фиксация для печати
        </button>
      )}
      {onPrintPack && (
        <button
          onClick={onPrintPack}
          disabled={!shotsCount}
          style={{ ...btn(!!shotsCount), opacity: shotsCount ? 1 : 0.5, cursor: shotsCount ? 'pointer' : 'default' }}
          title="Напечатать все зафиксированные схемы одной пачкой"
        >
          Печать всех схем{shotsCount ? ` (${shotsCount})` : ''}
        </button>
      )}
      {onClearShots && shotsCount > 0 && (
        <button onClick={onClearShots} style={{ ...btn(false), display: 'flex', alignItems: 'center', gap: 3 }}
          title="Забыть зафиксированные схемы">
          <X size={12} />
        </button>
      )}
      <button onClick={onPrint} style={{ ...btn(true), display: 'flex', alignItems: 'center', gap: 5 }} title="Печать инструкции сборки">
        <Printer size={12} /> Печать
      </button>
    </div>
  );
}

function shortAsm(name) {
  const parts = String(name || '').split(' / ');
  return parts[parts.length - 1] || name;
}

/* ---------- список позиций модуля ---------- */
export function SchemeSpec({ rows, selectedId, hoverId, setHoverId, onPick, fittings, moduleInfo, search = '', top = 64 }) {
  const q = String(search || '').trim().toLowerCase();
  const shown = q
    ? rows.filter((r) => [r.num, r.des, r.title, r.mat].some((v) => String(v || '').toLowerCase().indexOf(q) >= 0))
    : rows;
  const modRows = moduleInfo
    ? [
        ['Наименование', moduleInfo.name || '—'],
        ['Габарит Ш×В×Г, мм', moduleInfo.dims ? moduleInfo.dims.join('×') : '—'],
        ['Деталей корпуса', String(moduleInfo.parts || 0)],
        ['Крепёж и фурнитура', String(moduleInfo.fittings || 0)],
      ]
    : null;
  return (
    <div
      style={{
        position: 'absolute', top, right: 8, width: 268, maxHeight: 'calc(100% - ' + (top + 32) + 'px)',
        overflowY: 'auto', zIndex: 25, background: C.panel,
        border: `1px solid ${C.hairline}`, borderRadius: 4, padding: '8px 0',
      }}
    >
      {modRows && (
        <div style={{ padding: '2px 10px 8px', borderBottom: `1px solid ${C.hairline}`, marginBottom: 6 }}>
          <div style={{ fontSize: 11, letterSpacing: 0.4, color: C.muted, marginBottom: 4 }}>МОДУЛЬ</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {modRows.map(([k, v]) => (
                <tr key={k}>
                  <td style={{ fontSize: 10.5, color: C.muted, padding: '1px 0', verticalAlign: 'top' }}>{k}</td>
                  <td style={{ fontSize: 10.5, color: C.text, padding: '1px 0', textAlign: 'right', fontFamily: 'ui-monospace, monospace', maxWidth: 120, wordBreak: 'break-word' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ padding: '2px 10px 6px', fontSize: 11, letterSpacing: 0.4, color: C.muted }}>
        ПОЗИЦИИ МОДУЛЯ{q ? ` · найдено ${shown.length} из ${rows.length}` : ''}
      </div>
      {shown.map((r) => {
        const active = r.id === selectedId || r.id === hoverId;
        return (
          <div
            key={r.id}
            onMouseEnter={() => setHoverId(r.id)}
            onMouseLeave={() => setHoverId(null)}
            onClick={() => onPick(r.id)}
            style={{
              display: 'flex', gap: 8, padding: '5px 10px', cursor: 'pointer',
              background: active ? C.accentDim : 'transparent',
              borderLeft: `3px solid ${active ? C.accent : 'transparent'}`,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: C.accent, minWidth: 18, textAlign: 'right' }}>{r.num}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.des || ''} {r.title}
              </div>
              <div style={{ fontSize: 10.5, color: C.muted }}>{r.size} · {r.mat}</div>
              {r.edges && r.edges.length > 0 && (
                <div style={{ display: 'flex', gap: 2, marginTop: 2 }} title="Кромка: линия над размером — дальняя сторона, под — ближняя; пунктир — 0,4 мм">
                  <DimMark value={r.w} edges={r.edges} axis="w" width={56} fontScale={0.9} />
                  <DimMark value={r.h} edges={r.edges} axis="h" width={56} fontScale={0.9} />
                </div>
              )}
            </div>
          </div>
        );
      })}
      {shown.length === 0 && (
        <div style={{ padding: '6px 10px', fontSize: 11.5, color: C.muted }}>
          {q ? 'Ничего не найдено.' : 'В модуле нет деталей.'}
        </div>
      )}
      {fittings && fittings.length > 0 && (
        <>
          <div style={{ padding: '10px 10px 4px', fontSize: 11, letterSpacing: 0.4, color: C.muted }}>
            КРЕПЁЖ И ФУРНИТУРА
          </div>
          {fittings.map(([name, n]) => (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 10px' }}>
              <span style={{ fontSize: 11.5, color: C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              <span style={{ fontSize: 11.5, color: C.accent, fontWeight: 600 }}>{n}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ---------- лист печати: чертёж (в сборе + настроенный вид) и спецификация ----------
 * Как в kk3d: A4 альбомный, поля 8 мм. Первый лист — чертёж, поделённый
 * пополам: слева тот же модуль «в сборе» (разлёт 0, полупрозрачный, без
 * разметки — сквозь панели читается крепёж), справа настроенный вид с
 * разметкой. Второй лист — спецификация в колонках. Пачка печатает по два
 * листа на каждую зафиксированную схему. */
const PRINT_CSS = `
  @page { size: A4 landscape; margin: 8mm; }
  .spec-cols { columns: 2; column-gap: 8mm; }
  .spec-cols > div { break-inside: avoid-column; margin-bottom: 4mm; }
  @media print {
    /* остальная страница убирается совсем, а не через visibility: скрытая, но
       занимающая место разметка тянула за собой пустые листы */
    body > *:not(.scheme-print-root) { display: none !important; }
    .scheme-print-root { position: static !important; overflow: visible !important; background: #fff !important; }
    .scheme-print-toolbar { display: none !important; }
    .print-sheet { margin: 0 !important; padding: 0 !important; box-shadow: none !important; max-width: none !important; }
    /* разрыв ДО следующего листа, а не после предыдущего: иначе последний
       лист пачки выбрасывает пустую страницу в конце */
    .print-sheet + .print-sheet { break-before: page; }
    .spec-page { break-before: page; }
    .draw-half img { max-height: 174mm; }
  }
`;

const SHEET_STYLE = {
  background: '#fff', margin: '0 auto 12px', padding: '10mm 8mm',
  maxWidth: 1180, boxShadow: '0 2px 14px rgba(0,0,0,0.12)',
};

function FitCaption({ children }) {
  return (
    <div style={{ fontSize: 9.5, letterSpacing: 0.4, color: C.muted, padding: '3px 6px', textTransform: 'uppercase' }}>
      {children}
    </div>
  );
}

function PositionsTable({ rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
      <thead>
        <tr style={{ background: C.bg }}>
          <th style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px', width: 22 }}>№</th>
          <th style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px', textAlign: 'left' }}>Обозн.</th>
          <th style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px', textAlign: 'left' }}>Наименование</th>
          <th style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px', textAlign: 'left', width: 92 }}>Размер</th>
          <th style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px', width: 64 }}>Кромка</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px', textAlign: 'center', fontWeight: 600 }}>{r.num}</td>
            <td style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px' }}>{r.des}</td>
            <td style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px' }}>{r.title}</td>
            <td style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px' }}>{r.size}</td>
            <td style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px' }}>
              {r.edges && r.edges.length
                ? (
                  <div style={{ display: 'flex', gap: 2 }}>
                    <DimMark value={r.w} edges={r.edges} axis="w" width={56} fontScale={0.85} />
                    <DimMark value={r.h} edges={r.edges} axis="h" width={56} fontScale={0.85} />
                  </div>
                )
                : <span style={{ color: C.muted }}>—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FittingsTable({ fittings }) {
  if (!fittings || !fittings.length) return null;
  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 700, margin: '0 0 4px' }}>КРЕПЁЖ И ФУРНИТУРА</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
        <thead>
          <tr style={{ background: C.bg }}>
            <th style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px', textAlign: 'left' }}>Наименование</th>
            <th style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px', width: 40 }}>Кол.</th>
          </tr>
        </thead>
        <tbody>
          {fittings.map(([name, n]) => (
            <tr key={name}>
              <td style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px' }}>{name}</td>
              <td style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px', textAlign: 'center' }}>{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Один лист схемы: чертёж двумя половинами + спецификация вторым листом. */
function SheetBlock({ shot }) {
  const { title, subtitle, moduleInfo, module, rows, fittings, views, dateStr, explodePct } = shot || {};
  const hasAsm = !!(views && views.assembled);
  return (
    <div className="print-sheet" style={SHEET_STYLE}>
      <div className="draw-page">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: `2px solid ${C.text}`, paddingBottom: 6 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 0.3 }}>ИНСТРУКЦИЯ СБОРКИ</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{title}{subtitle ? (' · ' + subtitle) : ''}</div>
            {moduleInfo && (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                Модуль: {module || moduleInfo.name || '—'}
                {moduleInfo.dims ? ` · габарит ${moduleInfo.dims.join('×')} мм` : ''}
                {` · деталей ${moduleInfo.parts || 0}`}
                {moduleInfo.fittings ? ` · крепежа ${moduleInfo.fittings}` : ''}
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: C.muted }}>{dateStr}</div>
        </div>

        <div style={{ display: 'flex', border: `1px solid ${C.hairline}`, marginTop: 8 }}>
          {hasAsm && (
            <div className="draw-half" style={{ width: '50%', borderRight: `1px solid ${C.hairline}` }}>
              <FitCaption>В сборе</FitCaption>
              <img src={views.assembled} alt="Модуль в сборе" style={{ width: '100%', display: 'block' }} />
            </div>
          )}
          <div className="draw-half" style={{ width: hasAsm ? '50%' : '100%' }}>
            <FitCaption>Разлёт {explodePct != null ? explodePct : 100}% · номера позиций</FitCaption>
            {views && views.configured
              ? <img src={views.configured} alt="Схема сборки" style={{ width: '100%', display: 'block' }} />
              : <div style={{ padding: 20, fontSize: 12, color: C.muted }}>Снимок вида не получен — обновите и нажмите печать ещё раз.</div>}
          </div>
        </div>
      </div>

      <div className="spec-page" style={{ paddingTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          МОДУЛЬ {(module || '').toUpperCase()}
          {moduleInfo && moduleInfo.dims ? ` · ${moduleInfo.dims.join('×')} мм` : ''}
        </div>
        <div className="spec-cols">
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>ПОЗИЦИИ</div>
            <PositionsTable rows={rows || []} />
          </div>
          <div>
            <FittingsTable fittings={fittings} />
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: C.muted }}>
          Номера на рисунке соответствуют номерам в таблице позиций. Слева — модуль в сборе (крепёж виден сквозь панели),
          справа — текущий разлёт с разметкой. Кромка в колонке: линия над размером — дальняя сторона (верх/право),
          под — ближняя (низ/лево); пунктир — 0,4 мм, сплошная — толще.
        </div>
      </div>
    </div>
  );
}

export function SchemePrintSheet({ data, onClose }) {
  const shots = data && data.pack ? data.pack : (data ? [data] : []);
  const cnt = shots.length;
  return createPortal(
    <div className="scheme-print-root" style={{ position: 'fixed', inset: 0, zIndex: 1600, background: C.bg, overflow: 'auto' }}>
      <style>{PRINT_CSS}</style>
      <div className="scheme-print-toolbar" style={{ display: 'flex', gap: 8, padding: '10px 16px', borderBottom: `1px solid ${C.hairline}`, background: C.bg, position: 'sticky', top: 0, zIndex: 2 }}>
        <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 13, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none' }}>
          <Printer size={14} /> Печать / PDF
        </button>
        <button onClick={onClose} style={{ padding: '7px 14px', fontSize: 13, cursor: 'pointer', background: 'transparent', color: C.text, border: `1px solid ${C.hairline}` }}>
          Закрыть
        </button>
        <span style={{ fontSize: 12, color: C.muted, alignSelf: 'center' }}>
          {cnt > 1
            ? `Пачка: ${cnt} схем(ы) — по два листа на каждую (чертёж + спецификация).`
            : 'Лист 1 — чертёж, лист 2 — спецификация.'}
        </span>
      </div>
      {shots.map((s, i) => <SheetBlock key={s.key || i} shot={s} />)}
    </div>,
    document.body
  );
}

export default { SchemeBar, SchemeSpec, SchemePrintSheet };
