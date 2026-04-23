import { useMemo } from "react";
import { mapStageFieldToKey, normalizeStageStatus, parseStageAuditRows } from "../app/auditHelpers";
import { buildLiveStageClock } from "../app/stageTime";

const isImportedLaborRow = (row) =>
  Boolean(row?.importedLocal) || /^import-/i.test(String(row?.orderId || "").trim());
const isImportedOrderId = (orderId) => /^import-/i.test(String(orderId || "").trim());

export function useLaborStageAnalytics({
  view,
  laborSubView,
  stageAuditRows,
  query,
  activeOrderIds,
  filteredOrders,
  workSchedule,
  laborOrdersRows,
  laborPlannerQtyByGroup,
  laborTableRows,
}) {
  const laborStageTimelineRows = useMemo(() => {
    if (view !== "labor" || laborSubView !== "stages") return [];
    const q = query.trim().toLowerCase();
    const activeSet = new Set((activeOrderIds || []).map((x) => String(x || "").trim()).filter(Boolean));
    const latestByOrder = new Map();
    (Array.isArray(filteredOrders) ? filteredOrders : []).forEach((row) => {
      const orderId = String(row?.orderId || row?.order_id || "").trim();
      if (!orderId) return;
      const prev = latestByOrder.get(orderId);
      const prevTs = new Date(prev?.updatedAt || prev?.updated_at || prev?.createdAt || prev?.created_at || 0).getTime();
      const rowTs = new Date(row?.updatedAt || row?.updated_at || row?.createdAt || row?.created_at || 0).getTime();
      if (!prev || rowTs >= prevTs) latestByOrder.set(orderId, row);
    });
    const fallbackRowsBase = [...latestByOrder.values()]
      .map((row) => ({
        orderId: String(row?.orderId || row?.order_id || "").trim(),
        pipelineStage: String(row?.pipelineStage || row?.pipeline_stage || "").trim(),
        pilkaStatus: String(row?.pilkaStatus || row?.pilka_status || row?.pilka || "-").trim() || "-",
        pilkaStart: String(row?.pilka_started_at || row?.pilkaStartedAt || "").trim(),
        pilkaEnd: String(row?.pilka_done_at || row?.pilkaDoneAt || "").trim(),
        kromkaStatus: String(row?.kromkaStatus || row?.kromka_status || row?.kromka || "-").trim() || "-",
        kromkaStart: String(row?.kromka_started_at || row?.kromkaStartedAt || "").trim(),
        kromkaEnd: String(row?.kromka_done_at || row?.kromkaDoneAt || "").trim(),
        prasStatus: String(row?.prasStatus || row?.pras_status || row?.pras || "-").trim() || "-",
        prasStart: String(row?.pras_started_at || row?.prasStartedAt || "").trim(),
        prasEnd: String(row?.pras_done_at || row?.prasDoneAt || "").trim(),
        lastEventAt: String(row?.updatedAt || row?.updated_at || row?.createdAt || row?.created_at || "").trim(),
      }))
      .filter((r) => !!r.orderId && !isImportedOrderId(r.orderId))
      .filter((r) => !q || r.orderId.toLowerCase().includes(q));
    const events = parseStageAuditRows(stageAuditRows).sort(
      (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
    );
    const byOrder = new Map();
    const ensureOrder = (orderId) => {
      if (!byOrder.has(orderId)) {
        byOrder.set(orderId, {
          orderId,
          pilkaStatus: "-",
          pilkaStart: "",
          pilkaEnd: "",
          kromkaStatus: "-",
          kromkaStart: "",
          kromkaEnd: "",
          prasStatus: "-",
          prasStart: "",
          prasEnd: "",
          lastEventAt: "",
        });
      }
      return byOrder.get(orderId);
    };
    events.forEach((event) => {
      const orderId = String(event.orderId || "").trim();
      if (!orderId || orderId === "-") return;
      const row = ensureOrder(orderId);
      row.lastEventAt = event.createdAt || row.lastEventAt;
      (event.changed || []).forEach((c) => {
        const stage = mapStageFieldToKey(c.key);
        if (!stage) return;
        const nextStatus = normalizeStageStatus(c.after);
        const prevStatus = normalizeStageStatus(c.before);
        const ts = String(event.createdAt || "").trim();
        row[`${stage}Status`] = nextStatus;
        if (nextStatus === "В работе" && ts) row[`${stage}Start`] = ts;
        if (nextStatus === "Готово" && ts) {
          row[`${stage}End`] = ts;
          if (!row[`${stage}Start`] && prevStatus === "В работе") row[`${stage}Start`] = ts;
        }
      });
    });
    const allRows = [...byOrder.values()]
      .filter((r) => !isImportedOrderId(r.orderId))
      .filter((r) => !q || String(r.orderId || "").toLowerCase().includes(q))
      .sort((a, b) => new Date(b.lastEventAt || 0).getTime() - new Date(a.lastEventAt || 0).getTime());
    const auditRowsSource = (() => {
      if (allRows.length === 0) return [];
      if (activeSet.size === 0) return allRows;
      const scopedRows = allRows.filter((r) => activeSet.has(String(r.orderId || "").trim()));
      return scopedRows.length > 0 ? scopedRows : allRows;
    })();
    const mergedByOrder = new Map();
    fallbackRowsBase.forEach((r) => mergedByOrder.set(r.orderId, r));
    auditRowsSource.forEach((r) => {
      const id = String(r.orderId || "").trim();
      if (!id || isImportedOrderId(id)) return;
      const prev = mergedByOrder.get(id) || {};
      mergedByOrder.set(id, { ...prev, ...r, orderId: id });
    });
    const sourceRows = [...mergedByOrder.values()]
      .filter((r) => (activeSet.size === 0 ? true : activeSet.has(String(r.orderId || "").trim())))
      .sort((a, b) => new Date(b.lastEventAt || 0).getTime() - new Date(a.lastEventAt || 0).getTime());

    return sourceRows.map((r) => {
      const timer = buildLiveStageClock(
        {
          pipeline_stage: r.pipelineStage,
          pilka_status: r.pilkaStatus,
          pilka_started_at: r.pilkaStart,
          pilka_done_at: r.pilkaEnd,
          kromka_status: r.kromkaStatus,
          kromka_started_at: r.kromkaStart,
          kromka_done_at: r.kromkaEnd,
          pras_status: r.prasStatus,
          pras_started_at: r.prasStart,
          pras_done_at: r.prasEnd,
        },
        { workSchedule },
      );
      return {
        ...r,
        liveStageLabel: timer?.label || "",
        liveDurationText: timer?.durationText || "-",
        liveReason: timer?.reason || "",
        liveRunning: Boolean(timer?.isRunning),
      };
    });
  }, [view, laborSubView, stageAuditRows, query, activeOrderIds, filteredOrders, workSchedule]);

  const laborPlannerRows = useMemo(() => {
    if (view !== "labor") return [];
    return laborOrdersRows
      .filter((r) => Number(r.laborPerQtyMin || 0) > 0)
      .map((r) => {
        const plannedQtyRaw = laborPlannerQtyByGroup[r.group];
        const plannedQty = Number(String(plannedQtyRaw ?? "").replace(",", "."));
        const kits = Number.isFinite(plannedQty) && plannedQty > 0 ? plannedQty : 0;
        const totalMin = kits * Number(r.laborPerQtyMin || 0);
        const hours = Math.floor(totalMin / 60);
        const minutes = Math.round(totalMin % 60);
        const hhmm = `${hours}:${String(minutes).padStart(2, "0")}`;
        return {
          group: r.group,
          laborPerQtyMin: Number(r.laborPerQtyMin || 0),
          pilkaPerQtyMin: Number(r.qty || 0) > 0 ? Number(r.pilkaMin || 0) / Number(r.qty || 0) : 0,
          kromkaPerQtyMin: Number(r.qty || 0) > 0 ? Number(r.kromkaMin || 0) / Number(r.qty || 0) : 0,
          prasPerQtyMin: Number(r.qty || 0) > 0 ? Number(r.prasMin || 0) / Number(r.qty || 0) : 0,
          kits,
          totalMin,
          hhmm,
        };
      });
  }, [laborOrdersRows, laborPlannerQtyByGroup, view]);

  const laborKpi = useMemo(() => {
    const baseRows = laborTableRows.filter((x) => !isImportedLaborRow(x));
    const totalOrders = baseRows.length;
    const totalMinutes = baseRows.reduce((sum, x) => sum + x.totalMin, 0);
    const totalQty = baseRows.reduce((sum, x) => sum + x.qty, 0);
    const avgPerOrder = totalOrders > 0 ? totalMinutes / totalOrders : 0;
    return { totalOrders, totalMinutes, totalQty, avgPerOrder };
  }, [laborTableRows]);

  return { laborStageTimelineRows, laborPlannerRows, laborKpi };
}
