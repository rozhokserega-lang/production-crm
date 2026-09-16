import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OrderService } from "../services/orderService";
import {
  MAX_RECOMMENDED_MODEL_BYTES,
  UNCOMPRESSED_BODY_LIMIT,
  formatBytes,
  groupArticlesBySection,
  readModelFile,
} from "../app/sectionModelFile";

/** Понятная причина ошибки загрузки (частый случай — лимит тела запроса у шлюза). */
function describeUploadError(err) {
  const raw = String(err?.message || err || "");
  if (/413|Request Entity Too Large/i.test(raw)) {
    return (
      "сервер отклонил файл из-за размера (413). На машине с базой нужно поднять лимит шлюза: " +
      "в scripts/local-db/nginx-gateway.conf добавить «client_max_body_size 25m;» и пересоздать " +
      "контейнер gateway (docker compose -f docker-compose.local-db.yml up -d --force-recreate gateway)"
    );
  }
  return raw;
}

/**
 * Под-вкладыш «3D-модели» во вкладке «Мебель»:
 * по секциям (section_catalog + item_article_map) — загрузка/замена/удаление
 * файла модели (JSON из «Экспорт модели в JSON-4.js»), просмотр и список
 * артикулов, привязанных к секции.
 */
export function FurnitureModelsPanel({ canEdit, sectionCatalogRows, openModelViewer, onModelChanged }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [okMessage, setOkMessage] = useState("");
  const [busySection, setBusySection] = useState("");
  const [catalogArticles, setCatalogArticles] = useState([]);
  const fileInputRef = useRef(null);
  const pendingSectionRef = useRef("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await OrderService.listSectionModels();
      setModels(Array.isArray(rows) ? rows : []);
      setError("");
    } catch (e) {
      setError(String(e?.message || e || "Не удалось загрузить список моделей"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    OrderService.getArticlesForImport()
      .then((rows) => setCatalogArticles(Array.isArray(rows) ? rows : []))
      .catch(() => setCatalogArticles([]));
  }, [refresh]);

  // секции: каталог + уже имеющие модель
  const sections = useMemo(() => {
    const names = new Set();
    (Array.isArray(sectionCatalogRows) ? sectionCatalogRows : []).forEach((r) => {
      const n = String(r.section_name || r.sectionName || "").trim();
      if (n) names.add(n);
    });
    models.forEach((m) => {
      const n = String(m.section_name || "").trim();
      if (n) names.add(n);
    });
    return [...names].sort((a, b) => a.localeCompare(b, "ru"));
  }, [sectionCatalogRows, models]);

  const modelBySection = useMemo(() => {
    const map = new Map();
    models.forEach((m) => map.set(String(m.section_name || "").trim(), m));
    return map;
  }, [models]);

  // артикулы по секциям — сверка «как секция складывается с артикулами»
  const articlesBySection = useMemo(() => groupArticlesBySection(catalogArticles), [catalogArticles]);

  const pickFile = (section) => {
    pendingSectionRef.current = section;
    fileInputRef.current?.click();
  };

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    const section = pendingSectionRef.current;
    if (!file || !section) return;
    setError("");
    setOkMessage("");
    if (file.size > MAX_RECOMMENDED_MODEL_BYTES) {
      setError(
        `Файл ${formatBytes(file.size)} — слишком большой для модели секции. ` +
          "Проверьте, что это JSON из «Экспорт модели в JSON-4.js», а не выгрузка целиком.",
      );
      return;
    }
    setBusySection(section);
    try {
      // читает байты, чинит кодировку (cp1251 у классического Базиса) и проверяет формат
      const model = await readModelFile(file);
      const res = await OrderService.uploadSectionModel({ section, fileName: file.name, model });
      const sizeNote = res?.compressed
        ? `${formatBytes(res.rawBytes)} → ${formatBytes(res.sentBytes)} (сжато${res?.parts > 1 ? `, ${res.parts} частями` : ""})`
        : formatBytes(res?.sentBytes ?? file.size);
      setOkMessage(
        `Секция «${section}»: модель загружена (${sizeNote}, ` +
          `${(model.panels || []).length} деталей).`,
      );
      if (!res?.compressed && res?.sentBytes > UNCOMPRESSED_BODY_LIMIT) {
        setError(
          "Браузер не смог сжать модель — она может не пройти лимит шлюза. " +
            "Обновите браузер или поднимите client_max_body_size на сервере БД.",
        );
      }
      await refresh();
      onModelChanged?.();
    } catch (err) {
      setError(`«${file.name}»: ${describeUploadError(err)}`);
    } finally {
      setBusySection("");
    }
  };

  const removeModel = async (section) => {
    if (!window.confirm(`Удалить модель секции «${section}»?`)) return;
    setError("");
    setOkMessage("");
    setBusySection(section);
    try {
      await OrderService.deleteSectionModel(section);
      setOkMessage(`Секция «${section}»: модель удалена.`);
      await refresh();
      onModelChanged?.();
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setBusySection("");
    }
  };

  return (
    <div className="furniture-models-panel">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={onFile}
      />
      <p className="furniture-models-panel__hint">
        Файл модели — JSON из скрипта «Экспорт модели в JSON-4.js» (Базис). Модель хранится в базе
        и открывается кнопкой «Модель» на карточке заказа во «Производстве». Артикулы добавляются
        к секции в «Основной мебели» (поле «Секция» + «Артикул изделия») или во вкладке «БД».
      </p>
      {loading ? <div className="empty">Загружаю список моделей…</div> : null}
      {error ? <div className="error">{error}</div> : null}
      {okMessage ? (
        <div className="ok-note" style={{ color: "#047857", fontSize: 13, margin: "6px 0" }}>
          {okMessage}
        </div>
      ) : null}
      {!loading && sections.length === 0 ? (
        <div className="empty">Нет секций. Создайте секцию в «Основной мебели».</div>
      ) : null}
      {sections.map((section) => {
        const m = modelBySection.get(section);
        const arts = articlesBySection.get(section) || [];
        const busy = busySection === section;
        return (
          <div
            key={section}
            className="furniture-models-panel__row"
            style={{ opacity: busy ? 0.6 : 1 }}
          >
            <div className="furniture-models-panel__main">
              <div className="furniture-models-panel__name" title={section}>
                {section}
              </div>
              <div className="furniture-models-panel__meta">
                {m ? (
                  <>
                    📦 {m.file_name || "без имени"} · {formatBytes(m.size_bytes)} ·{" "}
                    {Number(m.panels || 0)} деталей
                  </>
                ) : (
                  <span style={{ color: "#94a3b8" }}>модель не загружена</span>
                )}
              </div>
              <div className="furniture-models-panel__articles" title={arts.join(", ")}>
                {arts.length ? (
                  <>
                    <span style={{ color: "#64748b" }}>Артикулы ({arts.length}): </span>
                    {arts.slice(0, 12).join(", ")}
                    {arts.length > 12 ? ` и ещё ${arts.length - 12}` : ""}
                  </>
                ) : (
                  <span style={{ color: "#f59e0b" }}>
                    нет привязанных артикулов — заказы по этой секции не найдут модель
                  </span>
                )}
              </div>
            </div>
            <div className="furniture-models-panel__actions">
              {canEdit ? (
                <button type="button" className="mini ghost" disabled={busy} onClick={() => pickFile(section)}>
                  {m ? "Заменить" : "Загрузить"}
                </button>
              ) : null}
              {m ? (
                <>
                  <button
                    type="button"
                    className="mini"
                    disabled={busy}
                    onClick={() => openModelViewer?.({ section, title: section })}
                  >
                    Посмотреть
                  </button>
                  {canEdit ? (
                    <button type="button" className="mini warn" disabled={busy} onClick={() => removeModel(section)}>
                      Удалить
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
