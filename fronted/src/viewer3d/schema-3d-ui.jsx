import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, Layers3 } from 'lucide-react';

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
}) {
  const btn = (on) => ({
    fontSize: 11.5, padding: '5px 10px', cursor: 'pointer',
    background: on ? C.accent : 'transparent',
    color: on ? '#fff' : C.text,
    border: `1px solid ${on ? C.accent : C.hairline}`,
  });
  return (
    <div
      style={{
        position: 'absolute', top: 8, left: 8, right: 8, zIndex: 30,
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
        padding: '7px 10px', background: C.panel, border: `1px solid ${C.hairline}`,
        borderRadius: 4,
      }}
    >
      <button onClick={onExit} style={{ ...btn(false), display: 'flex', alignItems: 'center', gap: 5 }} title="Вернуться к обычному просмотру">
        <X size={12} /> Выйти из схемы
      </button>
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
      <span style={{ fontSize: 11, color: C.muted }}>позиций: {rowsCount}</span>
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
export function SchemeSpec({ rows, selectedId, hoverId, setHoverId, onPick, fittings }) {
  return (
    <div
      style={{
        position: 'absolute', top: 64, right: 8, width: 268, maxHeight: 'calc(100% - 96px)',
        overflowY: 'auto', zIndex: 25, background: C.panel,
        border: `1px solid ${C.hairline}`, borderRadius: 4, padding: '8px 0',
      }}
    >
      <div style={{ padding: '2px 10px 6px', fontSize: 11, letterSpacing: 0.4, color: C.muted }}>
        ПОЗИЦИИ МОДУЛЯ
      </div>
      {rows.map((r) => {
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
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.des || ''} {r.title}
              </div>
              <div style={{ fontSize: 10.5, color: C.muted }}>{r.size} · {r.mat}</div>
            </div>
          </div>
        );
      })}
      {rows.length === 0 && (
        <div style={{ padding: '6px 10px', fontSize: 11.5, color: C.muted }}>В модуле нет деталей.</div>
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

/* ---------- лист печати: снимок вида + легенда + список крепежа ---------- */
export function SchemePrintSheet({ data, onClose }) {
  const { url, title, subtitle, rows, fittings, dateStr } = data || {};
  return createPortal(
    <div className="scheme-print-root" style={{ position: 'fixed', inset: 0, zIndex: 1600, background: '#fff', overflow: 'auto' }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .scheme-print-root, .scheme-print-root * { visibility: visible !important; }
          .scheme-print-root { position: static !important; overflow: visible !important; }
          .scheme-print-toolbar { display: none !important; }
          .scheme-print-page { page-break-after: always; }
        }
      `}</style>
      <div className="scheme-print-toolbar" style={{ display: 'flex', gap: 8, padding: '10px 16px', borderBottom: `1px solid ${C.hairline}`, background: C.bg, position: 'sticky', top: 0 }}>
        <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 13, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none' }}>
          <Printer size={14} /> Печать / PDF
        </button>
        <button onClick={onClose} style={{ padding: '7px 14px', fontSize: 13, cursor: 'pointer', background: 'transparent', color: C.text, border: `1px solid ${C.hairline}` }}>
          Закрыть
        </button>
        <span style={{ fontSize: 12, color: C.muted, alignSelf: 'center' }}>
          Печатается только этот лист (в CRM окно модели при печати скрыто).
        </span>
      </div>

      <div className="scheme-print-page" style={{ padding: '10mm 8mm' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: `2px solid ${C.text}`, paddingBottom: 6 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 0.3 }}>ИНСТРУКЦИЯ СБОРКИ</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{title}{subtitle ? (' · ' + subtitle) : ''}</div>
          </div>
          <div style={{ fontSize: 11, color: C.muted }}>{dateStr}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 12, marginTop: 10 }}>
          <div style={{ border: `1px solid ${C.hairline}`, background: '#fff' }}>
            {url
              ? <img src={url} alt="Схема сборки" style={{ width: '100%', display: 'block' }} />
              : <div style={{ padding: 20, fontSize: 12, color: C.muted }}>Снимок вида не получен — обновите и нажмите печать ещё раз.</div>}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>ПОЗИЦИИ</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
              <thead>
                <tr style={{ background: C.bg }}>
                  <th style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px', width: 22 }}>№</th>
                  <th style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px', textAlign: 'left' }}>Обозн.</th>
                  <th style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px', textAlign: 'left' }}>Наименование</th>
                  <th style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px', textAlign: 'left', width: 92 }}>Размер</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px', textAlign: 'center', fontWeight: 600 }}>{r.num}</td>
                    <td style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px' }}>{r.des}</td>
                    <td style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px' }}>{r.title}</td>
                    <td style={{ border: `1px solid ${C.hairline}`, padding: '2px 4px' }}>{r.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {fittings && fittings.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 4px' }}>КРЕПЁЖ И ФУРНИТУРА</div>
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
            )}
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: C.muted }}>
          Номера на рисунке соответствуют номерам в таблице позиций. Разлёт деталей показан на момент печати.
        </div>
      </div>
    </div>,
    document.body
  );
}

export default { SchemeBar, SchemeSpec, SchemePrintSheet };
