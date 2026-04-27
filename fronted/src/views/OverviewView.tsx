import { memo } from "react";
import { extractPlanItemArticle, stripPlanItemMeta } from "../app/orderHelpers";

interface OverviewColumnItem {
  orderId?: string;
  order_id?: string;
  item?: string;
  week?: string;
  qty?: number;
  product_article?: string;
  productArticle?: string;
  article_code?: string;
  articleCode?: string;
  article?: string;
  mapped_article_code?: string;
  mappedArticleCode?: string;
  item_label?: string;
  itemLabel?: string;
  detailedName?: string;
  firstName?: string;
  itemName?: string;
  adminComment?: string;
  admin_comment?: string;
  pilkaStatus?: string;
  pilka_status?: string;
  pilka?: string;
  kromkaStatus?: string;
  kromka_status?: string;
  kromka?: string;
  prasStatus?: string;
  pras_status?: string;
  pras?: string;
  assemblyStatus?: string;
  assembly_status?: string;
  overallStatus?: string;
  overall_status?: string;
  overall?: string;
  shippingDoneAt?: string;
  shipping_done_at?: string;
  updatedAt?: string;
  updated_at?: string;
  createdAt?: string;
  created_at?: string;
  [key: string]: unknown;
}

interface OverviewColumn {
  id: string;
  title: string;
  items: OverviewColumnItem[];
}

interface OverviewViewProps {
  overviewSubView: string;
  filtered: OverviewColumnItem[];
  loading: boolean;
  overviewColumns: OverviewColumn[];
  getStageLabel: (row: OverviewColumnItem) => string;
  overviewShippedOnly: OverviewColumnItem[];
  formatDateTimeRu: (v: string) => string;
  onOpenOrderDrawer: (orderId: string) => void;
}

