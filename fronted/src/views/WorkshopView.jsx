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
  canOperateProduction,
  runAction,
  executorByOrder,
  setExecutorByOrder,
  getMaterialLabel,
}) {
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
        const kromkaExecValue = executorByOrder[orderId] || currentKromkaExec || "Слава";
        const prasExecValue = executorByOrder[`${orderId}:pras`] || currentPrasExec || "Леха";
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
                      disabled={actionLoading === `webSetPilkaInWork:${orderId}` || pilkaDone || pilkaInWork || !canOperateProduction}
                      onClick={() => runAction("webSetPilkaInWork", orderId, {})}
                    >
                      {tab === "pilka" ? "Начать" : "Пила: Начать"}
                    </button>
                    <button
                      className="mini ok"
                      disabled={actionLoading === `webSetPilkaDone:${orderId}` || pilkaDone || !pilkaInWork || !canOperateProduction}
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
                      disabled={actionLoading === `webSetPilkaPause:${orderId}` || pilkaDone || !pilkaInWork || !canOperateProduction}
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
                        <option>Слава</option>
                        <option>Сережа</option>
                      </select>
                    )}
                    <button
                      type="button"
                      className={kromkaInWork ? "mini" : "mini ghost"}
                      disabled={actionLoading === `webSetKromkaInWork:${orderId}` || kromkaDone || kromkaInWork || !canOperateProduction}
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
                      disabled={actionLoading === `webSetKromkaDone:${orderId}` || kromkaDone || !kromkaInWork || !canOperateProduction}
                      onClick={() => runAction("webSetKromkaDone", orderId)}
                    >
                      {tab === "kromka" ? "Готово" : "Кромка: Готово"}
                    </button>
                    <button
                      className="mini warn"
                      disabled={actionLoading === `webSetKromkaPause:${orderId}` || kromkaDone || !kromkaInWork || !canOperateProduction}
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
                        <option>Леха</option>
                        <option>Виталик</option>
                      </select>
                    )}
                    <button
                      type="button"
                      className={prasInWork ? "mini" : "mini ghost"}
                      disabled={actionLoading === `webSetPrasInWork:${orderId}` || prasDone || prasInWork || !canOperateProduction}
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
                      disabled={actionLoading === `webSetPrasDone:${orderId}` || prasDone || !prasInWork || !canOperateProduction}
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
                      disabled={actionLoading === `webSetPrasPause:${orderId}` || prasDone || !prasInWork || !canOperateProduction}
                      onClick={() => runAction("webSetPrasPause", orderId)}
                    >
                      {tab === "pras" ? "Пауза" : "Присадка: Пауза"}
                    </button>
                  </>
                )}
                {showAssembly && (
                  <button
                    className="mini ok"
                    disabled={actionLoading === `webSetAssemblyDone:${orderId}` || assemblyDone || !canOperateProduction}
                    onClick={() => runAction("webSetAssemblyDone", orderId)}
                  >
                    {tab === "assembly" ? "Готово" : "Сборка: Готово"}
                  </button>
                )}
                {showDone && (
                  <button
                    className="mini ok"
                    disabled={actionLoading === `webSetShippingDone:${orderId}` || packagingDone || !canOperateProduction}
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
