import { KROMKA_EXECUTORS, PRAS_EXECUTORS } from "../config";

export function WorkshopView({
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
}) {
  const kromkaOptions = Array.isArray(executorOptions?.kromka) && executorOptions.kromka.length > 0
    ? executorOptions.kromka
    : KROMKA_EXECUTORS;
  const prasOptions = Array.isArray(executorOptions?.pras) && executorOptions.pras.length > 0
    ? executorOptions.pras
    : PRAS_EXECUTORS;
  const isPending = (key) => (typeof isActionPending === "function" ? isActionPending(key) : actionLoading === key);

  return (
    <>
      {!workshopRows.length && !loading && <div className="empty">Нет заказов</div>}
      {workshopRows.map((o) => {
        const orderId = String(o.orderId || o.order_id || "");
        const displaySheetsNeeded =
          resolveDefaultConsumeSheets(o, shipmentOrders) || resolveDefaultConsumeSheetsFromBoard(o, shipmentBoard);
        const displayMaterial = String(o.material || o.colorName || "").trim() || "Материал не указан";

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

        return (
          <article key={orderId || `${o.item}-${o.row}`} className={`card ${statusClass(o)}`}>
            <div className="line1">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong>{o.item}</strong>
                <span className="badge meta-inline">План: {o.week || "-"}</span>
                <span className="badge meta-inline">Кол-во: {o.qty || 0}</span>
              </div>
            </div>
            <div className="line2">
              <span>ID: {orderId || "-"}</span>
              <span>Листов нужно: {Number(displaySheetsNeeded || 0)}</span>
              <span>
                Листы: {displayMaterial} ({Number(displaySheetsNeeded || 0)} шт)
              </span>
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
                        })
                      }
                    >
                      {tab === "pras" ? "Готово" : "Присадка: Готово"}
                    </button>
                    <button
                      className="mini warn"
                      disabled={isPending(`webSetPrasPause:${orderId}`) || prasDone || !prasInWork || !canOperateProduction}
                      onClick={() => runAction("webSetPrasPause", orderId)}
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
}
