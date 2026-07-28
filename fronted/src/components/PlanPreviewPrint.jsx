import { resolvePlanPreviewArticleByName } from "../app/planPreviewHelpers";
import {
  formatStrapPlanTargetCaption,
  getPlanPreviewArticleCode,
  stripPlanItemMeta,
} from "../app/orderHelpers";
import { PlanQrImage } from "./PlanQrImage";

function tableModelLabel(fullLabel) {
  const raw = String(fullLabel || "").trim();
  if (!raw) return "";
  const drawers = raw.match(/(\d+)\s*ящ/i);
  const width = raw.match(/ширина\s*(\d+)/i);
  if (drawers && width) return `Тумба ${width[1]} мм, ${drawers[1]} ящ.`;
  if (raw.length > 42) return `${raw.slice(0, 40)}…`;
  return raw;
}
function stripMaterialSuffix(name, material) {
  const rawName = stripPlanItemMeta(String(name || "")).trim();
  const rawMaterial = String(material || "").trim();
  if (!rawName) return "-";
  if (!rawMaterial) return rawName;
  const n = (v) =>
    String(v || "")
      .toLowerCase()
      .replace(/[ё]/g, "е")
      .replace(/\s+/g, " ")
      .trim();
  const m = n(rawMaterial);
  if (!m) return rawName;
  const parts = rawName.split(".").map((x) => String(x || "").trim()).filter(Boolean);
  if (parts.length >= 2 && n(parts[parts.length - 1]) === m) {
    return parts.slice(0, -1).join(". ");
  }
  return rawName;
}

function PlanBomTableCaption({ planPreview }) {
  const debug = planPreview?._furnitureDebug;
  return (
    <caption style={{ captionSide: "top", textAlign: "left", padding: "6px 0", color: "#b45309" }}>
      Показана строка-заглушка от сервера. Значит шаблон из Мебель.xlsx не применился (файл не загрузился или
      не найден шаблон для этого изделия).
      {debug ? (
        <div style={{ marginTop: 4, color: "#92400e", fontSize: 12 }}>
          debug: {String(debug.reason || "-")} / templates: {String(debug.templatesCount ?? "-")}
          {String(debug.furnitureLoading) === "true" ? " / loading" : ""}
          {String(debug.furnitureError || "").trim() ? ` / error: ${String(debug.furnitureError)}` : ""}
        </div>
      ) : null}
    </caption>
  );
}

export function PlanPreviewPrint({
  planPreview,
  articleLookupByItemKey = null,
  showFurnitureDebug = false,
}) {
  if (!planPreview) return null;

  const fallbackArticle = resolvePlanPreviewArticleByName(planPreview, articleLookupByItemKey);
  const articleCode = getPlanPreviewArticleCode(planPreview) || fallbackArticle;
  const strapCaption = formatStrapPlanTargetCaption(
    planPreview.strapTargetProduct || (Array.isArray(planPreview.products) ? planPreview.products[0] : ""),
    planPreview.planNumber || planPreview.week,
    planPreview.firstName || planPreview.detailedName,
  );
  const itemLabel = stripMaterialSuffix(
    planPreview.firstName || planPreview.detailedName || "-",
    planPreview.colorName,
  );

  return (
    <div className="plan-preview print-plan-page">
      <div className="plan-top-meta no-print">
        <span>{planPreview.generatedAt || ""}</span>
        <span>Отгрузки CRM</span>
      </div>
      <div className="plan-head-grid">
        <div className="plan-yellow">
          <div className="name">{itemLabel}</div>
          <div className="color">{planPreview.colorName || "-"}</div>
          {!!strapCaption && <div className="strap-target">{strapCaption}</div>}
        </div>
        <div className="plan-right-meta">
          <div className="plan-number-box">
            <div>ПЛАН</div>
            <div className="num">{planPreview.planNumber || "-"}</div>
          </div>
          <div className="plan-qr-box">
            <PlanQrImage planPreview={planPreview} articleCode={articleCode} />
            <div className="plan-qr-caption">Артикул / план / заказ</div>
          </div>
        </div>
      </div>
      <div className="plan-table-wrap">
        <table className="plan-table">
          {showFurnitureDebug ? <PlanBomTableCaption planPreview={planPreview} /> : null}
          <colgroup>
            <col className="plan-col-model" />
            <col className="plan-col-kit-qty" />
            <col className="plan-col-detail" />
            <col className="plan-col-part-qty" />
            <col className="plan-col-stage" />
            <col className="plan-col-stage" />
            <col className="plan-col-stage" />
            <col className="plan-col-stage" />
            <col className="plan-col-stage" />
          </colgroup>
          <thead>
            <tr>
              <th className="w-model"></th>
              <th className="w-qty"></th>
              <th>Деталь</th>
              <th>Кол-во</th>
              <th>Пила</th>
              <th>Кромка</th>
              <th>При 1</th>
              <th>При 2</th>
              <th>Упаковка</th>
            </tr>
          </thead>
          <tbody>
            {(planPreview.rows || []).map((r, i) => (
              <tr key={`${r.part}-${i}`}>
                <td className="plan-cell-model">{i === 0 ? tableModelLabel(itemLabel) : ""}</td>
                <td className="plan-cell-kit-qty" style={{ fontWeight: i === 0 ? 800 : 400 }}>
                  {i === 0 ? (planPreview.qty || 0) : ""}
                </td>
                <td>{stripPlanItemMeta(r.part)}</td>
                <td>{r.qty}</td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
