import { memo } from "react";
import { stripPlanItemMeta, extractPlanItemArticle } from "../app/orderHelpers";
import { sheetsFromTemplateKits } from "../app/appUtils";
import { findFurnitureTemplate, resolveKitsPerSheetFromTemplate } from "../app/furnitureMaterialYield";
import { resolvePipelineStage } from "../orderPipeline";

export const OperatorPilkaView = memo(function OperatorPilkaView({
  workshop,
  permissions,
  helpers,
}) {
  const {
    workshopRows,
    loading,
    actionLoading,
    isActionPending,
    runAction,
    shipmentOrders,
    shipmentBoard,
    furnitureCustomTemplates,
    normalizeFurnitureKey,
  } = workshop;
  const { canOperateWorkshopStage } = permissions;
  const canPilka = typeof canOperateWorkshopStage === "function"
    ? canOperateWorkshopStage("pilka")
    : permissions.canOperateProduction;
  const { isDone, isInWork, statusClass, resolveDefaultConsumeSheets, resolveDefaultConsumeSheetsFromBoard } = helpers;

  const isPending = (key) =>
    typeof isActionPending === "function" ? isActionPending(key) : actionLoading === key;

  const pilkaRows = workshopRows.filter((o) => resolvePipelineStage(o) === "pilka");

  if (loading) {
    return (
      <div className="operator-loading">
        <div className="operator-spinner" />
        <span>Загрузка...</span>
      </div>
    );
  }

  if (!pilkaRows.length) {
    return (
      <div className="operator-empty">
        <span className="operator-empty__icon">🪚</span>
        <span className="operator-empty__text">Нет заказов на пиле</span>
      </div>
    );
  }

  return (
    <div className="operator-pilka">
      <div className="operator-pilka__header">
        <span className="operator-pilka__title">🪚 ПИЛА</span>
        <span className="operator-pilka__count">{pilkaRows.length} заказов</span>
      </div>

      <div className="operator-pilka__list">
        {pilkaRows.map((o) => {
          const orderId = String(o.orderId || o.order_id || "");
          const rawItem = stripPlanItemMeta(String(o.item || ""));
          const displayArticle = extractPlanItemArticle(String(o.item || ""));
          const orderQty = Number(o.qty || 0);
          const pilkaDone = isDone(o.pilkaStatus);
          const pilkaInWork = isInWork(o.pilkaStatus);
          const isPaused = /пауза/i.test(String(o.pilkaStatus || ""));
          const displayMaterial = String(o.material || o.colorName || "").trim() || "—";
          const adminNote = String(o.adminComment ?? o.admin_comment ?? "").trim();

          return (
            <article
              key={orderId || `${o.item}-${o.row}`}
              className={`operator-card ${statusClass(o)} ${pilkaDone ? "operator-card--done" : ""} ${pilkaInWork ? "operator-card--work" : ""} ${isPaused ? "operator-card--pause" : ""}`}
            >
              <div className="operator-card__main">
                <div className="operator-card__item">
                  <strong>{rawItem || "—"}</strong>
                  {displayArticle && (
                    <span className="operator-card__article">{displayArticle}</span>
                  )}
                </div>

                <div className="operator-card__details">
                  <span className="operator-card__detail">
                    <span className="operator-card__label">Кол-во:</span>
                    <span className="operator-card__value">{orderQty}</span>
                  </span>
                  <span className="operator-card__detail">
                    <span className="operator-card__label">Материал:</span>
                    <span className="operator-card__value">{displayMaterial}</span>
                  </span>
                </div>

                {adminNote && (
                  <div className="operator-card__note">
                    <span className="operator-card__note-icon">💬</span>
                    {adminNote}
                  </div>
                )}
              </div>

              <div className="operator-card__actions">
                <button
                  type="button"
                  className={`operator-btn operator-btn--start ${pilkaInWork ? "operator-btn--active" : ""}`}
                  disabled={
                    isPending(`webSetPilkaInWork:${orderId}`) ||
                    pilkaDone ||
                    pilkaInWork ||
                    !canPilka
                  }
                  onClick={() => runAction("webSetPilkaInWork", orderId, {})}
                >
                  <span className="operator-btn__icon">{isPaused ? "⏵" : "▶"}</span>
                  <span className="operator-btn__text">{isPaused ? "ПРОДОЛЖИТЬ" : "НАЧАТЬ"}</span>
                </button>

                <button
                  type="button"
                  className="operator-btn operator-btn--done"
                  disabled={
                    isPending(`webSetPilkaDone:${orderId}`) ||
                    pilkaDone ||
                    !pilkaInWork ||
                    !canPilka
                  }
                  onClick={() => {
                    const baseSheets = resolveDefaultConsumeSheets(o, shipmentOrders) || resolveDefaultConsumeSheetsFromBoard(o, shipmentBoard);
                    const fallbackSheets = (() => {
                      const kitsList = Array.isArray(furnitureCustomTemplates) ? furnitureCustomTemplates : [];
                      if (!kitsList.length) return 0;
                      const rawItem = stripPlanItemMeta(String(o.item || ""));
                      const normalize = typeof normalizeFurnitureKey === "function" ? normalizeFurnitureKey : (v) => String(v || "").toLowerCase().trim();
                      const tpl = findFurnitureTemplate(kitsList, rawItem, normalize);
                      const material = String(o.material || o.colorName || "").trim();
                      const kitsPerSheet = resolveKitsPerSheetFromTemplate(tpl, material);
                      const qty = Number(o.qty || 0) || 0;
                      return sheetsFromTemplateKits(kitsPerSheet, qty);
                    })();
                    const displaySheetsNeeded = Number(baseSheets || 0) > 0 ? baseSheets : fallbackSheets;
                    runAction("webSetPilkaDone", orderId, {}, {
                      defaultSheets: displaySheetsNeeded,
                      item: o.item,
                      material: displayMaterial,
                      isPlankOrder: String(o.item || "").includes("Планки обвязки"),
                    });
                  }}
                >
                  <span className="operator-btn__icon">✓</span>
                  <span className="operator-btn__text">ГОТОВО</span>
                </button>

                <button
                  type="button"
                  className={`operator-btn operator-btn--pause ${isPaused ? "operator-btn--paused" : ""}`}
                  disabled={
                    isPending(`webSetPilkaPause:${orderId}`) ||
                    pilkaDone ||
                    !pilkaInWork ||
                    !canPilka
                  }
                  onClick={() => runAction("webSetPilkaPause", orderId)}
                >
                  <span className="operator-btn__icon">⏸</span>
                  <span className="operator-btn__text">ПАУЗА</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
});
