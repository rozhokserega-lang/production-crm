import { resolvePlanPreviewArticleByName } from "../app/planPreviewHelpers";
import { getPlanPreviewArticleCode, stripPlanItemMeta } from "../app/orderHelpers";
import { PlanQrImage } from "./PlanQrImage";

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

export function PlanPreviewPrint({ planPreview, articleLookupByItemKey = null }) {
  if (!planPreview) return null;

  const fallbackArticle = resolvePlanPreviewArticleByName(planPreview, articleLookupByItemKey);
  const articleCode = getPlanPreviewArticleCode(planPreview) || fallbackArticle;

  return (
    <div className="plan-preview print-plan-page">
      <div className="plan-top-meta">
        <span>{planPreview.generatedAt || ""}</span>
        <span>Отгрузки CRM</span>
      </div>
      <div className="plan-head-grid">
        <div className="plan-yellow">
          <div className="name">
            {stripMaterialSuffix(planPreview.firstName || planPreview.detailedName || "-", planPreview.colorName)}
          </div>
          <div className="color">{planPreview.colorName || "-"}</div>
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
      <table className="plan-table">
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
              <td>{i === 0 ? stripMaterialSuffix(planPreview.firstName || "", planPreview.colorName) : ""}</td>
              <td style={{ fontWeight: i === 0 ? 800 : 400 }}>{i === 0 ? (planPreview.qty || 0) : ""}</td>
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
  );
}
