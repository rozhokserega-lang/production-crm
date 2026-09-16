import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import OrderModelViewer from "../viewer3d/OrderModelViewer";
import { OrderService } from "../services/orderService";

/**
 * Окно 3D-просмотра модели секции (паттерн WorkshopFinalDoneDialog:
 * createPortal + .dialog-backdrop/.dialog-card, состояние в хуке).
 */
export function ModelViewerDialog({ open, title, subtitle, loading, error, model, onClose }) {
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
          <button type="button" className="mini ghost" onClick={onClose}>
            Закрыть (Esc)
          </button>
        </div>
        <div className="model-viewer-dialog__body">
          {loading ? (
            <div className="empty">Загружаю модель из базы…</div>
          ) : error ? (
            <div className="error">{error}</div>
          ) : (
            <OrderModelViewer model={model} />
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

  const openModelViewer = useCallback(async ({ section, title: t, subtitle: sub }) => {
    const sectionName = String(section || "").trim();
    if (!sectionName) return;
    setOpen(true);
    setLoading(true);
    setError("");
    setModel(null);
    setTitle(String(t || sectionName || ""));
    setSubtitle(String(sub || ""));
    try {
      const row = await OrderService.getSectionModel(sectionName);
      if (!row || !row.model) {
        setError(
          `У секции «${sectionName}» ещё нет модели. Загрузите её во вкладке «Мебель» → «3D-модели».`,
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
  }, []);

  return {
    modelViewerDialog: {
      open,
      title,
      subtitle,
      loading,
      error,
      model,
      close: closeModelViewer,
    },
    openModelViewer,
    modelSectionMap,
    refreshModelSectionMap,
  };
}
