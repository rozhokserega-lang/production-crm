import { useMemo } from "react";
import { mapStageFieldToKey, normalizeStageStatus, parseStageAuditRows } from "../app/auditHelpers";

export function useLaborStageAnalytics({
  view,
  laborSubView,
  stageAuditRows,
  query,
  activeOrderIds,
  laborOrdersRows,
  laborPlannerQtyByGroup,
  laborTableRows,
}) {
  const laborStageTimelineRows = useMemo(() => {
    if (view !== "labor" || laborSubView !== "stages") return [];
    const q = query.trim().toLowerCase();
    const activeSet = new Set((activeOrderIds || []).map((x) => String(x || "").trim()).filter(Boolean));
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
      .filter((r) => !q || String(r.orderId || "").toLowerCase().includes(q))
      .sort((a, b) => new Date(b.lastEventAt || 0).getTime() - new Date(a.lastEventAt || 0).getTime());
    if (activeSet.size === 0) return allRows;
    const scopedRows = allRows.filter((r) => activeSet.has(String(r.orderId || "").trim()));
    // If labor table ids don't intersect with audit ids, still show stage timeline instead of empty state.
    return scopedRows.length > 0 ? scopedRows : allRows;
  }, [view, laborSubView, stageAuditRows, query, activeOrderIds]);

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
          kits,
          totalMin,
          hhmm,
        };
      });
  }, [laborOrdersRows, laborPlannerQtyByGroup, view]);

  const laborKpi = useMemo(() => {
    const totalOrders = laborTableRows.length;
    const totalMinutes = laborTableRows.reduce((sum, x) => sum + x.totalMin, 0);
    const totalQty = laborTableRows.reduce((sum, x) => sum + x.qty, 0);
    const avgPerOrder = totalOrders > 0 ? totalMinutes / totalOrders : 0;
    return { totalOrders, totalMinutes, totalQty, avgPerOrder };
  }, [laborTableRows]);

  return { laborStageTimelineRows, laborPlannerRows, laborKpi };
}
