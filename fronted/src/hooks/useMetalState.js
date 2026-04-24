import { useCallback, useEffect, useState } from "react";

function resolveFurnitureArticle(itemName, directArticle, articleLookupByItemKey, normalizeFurnitureKey) {
  const direct = String(directArticle || "").trim();
  if (direct) return direct;
  if (!(articleLookupByItemKey instanceof Map) || articleLookupByItemKey.size === 0) return "";
  const normalizedItem = normalizeFurnitureKey(itemName);
  if (!normalizedItem) return "";
  const exact = String(articleLookupByItemKey.get(normalizedItem) || "").trim();
  if (exact) return exact;
  const beforeDot = String(itemName || "").split(".")[0] || "";
  const normalizedBeforeDot = normalizeFurnitureKey(beforeDot);
  if (normalizedBeforeDot) {
    const byBaseName = String(articleLookupByItemKey.get(normalizedBeforeDot) || "").trim();
    if (byBaseName) return byBaseName;
  }
  const bestFuzzyMatch = [...articleLookupByItemKey.entries()]
    .filter(([itemKey]) => normalizedItem.includes(itemKey) || itemKey.includes(normalizedItem))
    .sort((a, b) => String(b[0] || "").length - String(a[0] || "").length)[0];
  return String(bestFuzzyMatch?.[1] || "").trim();
}

