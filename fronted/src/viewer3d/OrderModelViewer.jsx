import { useMemo } from "react";
import CabinetViewer from "./cabinet-3d-viewer-3.jsx";
import { parseDetalQR, isDetalQRData } from "./detalqr-adapter.js";

/**
 * Модель секции в окне просмотра CRM.
 * Объект модели уже получен из БД (web_get_section_model) — здесь только
 * определяется формат: detalQR (info+panels из «Экспорт модели в JSON-4.js»)
 * приводится к внутреннему представлению вьюера, остальное проходит как есть.
 */
export default function OrderModelViewer({ model }) {
  const parsed = useMemo(() => {
    if (!model) return null;
    try {
      return isDetalQRData(model) ? parseDetalQR(model) : model;
    } catch (e) {
      return { parseError: e };
    }
  }, [model]);

  if (!model) {
    return <div className="empty">Модель не загружена.</div>;
  }
  if (parsed && parsed.parseError) {
    const msg = String(parsed.parseError?.message || parsed.parseError);
    return (
      <div className="error">
        Не удалось разобрать модель: {msg}. Проверьте, что файл — это JSON из
        «Экспорт модели в JSON-4.js».
      </div>
    );
  }
  return <CabinetViewer devModel={parsed} embedded />;
}