export const OverviewView = memo(function OverviewView({
  overviewSubView,
  filtered,
  loading,
  overviewColumns,
  getStageLabel,
  overviewShippedOnly,
  formatDateTimeRu,
  onOpenOrderDrawer,
}: OverviewViewProps) {
  const ARTICLE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,}$/;
  const readArticle = (row: OverviewColumnItem): string =>
    String(
      row?.product_article ||
        row?.productArticle ||
      row?.article_code ||
        row?.articleCode ||
        row?.article ||
        row?.mapped_article_code ||
        row?.mappedArticleCode ||
        "",
    ).trim();
  const readTitle = (row: OverviewColumnItem): string =>
    stripPlanItemMeta(
      String(row?.item_label || row?.itemLabel || row?.detailedName || row?.firstName || row?.itemName || row?.item || "").trim(),
    );
  const splitTitleAndArticle = (row: OverviewColumnItem): { title: string; article: string } => {
    let article = readArticle(row);
    let title = readTitle(row);
    if (!article) {
      const embedded = extractPlanItemArticle(
        String(row?.item_label || row?.itemLabel || row?.detailedName || row?.firstName || row?.itemName || row?.item || ""),
      );
      if (embedded) article = embedded;
    }
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
  };
  const readDetailedStatus = (row: OverviewColumnItem, laneId: string): string => {
    if (laneId === "pilka") {
      return String(row?.pilkaStatus || row?.pilka_status || row?.pilka || "").trim();
    }
    if (laneId === "kromka") {
      return String(row?.kromkaStatus || row?.kromka_status || row?.kromka || "").trim();
    }
    if (laneId === "pras") {
      return String(row?.prasStatus || row?.pras_status || row?.pras || "").trim();
    }
    if (laneId === "workshop_complete" || laneId === "assembled") {
      return String(row?.assemblyStatus || row?.assembly_status || "").trim();
    }
    return String(row?.overallStatus || row?.overall_status || row?.overall || "").trim();
  };

  return (
    <>
      {overviewSubView === "kanban" && (
        <>
          {!filtered.length && !loading && <div className="empty">Нет заказов для обзора</div>}
          {overviewColumns.some((c) => c.items.length) && (
            <div className="overview-board">
              {overviewColumns.map((col) => (
                <div key={col.id} className="overview-column">
                  <div className="overview-column__head">
                    <span>{col.title}</span>
                    <span className="section-count">{col.items.length}</span>
                  </div>
                  <div className="overview-column__list">
                    {col.items.map((o) => {
                      const orderId = String(o.orderId || o.order_id || "");
                      const { title, article } = splitTitleAndArticle(o);
                      const adminCommentMark = String(o.adminComment ?? o.admin_comment ?? "").trim();
                      const openDrawer = () => {
                        if (orderId && typeof onOpenOrderDrawer === "function") onOpenOrderDrawer(orderId);
                      };
                      const onCardKeyDown = (e: React.KeyboardEvent) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        openDrawer();
                      };
                      return (
                        <article
                          key={`${col.id}-${orderId || o.item}`}
                          className={`overview-card overview-card--clickable lane-${col.id}${
                            adminCommentMark ? " overview-card--has-admin-comment" : ""
                          }`}
                          role={orderId ? "button" : undefined}
                          tabIndex={orderId ? 0 : undefined}
                          onClick={openDrawer}
                          onKeyDown={onCardKeyDown}
                        >
                          <div className="overview-card__id">#{orderId || "-"}</div>
                          <div className="overview-card__item">{title || "—"}</div>
                          {article ? <div className="overview-card__meta">Артикул: {article}</div> : null}
                          <div className="overview-card__meta">
                            <span>План: {o.week || "-"}</span>
                            <span>Кол-во: {Number(o.qty || 0)}</span>
                          </div>
                          <div className={`overview-card__stage lane-${col.id}`}>{getStageLabel(o)}</div>
                          {readDetailedStatus(o, col.id) ? (
                            <div className="overview-card__meta">{readDetailedStatus(o, col.id)}</div>
                          ) : null}
                          {adminCommentMark ? (
                            <span
                              className="overview-card__admin-marker"
                              title="Есть комментарий администратора"
                              aria-label="Есть комментарий администратора"
                            >
                              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                                <circle cx="12" cy="12" r="11" fill="#ea580c" />
                                <path
                                  fill="#ffffff"
                                  d="M12 6.2 16 8.9v6.2L12 17.8 8 15.1V8.9l4-2.7zm0 1.2-2.9 1.9v4.2L12 15.4l2.9-1.9V9.3L12 7.4z"
                                />
                              </svg>
                            </span>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {overviewSubView === "shipped" && (
        <>
          {!overviewShippedOnly.length && !loading && <div className="empty">Нет отгруженных заказов</div>}
          {overviewShippedOnly.length > 0 && (
            <div className="sheet-table-wrap">
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>ID заказа</th>
                    <th>Изделие</th>
                    <th>План</th>
                    <th>Кол-во</th>
                    <th>Дата отгрузки</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {[...overviewShippedOnly]
                    .sort((a, b) => {
                      const at = new Date(
                        a.shippingDoneAt || a.shipping_done_at || a.updatedAt || a.updated_at || a.createdAt || a.created_at || 0
                      ).getTime();
                      const bt = new Date(
                        b.shippingDoneAt || b.shipping_done_at || b.updatedAt || b.updated_at || b.createdAt || b.created_at || 0
                      ).getTime();
                      return bt - at || String(a.item || "").localeCompare(String(b.item || ""), "ru");
                    })
                    .map((o) => {
                      const orderId = String(o.orderId || o.order_id || "");
                      const shippedAt =
                        o.shippingDoneAt ||
                        o.shipping_done_at ||
                        o.updatedAt ||
                        o.updated_at ||
                        o.createdAt ||
                        o.created_at ||
                        "";
                      return (
                        <tr key={`shipped-${orderId || o.item}`}>
                          <td>{orderId || "-"}</td>
                          <td>{o.item || "-"}</td>
                          <td>{o.week || "-"}</td>
                          <td>{Number(o.qty || 0)}</td>
                          <td>{formatDateTimeRu(shippedAt)}</td>
                          <td>{getStageLabel(o)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
});
