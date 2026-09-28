import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import OrderModelViewer from "../viewer3d/OrderModelViewer";
import { OrderService } from "../services/orderService";

/**
 * Окно 3D-просмотра модели секции (паттерн WorkshopFinalDoneDialog:
 * createPortal + .dialog-backdrop/.dialog-card, состояние в хуке).
 */
export function ModelViewerDialog({ open, title, subtitle, loading, error, model, onClose, onOpenScheme }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="dialog-backdrop">
      <div className="dialog-card model-viewer-dialog">
        <div className="model-viewer-dialog__head">
          <div className="model-viewer-dialog__titles">
            <h3>3D-модель{title ? ` — ${title}` : ""}</h3>
            {subtitle ? <div className="model-viewer-dialog__sub">{subtitle}</div> : null}
          </div>
          {/* инлайн-стиль, а не класс: styles.css сейчас содержит чужой WIP,
              который нельзя утаскивать в коммит этой фичи */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {onOpenScheme && (
              <button
                type="button"
                className="mini ghost"
                onClick={onOpenScheme}
                title="Схема сборки в отдельной вкладке: модуль, разлёт, позиции, кромка, печать"
              >
                Схема сборки ↗
              </button>
            )}
            <button type="button" className="mini ghost" onClick={onClose}>
              Закрыть (Esc)
            </button>
          </div>
        </div>
        <div className="model-viewer-dialog__body">
          {loading ? (
            <div className="empty">Загружаю модель из базы…</div>
          ) : error ? (
            <div className="error">{error}</div>
          ) : (
            <OrderModelViewer model={model} onOpenExternalScheme={onOpenScheme} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Состояние окна просмотра + карта «артикул → секция с моделью»
 * (карта грузится один раз и обновляется после загрузки/удаления моделей).
 */
export function useModelViewerDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [section, setSection] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState(null);
  const [modelSectionMap, setModelSectionMap] = useState([]);

  const refreshModelSectionMap = useCallback(async () => {
    try {
      const rows = await OrderService.listModelSectionMap();
      setModelSectionMap(Array.isArray(rows) ? rows : []);
    } catch (_) {
      setModelSectionMap([]);
    }
  }, []);

  useEffect(() => {
    void refreshModelSectionMap();
  }, [refreshModelSectionMap]);

  const openModelViewer = useCallback(async ({ section: sectionName, title: t, subtitle: sub }) => {
    const name = String(sectionName || "").trim();
    if (!name) return;
    setOpen(true);
    setLoading(true);
    setError("");
    setModel(null);
    setSection(name);
    setTitle(String(t || name || ""));
    setSubtitle(String(sub || ""));
    try {
      const row = await OrderService.getSectionModel(name);
      if (!row || !row.model) {
        setError(
          `У секции «${name}» ещё нет модели. Загрузите её во вкладке «Мебель» → «3D-модели».`,
        );
        return;
      }
      setModel(row.model);
    } catch (e) {
      setError(String(e?.message || e || "Не удалось загрузить модель"));
    } finally {
      setLoading(false);
    }
  }, []);

  const closeModelViewer = useCallback(() => {
    setOpen(false);
    setModel(null);
    setError("");
    setLoading(false);
    setTitle("");
    setSubtitle("");
    setSection("");
  }, []);

  /** Схема сборки в отдельной вкладке (scheme.html) — по секции открытой модели. */
  const openSchemeTab = useCallback(() => {
    const name = String(section || "").trim();
    if (!name) return;
    const url = `/scheme.html?section=${encodeURIComponent(name)}&name=${encodeURIComponent(title || name)}`;
    const popup = window.open(url, "_blank");
    if (!popup) {
      window.alert("Браузер заблокировал открытие вкладки. Разрешите всплывающие окна для этого сайта.");
    }
  }, [section, title]);

  return {
    modelViewerDialog: {
      open,
      title,
      subtitle,
      section,
      loading,
      error,
      model,
      close: closeModelViewer,
      openSchemeTab,
    },
    openModelViewer,
    modelSectionMap,
    refreshModelSectionMap,
  };
}
