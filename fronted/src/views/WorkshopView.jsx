import { memo, useMemo } from "react";
import { KROMKA_EXECUTORS, PRAS_EXECUTORS } from "../config";
import { stripPlanItemMeta } from "../app/orderHelpers";
import { STRAP_OPTIONS } from "../constants/views";

// Extract strap type code from STRAP_OPTIONS like "Обвязка (1158_50)" → "1158_50"
const STRAP_TYPE_CODES = new Set(
  STRAP_OPTIONS.map((opt) => {
    const m = String(opt).match(/\((\d{2,5}[_x]\d{2,5})\)/);
    return m ? m[1] : null;
  }).filter(Boolean),
);

function extractStrapCode(detailName) {
  const m = String(detailName || "").match(/\((\d{2,5}[_x]\d{2,5})\)/);
  return m ? m[1] : null;
}

export const WorkshopView = memo(function WorkshopView({
  workshopRows,
  loading,
  tab,
  shipmentOrders,
  shipmentBoard,
  statusClass,
  resolveDefaultConsumeSheets,
  resolveDefaultConsumeSheetsFromBoard,
  isDone,
  isInWork,
  isOrderCustomerShipped,
  actionLoading,
  isActionPending,
  canOperateProduction,
  runAction,
  executorByOrder,
  setExecutorByOrder,
  executorOptions,
  getMaterialLabel,
  furnitureCustomTemplates,
  normalizeFurnitureKey,
  strapStock,
}) {
  const kromkaOptions = Array.isArray(executorOptions?.kromka) && executorOptions.kromka.length > 0
    ? executorOptions.kromka
    : KROMKA_EXECUTORS;
  const prasOptions = Array.isArray(executorOptions?.pras) && executorOptions.pras.length > 0
    ? executorOptions.pras
    : PRAS_EXECUTORS;
  const isPending = (key) => (typeof isActionPending === "function" ? isActionPending(key) : actionLoading === key);

  // Detect strap orders by item name pattern (size codes like "1000_80", "316_167")
  // or by "Планки обвязки" prefix used in some order types.
  const isStrapItem = (item) => {
    const s = String(item || "").trim();
    return s.includes("Планки обвязки") || /^\d{3,5}[_x]\d{2,5}$/.test(s);
  };

  // Build strap stock lookup: { "1158_50": 98, "316_167": 0, ... }
  const strapStockByType = useMemo(() => {
    const map = {};
    (Array.isArray(strapStock) ? strapStock : []).forEach((s) => {
      const key = String(s.strap_type || "").trim();
      if (key) map[key] = (map[key] || 0) + Number(s.qty || 0);
    });
    return map;
  }, [strapStock]);

  // Build template lookup: normalized item name → details[]
  const templateByKey = useMemo(() => {
    const map = {};
    (Array.isArray(furnitureCustomTemplates) ? furnitureCustomTemplates : []).forEach((t) => {
      const k = typeof normalizeFurnitureKey === "function"
        ? normalizeFurnitureKey(String(t.product_name || t.productName || ""))
        : String(t.product_name || t.productName || "").toLowerCase().trim();
      if (k) map[k] = t;
    });
    return map;
  }, [furnitureCustomTemplates, normalizeFurnitureKey]);

  // For a given order, calculate straps needed per strap type
  const calcStrapNeeds = (rawItem, qty) => {
    const itemKey = typeof normalizeFurnitureKey === "function"
      ? normalizeFurnitureKey(rawItem)
      : String(rawItem || "").toLowerCase().trim();
    const tpl = templateByKey[itemKey]
      || Object.entries(templateByKey).find(([k]) => k && (itemKey.includes(k) || k.includes(itemKey)))?.[1]
      || null;
    if (!tpl || !Array.isArray(tpl.details)) return [];
    const orderQty = Number(qty || 0);
    const needs = [];
    tpl.details.forEach((d) => {
      const code = extractStrapCode(d.detailName || d.detail_name || "");
      if (!code || !STRAP_TYPE_CODES.has(code)) return;
      const totalNeeded = (Number(d.perUnit || d.per_unit || 0)) * orderQty;
      if (totalNeeded > 0) {
        needs.push({ code, needed: totalNeeded, name: d.detailName || d.detail_name });
      }
    });
    return needs;
  };

  return (
    <>
      {!workshopRows.length && !loading && <div className="empty">Нет заказов</div>}
      {workshopRows.map((o) => {
        const orderId = String(o.orderId || o.order_id || "");
        const isPaused = (status) => /пауза/i.test(String(status || ""));
        const rawItem = stripPlanItemMeta(String(o.item || ""));
        const baseDisplaySheetsNeeded =
          resolveDefaultConsumeSheets(o, shipmentOrders) || resolveDefaultConsumeSheetsFromBoard(o, shipmentBoard);

        const normalize = (v) =>
          typeof normalizeFurnitureKey === "function" ? normalizeFurnitureKey(v) : String(v || "").toLowerCase().trim();

        // Fallback: for any order which has a custom template with kits_per_sheet, use it to
        // derive sheets when backend stored 0.
        const fallbackMainFurnitureSheets = (() => {
          const kitsList = Array.isArray(furnitureCustomTemplates) ? furnitureCustomTemplates : [];
          if (!kitsList.length) return 0;
          const itemKey = normalize(rawItem);
          if (!itemKey) return 0;
          const tpl =
            kitsList.find((t) => normalize(String(t.product_name || t.productName || "")) === itemKey) ||
            kitsList.find((t) => {
              const k = normalize(String(t.product_name || t.productName || ""));
              return k && (itemKey.includes(k) || k.includes(itemKey));
            }) ||
            null;
          const kitsPerSheet = Number(tpl?.kits_per_sheet ?? tpl?.kitsPerSheet ?? 0) || 0;
          const qty = Number(o.qty || 0) || 0;
          if (!(kitsPerSheet > 0) || !(qty > 0)) return 0;
          return Math.ceil(qty / kitsPerSheet);
        })();

        const displaySheetsNeeded = Number(baseDisplaySheetsNeeded || 0) > 0 ? baseDisplaySheetsNeeded : fallbackMainFurnitureSheets;
        const displayMaterial = String(o.material || o.colorName || "").trim() || "Материал не указан";
        const adminNote = String(o.adminComment ?? o.admin_comment ?? "").trim();

        // Strap availability calculation (only for non-strap orders)
        const strapNeeds = isStrapItem(rawItem) ? [] : calcStrapNeeds(rawItem, o.qty);

        const pilkaDone = isDone(o.pilkaStatus);
        const pilkaInWork = isInWork(o.pilkaStatus);
        const kromkaDone = isDone(o.kromkaStatus);
        const kromkaInWork = isInWork(o.kromkaStatus);
        const prasDone = isDone(o.prasStatus);
        const prasInWork = isInWork(o.prasStatus);
        const currentKromkaExec =
          String(o.kromkaStatus || "").includes("Сережа")
            ? "Сережа"
            : String(o.kromkaStatus || "").includes("Слава")
              ? "Слава"
              : "";
        const currentPrasExec =
          String(o.prasStatus || "").includes("Виталик")
            ? "Виталик"
            : String(o.prasStatus || "").includes("Леха") || String(o.prasStatus || "").includes("Лёха")
              ? "Леха"
              : "";
        const kromkaExecValue =
          executorByOrder[orderId] || currentKromkaExec || kromkaOptions[0] || "";
        const prasExecValue =
          executorByOrder[`${orderId}:pras`] || currentPrasExec || prasOptions[0] || "";
        const showPilka = tab === "all" || tab === "pilka";
        const showKromka = tab === "all" || tab === "kromka";
        const showPras = tab === "all" || tab === "pras";
        const showAssembly = tab === "all" || tab === "assembly";
        const showDone = tab === "all" || tab === "done";
        const assemblyDone = isDone(o.assemblyStatus);
        const packagingDone = isOrderCustomerShipped(o);
        const pauseLabels = [];
        if (isPaused(o.pilkaStatus)) pauseLabels.push("Пила");
        if (isPaused(o.kromkaStatus)) pauseLabels.push("Кромка");
        if (isPaused(o.prasStatus)) pauseLabels.push("Присадка");
        if (isPaused(o.assemblyStatus)) pauseLabels.push("Сборка");
        const hasPause = pauseLabels.length > 0;

        return (
          <article key={orderId || `${o.item}-${o.row}`} className={`card ${statusClass(o)}`}>
            <div className="card__content">
              <div className="card__main">
                <div className="line1">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong>{o.item}</strong>
                    <span className="badge meta-inline">План: {o.week || "-"}</span>
                    <span className="badge meta-inline">Кол-во: {o.qty || 0}</span>
                    {hasPause && (
                      <span
                        className="badge meta-inline"
                        style={{ background: "#fff1f2", borderColor: "#fda4af", color: "#9f1239" }}
                        title={`На паузе: ${pauseLabels.join(", ")}`}
                      >
                        ПАУЗА: {pauseLabels.join(", ")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="line2">
                  <span>ID: {orderId || "-"}</span>
                  <span>Листов нужно: {Number(displaySheetsNeeded || 0)}</span>
                  <span>
                    Листы: {displayMaterial} ({Number(displaySheetsNeeded || 0)} шт)
                  </span>
                  {strapNeeds.map(({ code, needed, name }) => {
                    const available = strapStockByType[code] ?? 0;
                    const enough = available >= needed;
                    return (
                      <span
                        key={code}
                        style={{
                          color: enough ? "#166534" : "#9f1239",
                          background: enough ? "#dcfce7" : "#fff1f2",
                          border: `1px solid ${enough ? "#86efac" : "#fda4af"}`,
                          borderRadius: 4,
                          padding: "1px 6px",
                          fontWeight: 600,
                          fontSize: 12,
                        }}
                        title={`${name}: нужно ${needed}, в наличии ${available}`}
                      >
                        {name || code}: {available}/{needed}
                      </span>
                    );
                  })}
                </div>
              </div>
              {adminNote ? (
                <aside className="card__admin-note card__admin-note--side" role="note">
                  <span className="card__admin-note-label">Комментарий администратора</span>
                  <span className="card__admin-note-text">{adminNote}</span>
                </aside>
              ) : null}
            </div>
            {tab !== "all" && (
              <div className="actions">
                {showPilka && (
                  <>
                    <button
                      type="button"
                      className={pilkaInWork ? "mini" : "mini ghost"}
                      disabled={isPending(`webSetPilkaInWork:${orderId}`) || pilkaDone || pilkaInWork || !canOperateProduction}
                      onClick={() => runAction("webSetPilkaInWork", orderId, {})}
                    >
                      {tab === "pilka" ? "Начать" : "Пила: Начать"}
                    </button>
                    <button
                      className="mini ok"
                      disabled={isPending(`webSetPilkaDone:${orderId}`) || pilkaDone || !pilkaInWork || !canOperateProduction}
                      onClick={() =>
                        runAction("webSetPilkaDone", orderId, {}, {
                          defaultSheets: displaySheetsNeeded,
                          item: o.item,
                          material: displayMaterial,
                          isPlankOrder: String(o.item || "").includes("Планки обвязки"),
                        })
                      }
                    >
                      {tab === "pilka" ? "Готово" : "Пила: Готово"}
                    </button>
                    <button
                      className="mini warn"
                      disabled={isPending(`webSetPilkaPause:${orderId}`) || pilkaDone || !pilkaInWork || !canOperateProduction}
                      onClick={() => runAction("webSetPilkaPause", orderId)}
                    >
                      {tab === "pilka" ? "Пауза" : "Пила: Пауза"}
                    </button>
                  </>
                )}

                {showKromka && (
                  <>
                    {!kromkaInWork && (
                      <select
                        value={kromkaExecValue}
                        disabled={!canOperateProduction}
                        onChange={(e) => setExecutorByOrder((prev) => ({ ...prev, [orderId]: e.target.value }))}
                      >
                        {kromkaOptions.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className={kromkaInWork ? "mini" : "mini ghost"}
                      disabled={isPending(`webSetKromkaInWork:${orderId}`) || kromkaDone || kromkaInWork || !canOperateProduction}
                      onClick={() =>
                        runAction("webSetKromkaInWork", orderId, {
                          executor: kromkaExecValue,
                        })
                      }
                    >
                      {tab === "kromka" ? "Начать" : "Кромка: Начать"}
                    </button>
                    <button
                      className="mini ok"
                      disabled={isPending(`webSetKromkaDone:${orderId}`) || kromkaDone || !kromkaInWork || !canOperateProduction}
                      onClick={() => runAction("webSetKromkaDone", orderId)}
                    >
                      {tab === "kromka" ? "Готово" : "Кромка: Готово"}
                    </button>
                    <button
                      className="mini warn"
                      disabled={isPending(`webSetKromkaPause:${orderId}`) || kromkaDone || !kromkaInWork || !canOperateProduction}
                      onClick={() => runAction("webSetKromkaPause", orderId)}
                    >
                      {tab === "kromka" ? "Пауза" : "Кромка: Пауза"}
                    </button>
                  </>
                )}

                {showPras && (
                  <>
                    {!prasInWork && (
                      <select
                        value={prasExecValue}
                        disabled={!canOperateProduction}
                        onChange={(e) => setExecutorByOrder((prev) => ({ ...prev, [`${orderId}:pras`]: e.target.value }))}
                      >
                        {prasOptions.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className={prasInWork ? "mini" : "mini ghost"}
                      disabled={isPending(`webSetPrasInWork:${orderId}`) || prasDone || prasInWork || !canOperateProduction}
                      onClick={() =>
                        runAction("webSetPrasInWork", orderId, {
                          executor: prasExecValue,
                        })
                      }
                    >
                      {tab === "pras" ? "Начать" : "Присадка: Начать"}
                    </button>
                    <button
                      className="mini ok"
                      disabled={isPending(`webSetPrasDone:${orderId}`) || prasDone || !prasInWork || !canOperateProduction}
                      onClick={() =>
                        runAction("webSetPrasDone", orderId, {}, {
                          notifyOnAssembly: pilkaDone && kromkaDone && !assemblyDone,
                          item: o.item,
                          material: getMaterialLabel(o.item, o.material || o.colorName || ""),
                          week: o.week,
                          qty: o.qty,
                          executor: executorByOrder[orderId] || o.prasExecutor || "",
                          isStrapOrder: isStrapItem(o.item),
                        })
                      }
                    >
                      {tab === "pras" ? "Готово" : "Присадка: Готово"}
                    </button>
                    <button
                      className="mini warn"
                      disabled={isPending(`webSetPrasPause:${orderId}`) || prasDone || !prasInWork || !canOperateProduction}
                      onClick={() =>
                        runAction("webSetPrasPause", orderId, {}, {
                          item: o.item,
                          material: getMaterialLabel(o.item, o.material || o.colorName || ""),
                          qty: o.qty,
                          isStrapOrder: isStrapItem(o.item),
                        })
                      }
                    >
                      {tab === "pras" ? "Пауза" : "Присадка: Пауза"}
                    </button>
                  </>
                )}
                {showAssembly && (
                  <button
                    className="mini ok"
                    disabled={isPending(`webSetAssemblyDone:${orderId}`) || assemblyDone || !canOperateProduction}
                    onClick={() => runAction("webSetAssemblyDone", orderId)}
                  >
                    {tab === "assembly" ? "Готово" : "Сборка: Готово"}
                  </button>
                )}
                {showDone && (
                  <button
                    className="mini ok"
                    disabled={isPending(`webSetShippingDone:${orderId}`) || packagingDone || !canOperateProduction}
                    onClick={() =>
                      runAction("webSetShippingDone", orderId, {}, {
                        notifyOnFinalStage: true,
                        item: o.item,
                        material: getMaterialLabel(o.item, o.material || o.colorName || ""),
                        week: o.week,
                        qty: o.qty,
                        executor: executorByOrder[orderId] || o.prasExecutor || "",
                      })
                    }
                  >
                    {tab === "done" ? "Готово" : "Готово к отправке: Готово"}
                  </button>
                )}
              </div>
            )}
          </article>
        );
      })}
    </>
  );
});
