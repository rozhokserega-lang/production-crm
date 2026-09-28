/**
 * Схема сборки отдельной вкладкой (scheme.html).
 *
 * /scheme.html?section=<имя секции>&name=<подпись> — та же модель, что в окне
 * 3D-просмотра CRM, но сразу в режиме схемы: выбор модуля, разлёт, позиции,
 * кромка, печать. Открывается кнопкой из окна модели (window.open).
 *
 * Точка входа без провайдеров и логина — как material-calc.html:
 * web_get_section_model разрешён anon-ключу, а на том же домене сессия CRM
 * и так общая (localStorage).
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

function SchemeStandalone() {
  const [state, setState] = useState({ loading: true, error: "", model: null, name: "" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = (params.get("section") || "").trim();
    const name = (params.get("name") || "").trim();
    if (!section) {
      setState({
        loading: false,
        name,
        error:
          "Не указана секция модели (?section=…). Откройте схему кнопкой «Схема сборки» из окна модели в CRM.",
      });
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

  return (
    <CabinetViewer
      devModel={parsed}
      embedded
      schemeAuto
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
