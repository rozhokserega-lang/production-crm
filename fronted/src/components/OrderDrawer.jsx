import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

function stageDotClass(status, isDone, isInWork) {
  if (isDone(status)) return "order-drawer__dot order-drawer__dot--done";
  if (isInWork(status)) return "order-drawer__dot order-drawer__dot--work";
  return "order-drawer__dot order-drawer__dot--wait";
}

function readAdminComment(row) {
  return String(row?.adminComment ?? row?.admin_comment ?? "").trim();
}

function readArticle(row) {
  return String(
    row?.article_code ||
      row?.articleCode ||
      row?.article ||
      row?.mapped_article_code ||
      row?.mappedArticleCode ||
      row?.source_row_id ||
      row?.sourceRowId ||
      "",
  ).trim();
}

function readTitle(row) {
  return String(row?.item_label || row?.itemLabel || row?.detailedName || row?.firstName || row?.itemName || row?.item || "").trim();
}

function splitTitleAndArticle(row) {
  const ARTICLE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,}$/;
  let article = readArticle(row);
  let title = readTitle(row);
  if (!title) return { title: "—", article: article || "" };
  if (!article) {
    const parts = title.split(/\s+/);
    const head = String(parts[0] || "").trim();
    if (ARTICLE_RE.test(head)) {
      article = head;
      const rest = title.slice(head.length).trim();
      if (rest) title = rest;
    }
  }
  return { title, article };
}

export function OrderDrawer({
  orderId,
  lines,
  open,
  onClose,
  getStageLabel,
  formatDateTimeRu,
  isDone,
  isInWork,
  getMaterialLabel,
  canEditAdminComment,
  onSaveAdminComment,
  savingAdminComment,
}) {
  const [commentDraft, setCommentDraft] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !orderId) return;
    const first = lines[0] || {};
    setCommentDraft(String(first.adminComment ?? first.admin_comment ?? ""));
  }, [open, orderId, lines]);

  if (!open || !orderId) return null;

  const first = lines[0] || {};
  const firstDisplay = splitTitleAndArticle(first);
  const pilkaS = first.pilkaStatus ?? first.pilka_status ?? first.pilka ?? "";
  const kromkaS = first.kromkaStatus ?? first.kromka_status ?? first.kromka ?? "";
  const prasS = first.prasStatus ?? first.pras_status ?? first.pras ?? "";
  const assemblyS = first.assemblyStatus ?? first.assembly_status ?? "";
  const orderLabel = String(orderId);
  const storedComment = readAdminComment(first);
  const showCommentBlock = canEditAdminComment || Boolean(storedComment);

  const updatedRaw =
    lines.reduce((acc, row) => {
      const t = row.updatedAt || row.updated_at || row.createdAt || row.created_at || "";
      return t > acc ? t : acc;
    }, "") || first.updatedAt || first.updated_at || "";

  const material =
    getMaterialLabel && first.item
      ? getMaterialLabel(String(first.item || "").trim(), first.material || first.colorName || "")
      : String(first.material || first.colorName || "").trim();

  async function handleSaveComment() {
    if (!onSaveAdminComment) return;
    await onSaveAdminComment(commentDraft.trim());
  }

  const drawer = (
    <div className="order-drawer-root" role="dialog" aria-modal="true" aria-labelledby="order-drawer-title">
      <div
        role="button"
        tabIndex={0}
        className="order-drawer-backdrop"
        aria-label="Закрыть"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <aside className="order-drawer">
        <header className="order-drawer__head">
          <div>
            <h2 id="order-drawer-title" className="order-drawer__title">
              Заказ #{orderLabel}
            </h2>
            <p className="order-drawer__stage">{getStageLabel(first)}</p>
          </div>
          <button type="button" className="order-drawer__close mini" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="order-drawer__section">
          <h3 className="order-drawer__h3">Кратко</h3>
          <ul className="order-drawer__meta">
            <li>
              <span>Артикул</span> <strong>{firstDisplay.article || "—"}</strong>
            </li>
            <li>
              <span>План (первая позиция)</span> <strong>{first.week || "—"}</strong>
            </li>
            <li>
              <span>Материал</span> <strong>{material || "—"}</strong>
            </li>
            {updatedRaw ? (
              <li>
                <span>Обновлено</span> <strong>{formatDateTimeRu(updatedRaw)}</strong>
              </li>
            ) : null}
          </ul>
        </div>

        <div className="order-drawer__section">
          <h3 className="order-drawer__h3">Состав заказа</h3>
          {lines.length === 0 ? (
            <p className="order-drawer__empty">Нет строк для этого заказа в загруженных данных.</p>
          ) : (
            <ul className="order-drawer__lines">
              {lines.map((row, idx) => {
                const lineDisplay = splitTitleAndArticle(row);
                const key = `${lineDisplay.title}-${idx}`;
                return (
                  <li key={key} className="order-drawer__line">
                    <span className="order-drawer__line-item">
                      {lineDisplay.title || "—"}
                      {lineDisplay.article ? ` (${lineDisplay.article})` : ""}
                    </span>
                    <span className="order-drawer__line-meta">
                      план {row.week || "—"} · кол-во {Number(row.qty || 0)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="order-drawer__section">
          <h3 className="order-drawer__h3">Производство</h3>
          <div className="order-drawer__pipeline">
            {[
              { label: "Пила", s: pilkaS },
              { label: "Кромка", s: kromkaS },
              { label: "Присадка", s: prasS },
              { label: "Сборка", s: assemblyS },
            ].map(({ label, s }) => (
              <div key={label} className="order-drawer__pipe-step">
                <span className={stageDotClass(s, isDone, isInWork)} title={String(s || "—")} />
                <span className="order-drawer__pipe-label">{label}</span>
              </div>
            ))}
          </div>
          <div className="order-drawer__statuses">
            <div>Пила: {pilkaS || "—"}</div>
            <div>Кромка: {kromkaS || "—"}</div>
            <div>Присадка: {prasS || "—"}</div>
            <div>Сборка: {assemblyS || "—"}</div>
          </div>
        </div>

        {showCommentBlock ? (
          <div className="order-drawer__section order-drawer__section--comment">
            <h3 className="order-drawer__h3">Комментарий администратора</h3>
            {canEditAdminComment ? (
              <>
                <textarea
                  className="order-drawer__textarea"
                  rows={4}
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder="Заметка для производства (видна при смене этапов)…"
                  maxLength={4000}
                />
                <div className="order-drawer__comment-actions">
                  <button
                    type="button"
                    className="mini ok"
                    disabled={savingAdminComment || !onSaveAdminComment}
                    onClick={() => void handleSaveComment()}
                  >
                    {savingAdminComment ? "Сохранение…" : "Сохранить"}
                  </button>
                </div>
              </>
            ) : (
              <p className="order-drawer__comment-readonly">{storedComment || "—"}</p>
            )}
          </div>
        ) : null}
      </aside>
    </div>
  );

  if (typeof document === "undefined" || !document.body) return drawer;
  return createPortal(drawer, document.body);
}
