/**
 * Схема сборки отдельной вкладкой (scheme.html).
 *
 * /scheme.html — страница-выборка: список моделей из базы, клик открывает схему,
 *                ссылка «3D» — обычный просмотр этой же модели;
 * /scheme.html?section=<имя секции>&name=<подпись> — сразу режим схемы:
 *                выбор модуля, разлёт, позиции, кромка, печать;
 * /scheme.html?section=…&mode=model — обычный 3D-просмотр (без схемы).
 * Кнопка из окна модели CRM открывает второй вариант (window.open).
 *
 * Точка входа без провайдеров и логина — как material-calc.html:
 * web_get_section_model и карта секций разрешены anon-ключу, а на том же
 * домене сессия CRM и так общая (localStorage).
 */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import CabinetViewer from "./cabinet-3d-viewer-3.jsx";
import { isDetalQRData, parseDetalQR } from "./detalqr-adapter.js";
import { OrderService } from "../services/orderService.js";

const PAGE_STYLE = {
  minHeight: "100vh",
  background: "#f7f5ee",
  color: "#25301f",
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

const CARD_STYLE = {
  maxWidth: 560,
  margin: "12vh auto 0",
  padding: "28px 32px",
  background: "#fff",
  border: "1px solid #c9c9c2",
  borderRadius: 6,
  boxShadow: "0 10px 34px rgba(0,0,0,0.10)",
  textAlign: "center",
};

/** Страница-выбор: /scheme.html без параметров — список моделей из базы
 *  (карта секций читается anon-ключом). Клик открывает схему сборки,
 *  ссылка «3D» — обычный просмотр этой же модели. */
function ModelPicker() {
  const [state, setState] = useState({ loading: true, error: "", rows: [] });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await OrderService.listModelSectionMap();
        if (!alive) return;
        // у секции одна модель: дубликаты секций (разные артикулы-цвета) схлопываем
        const seen = new Set();
        const uniq = (Array.isArray(rows) ? rows : []).filter((r) => {
          if (!r || !r.section_name || seen.has(r.section_name)) return false;
          seen.add(r.section_name);
          return true;
        });
        setState({ loading: false, error: "", rows: uniq });
      } catch (e) {
        if (alive) setState({ loading: false, error: `Не удалось получить список моделей: ${e?.message || e}`, rows: [] });
      }
    })();
    return () => { alive = false; };
  }, []);

  const open = (row, mode) => {
    const q = new URLSearchParams({
      section: row.section_name,
      name: String(row.item_name || row.section_name),
    });
    if (mode === "model") q.set("mode", "model");
    window.location.assign(`${window.location.pathname}?${q.toString()}`);
  };

  return (
    <div style={{ ...PAGE_STYLE, padding: "6vh 16px 60px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ fontSize: 21, fontWeight: 700, marginBottom: 4 }}>3D-модели и схемы сборки</div>
        <div style={{ fontSize: 13, color: "#6d6f66", marginBottom: 18 }}>
          Отдельная страница без входа в CRM. Список — модели, загруженные в базу (вкладка «Мебель» → «3D-модели»).
        </div>
        {state.loading && <div style={{ fontSize: 13, color: "#6d6f66" }}>Загружаю список моделей…</div>}
        {!state.loading && state.error && (
          <div style={{ padding: "14px 16px", background: "#fff6f2", border: "1px solid #e0b6a4", borderRadius: 6, fontSize: 13, color: "#8a3c1e" }}>
            {state.error}
          </div>
        )}
        {!state.loading && !state.error && state.rows.length === 0 && (
          <div style={{ fontSize: 13, color: "#6d6f66" }}>В базе пока нет моделей.</div>
        )}
        {state.rows.map((r) => (
          <div
            key={r.section_name}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px", marginBottom: 8, background: "#fff",
              border: "1px solid #c9c9c2", borderRadius: 6, cursor: "pointer",
            }}
            onClick={() => open(r, "scheme")}
            title="Открыть схему сборки"
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14.5, color: "#25301f" }}>{r.item_name || r.section_name}</div>
              <div style={{ fontSize: 11.5, color: "#6d6f66", fontFamily: "ui-monospace, monospace" }}>
                {r.article || "—"} · секция «{r.section_name}»
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); open(r, "model"); }}
              style={{ padding: "6px 12px", fontSize: 12, cursor: "pointer", background: "transparent", color: "#b5701f", border: "1px solid #b5701f", borderRadius: 4, flexShrink: 0 }}
              title="Обычный 3D-просмотр модели"
            >
              3D
            </button>
            <span style={{ fontSize: 12, color: "#fff", background: "#b5701f", padding: "6px 12px", borderRadius: 4, flexShrink: 0 }}>
              Схема сборки
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SchemeStandalone() {
  const [state, setState] = useState({ loading: true, error: "", model: null, name: "" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = (params.get("section") || "").trim();
    const name = (params.get("name") || "").trim();
    if (!section) {
      setState({ loading: false, name, error: "", picker: true });
      return undefined;
    }
    let alive = true;
    (async () => {
      try {
        const row = await OrderService.getSectionModel(section);
        if (!alive) return;
        if (!row || !row.model) {
          setState({ loading: false, name, error: `Модель секции «${section}» не найдена в базе.` });
          return;
        }
        setState({ loading: false, error: "", model: row.model, name: name || row.file_name || section });
      } catch (e) {
        if (alive) setState({ loading: false, name, error: `Не удалось загрузить модель: ${e?.message || e}` });
      }
    })();
    return () => { alive = false; };
  }, []);

  if (state.picker) return <ModelPicker />;

  if (state.loading) {
    return (
      <div style={{ ...PAGE_STYLE, paddingTop: "12vh", textAlign: "center" }}>
        <div style={CARD_STYLE}>
          <div style={{ fontSize: 16, marginBottom: 6 }}>Схема сборки</div>
          <div style={{ fontSize: 13, color: "#6d6f66" }}>Загрузка модели из базы…</div>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div style={{ ...PAGE_STYLE, paddingTop: "12vh", textAlign: "center" }}>
        <div style={CARD_STYLE}>
          <div style={{ fontSize: 16, marginBottom: 8, color: "#a33c1e" }}>Схема сборки не открылась</div>
          <div style={{ fontSize: 13, color: "#6d6f66", whiteSpace: "pre-wrap" }}>{state.error}</div>
          <button
            type="button"
            className="mini ghost"
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: "7px 16px", fontSize: 13, cursor: "pointer" }}
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  // формат detalQR (info+panels из «Экспорт модели в JSON») -> внутреннее
  // представление вьюера; остальное (v3/старое) проходит как есть
  let parsed = state.model;
  if (parsed && isDetalQRData(parsed)) {
    try {
      parsed = parseDetalQR(parsed);
    } catch (e) {
      return (
        <div style={{ ...PAGE_STYLE, paddingTop: "12vh", textAlign: "center" }}>
          <div style={CARD_STYLE}>
            <div style={{ fontSize: 16, marginBottom: 8, color: "#a33c1e" }}>Не удалось разобрать модель</div>
            <div style={{ fontSize: 13, color: "#6d6f66" }}>{String(e?.message || e)}</div>
          </div>
        </div>
      );
    }
  }

  // ?mode=model — обычный 3D-просмотр (вращение, материалы, деталировка);
  // по умолчанию — сразу режим схемы сборки
  const plainMode = (new URLSearchParams(window.location.search).get("mode") || "").trim() === "model";
  return (
    <CabinetViewer
      devModel={parsed}
      embedded
      schemeAuto={!plainMode}
      standalone
      modelName={state.name}
    />
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SchemeStandalone />
  </React.StrictMode>,
);