export function useMetalState({
  view,
  callBackend,
  setLoading,
  setError,
  toUserError,
  selectedShipments,
  articleLookupByItemKey,
  normalizeFurnitureKey,
}) {
  const [metalStockRows, setMetalStockRows] = useState([]);
  const [metalSavingArticle, setMetalSavingArticle] = useState("");
  const [metalSubView, setMetalSubView] = useState("stock");
  const [metalQueueRows, setMetalQueueRows] = useState([]);
  const [metalQueueLoading, setMetalQueueLoading] = useState(false);
  const [metalQueueUpdatingId, setMetalQueueUpdatingId] = useState(0);
  const [selectedShipmentMetal, setSelectedShipmentMetal] = useState({
    loading: false,
    rows: [],
    missingItems: [],
  });

  const loadMetalStock = useCallback(async () => {
    const payload = await callBackend("webGetMetalStock", {});
    const list = Array.isArray(payload) ? payload : [];
    setMetalStockRows(
      list.map((row) => ({
        metal_article: String(row?.metal_article || "").trim(),
        metal_name: String(row?.metal_name || "").trim(),
        qty_available: Number(row?.qty_available || 0),
        qty_reserved: Number(row?.qty_reserved || 0),
      })),
    );
  }, [callBackend]);

  const loadMetalQueue = useCallback(async () => {
    setMetalQueueLoading(true);
    try {
      const payload = await callBackend("webGetMetalWorkQueue", {});
      const list = Array.isArray(payload) ? payload : [];
      setMetalQueueRows(
        list.map((row) => ({
          id: Number(row?.id || 0),
          status: String(row?.status || "").trim(),
          sourceRow: String(row?.source_row || "").trim(),
          sourceCol: String(row?.source_col || "").trim(),
          item: String(row?.item || "").trim(),
          week: String(row?.week || "").trim(),
          qty: Number(row?.qty || 0),
          shortage: Array.isArray(row?.shortage) ? row.shortage : [],
        })),
      );
    } catch (e) {
      const msg = String(e?.message || e || "");
      if (
        msg.includes("не настроен для action") ||
        msg.includes("Supabase RPC не настроен") ||
        msg.includes("Could not find the function")
      ) {
        setMetalQueueRows([]);
        return;
      }
      throw e;
    } finally {
      setMetalQueueLoading(false);
    }
  }, [callBackend]);

  const updateMetalQueueStatus = useCallback(
    async (id, status) => {
      const queueId = Number(id || 0);
      if (!(queueId > 0)) return;
      setMetalQueueUpdatingId(queueId);
      setError("");
      try {
        await callBackend("webSetMetalWorkQueueStatus", { id: queueId, status });
        await loadMetalQueue();
      } catch (e) {
        setError(toUserError(e));
      } finally {
        setMetalQueueUpdatingId(0);
      }
    },
    [callBackend, loadMetalQueue, setError, toUserError],
  );

  const adjustMetalStock = useCallback(
    async (metalArticle, delta, metalName = "") => {
      const article = String(metalArticle || "").trim();
      const qtyDelta = Number(delta || 0);
      if (!article || !Number.isFinite(qtyDelta) || qtyDelta === 0) return;
      const currentRow = metalStockRows.find((row) => String(row?.metal_article || "").trim() === article);
      const currentQty = Number(currentRow?.qty_available || 0);
      const nextQty = Math.max(0, currentQty + qtyDelta);
      setMetalSavingArticle(article);
      setError("");
      try {
        await callBackend("webSetMetalStock", {
          metalArticle: article,
          metalName: String(metalName || currentRow?.metal_name || "").trim(),
          qtyAvailable: nextQty,
        });
        await loadMetalStock();
      } catch (e) {
        setError(toUserError(e));
      } finally {
        setMetalSavingArticle("");
      }
    },
    [callBackend, loadMetalStock, metalStockRows, setError, setMetalSavingArticle, toUserError],
  );

  useEffect(() => {
    if (view !== "metal") setMetalSubView("stock");
  }, [view]);

  useEffect(() => {
    if (view !== "metal") return;
    setLoading(true);
    setError("");
    Promise.resolve(loadMetalStock())
      .catch((e) => setError(toUserError(e)))
      .finally(() => setLoading(false));
  }, [view, loadMetalStock, setLoading, setError, toUserError]);

  useEffect(() => {
    let cancelled = false;
    async function loadSelectedShipmentMetal() {
      if (view !== "shipment" || selectedShipments.length === 0) {
        setSelectedShipmentMetal({ loading: false, rows: [], missingItems: [] });
        return;
      }
      const qtyByFurnitureArticle = new Map();
      const missingItems = [];
      selectedShipments.forEach((s) => {
        const qty = Number(s.qty || 0);
        if (!(qty > 0)) return;
        const itemName = String(s.item || "").trim();
        const directArticle = String(s.productArticle || s.product_article || "").trim();
        const article = resolveFurnitureArticle(
          itemName,
          directArticle,
          articleLookupByItemKey,
          normalizeFurnitureKey,
        );
        if (!article) {
          if (itemName) missingItems.push(itemName);
          return;
        }
        qtyByFurnitureArticle.set(article, (qtyByFurnitureArticle.get(article) || 0) + qty);
      });
      const uniqueMissingItems = [...new Set(missingItems)].sort((a, b) => a.localeCompare(b, "ru"));
      if (qtyByFurnitureArticle.size === 0) {
        setSelectedShipmentMetal({ loading: false, rows: [], missingItems: uniqueMissingItems });
        return;
      }
      setSelectedShipmentMetal((prev) => ({ ...prev, loading: true, missingItems: uniqueMissingItems }));
      try {
        const [stockPayload, furnitureMetalRowsList] = await Promise.all([
          callBackend("webGetMetalStock", {}),
          Promise.all(
            [...qtyByFurnitureArticle.keys()].map((article) =>
              callBackend("webGetMetalForFurniture", { furnitureArticle: article }),
            ),
          ),
        ]);
        if (cancelled) return;
        const stockByMetal = new Map();
        (Array.isArray(stockPayload) ? stockPayload : []).forEach((row) => {
          const metalArticle = String(row?.metal_article || "").trim();
          if (!metalArticle) return;
          stockByMetal.set(metalArticle, {
            metalName: String(row?.metal_name || "").trim(),
            qtyAvailable: Number(row?.qty_available || 0),
          });
        });
        const neededByMetal = new Map();
        [...qtyByFurnitureArticle.entries()].forEach(([_furnitureArticle, furnitureQty], idx) => {
          const componentRows = Array.isArray(furnitureMetalRowsList[idx]) ? furnitureMetalRowsList[idx] : [];
          componentRows.forEach((row) => {
            const metalArticle = String(row?.metal_article || "").trim();
            if (!metalArticle) return;
            const perUnit = Number(row?.qty_per_unit || 0);
            if (!(perUnit > 0)) return;
            const neededQty = furnitureQty * perUnit;
            const current = neededByMetal.get(metalArticle) || {
              metalArticle,
              metalName: String(row?.metal_name || "").trim(),
              neededQty: 0,
            };
            current.neededQty += neededQty;
            if (!current.metalName) current.metalName = String(row?.metal_name || "").trim();
            neededByMetal.set(metalArticle, current);
          });
        });
        const rows = [...neededByMetal.values()]
          .map((row) => {
            const stock = stockByMetal.get(row.metalArticle) || { metalName: "", qtyAvailable: 0 };
            const qtyAvailable = Number(stock.qtyAvailable || 0);
            return {
              metalArticle: row.metalArticle,
              metalName: row.metalName || stock.metalName || row.metalArticle,
              neededQty: Number(row.neededQty || 0),
              qtyAvailable,
              deficitQty: Math.max(0, Number(row.neededQty || 0) - qtyAvailable),
            };
          })
          .sort((a, b) => b.deficitQty - a.deficitQty || a.metalArticle.localeCompare(b.metalArticle, "ru"));
        setSelectedShipmentMetal({ loading: false, rows, missingItems: uniqueMissingItems });
      } catch (_) {
        if (cancelled) return;
        setSelectedShipmentMetal({ loading: false, rows: [], missingItems: uniqueMissingItems });
      }
    }
    loadSelectedShipmentMetal();
    return () => {
      cancelled = true;
    };
  }, [view, selectedShipments, articleLookupByItemKey, normalizeFurnitureKey, callBackend]);

  return {
    metalStockRows,
    metalSavingArticle,
    setMetalSavingArticle,
    metalSubView,
    setMetalSubView,
    metalQueueRows,
    metalQueueLoading,
    metalQueueUpdatingId,
    selectedShipmentMetal,
    loadMetalStock,
    loadMetalQueue,
    adjustMetalStock,
    updateMetalQueueStatus,
  };
}
