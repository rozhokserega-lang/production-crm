import { useState, useEffect, useCallback, useMemo } from "react";
import { STRAP_OPTIONS } from "../app/appConstants";
import { toUserError } from "../app/errorCatalogHelpers";
import {
  buildStrapProductGroupsByCode,
  collectStrapCatalogProductNames,
  computeWorkshopStrapDemandByInventoryKey,
  computeWorkshopStrapDemandOrdersByKey,
  formatStrapProductGroups,
  getStrapDemandOrdersForRow,
  inventoryCodeFromStrapStockType,
  normalizeStrapInventoryCode,
  sortStrapCodesByProductFilter,
  strapCodeServesProduct,
  STRAP_FACADE_LAUNCH_COLORS,
  STRAP_LAUNCH_PLAN_WEEK,
  strapRequiresLaunchColorChoice,
  strapWarehouseDemandQty,
  strapWarehouseShortage,
} from "../app/workshopStrapNeeds";
import { StrapLaunchDialog } from "../components/StrapLaunchDialog";
import { StrapDemandOrdersDialog } from "../components/StrapDemandOrdersDialog";
import { StrapPrintPreviewDialog, useStrapPrintPreviewDialog } from "../components/StrapPrintPreviewDialog";
import { embedStrapTargetProduct } from "../app/orderHelpers";
import { resolveStrapLaunchPrintInputs } from "../app/strapPrintHelpers";
import { OrderService } from "../services/orderService";

/**
 * Extracts the size code from a STRAP_OPTIONS display name.
 * "Обвязка (1000_80)" → "1000_80"
 */
function strapOptionToCode(name) {
  return inventoryCodeFromStrapStockType(name);
}

function ProductGroupsCell({ productsByCode, code }) {
  const key = inventoryCodeFromStrapStockType(code);
  const products = productsByCode.get(normalizeStrapInventoryCode(key)) || [];
  const label = formatStrapProductGroups(products);
  return (
    <td className="strap-stock-products" title={label === "—" ? "Нет привязки в каталоге деталей" : label}>
      {label}
    </td>
  );
}

/**
 * Groups strap stock rows by strap_type.
 */
function buildStockMap(rows) {
  const map = {};
  for (const row of rows || []) {
    const key = String(row.strap_type || "");
    if (!map[key]) map[key] = [];
    map[key].push(row);
  }
  return map;
}

/** Если в БД ещё нет строки по типу — создаём остаток с этим цветом (как в существующих строках склада). */
const DEFAULT_STRAP_STOCK_COLOR = "Черный";

function DemandCell({ demandByKey, strapType, color, onShowOrders }) {
  const need = strapWarehouseDemandQty(demandByKey, strapType, color);
  return (
    <td
      className={`strap-stock-demand${need > 0 ? " strap-stock-demand--active" : ""}`}
      title={
        need > 0
          ? "Сколько штук нужно по заказам в цеху. Нажмите, чтобы увидеть заказы"
          : "Сколько штук нужно по заказам в цеху (пила, кромка, присадка, до сборки включительно)"
      }
    >
      {need > 0 ? (
        <button
          type="button"
          className="strap-stock-demand-btn"
          onClick={() => onShowOrders?.({ strapType, color, need })}
        >
          <b>{need}</b>
        </button>
      ) : (
        <span className="strap-stock-demand-zero">0</span>
      )}
    </td>
  );
}

function ShortageCell({ demandByKey, strapType, color, qty }) {
  const miss = strapWarehouseShortage(demandByKey, strapType, color, qty);
  return (
    <td
      className={`strap-stock-shortage${miss > 0 ? " strap-stock-shortage--deficit" : " strap-stock-shortage--ok"}`}
      title="max(0, «Требуется» − остаток в этой строке)"
    >
      {miss > 0 ? <b>{miss}</b> : <span className="strap-stock-shortage-zero">0</span>}
    </td>
  );
}

function StrapRowActions({
  canOperateProduction,
  isEditing,
  saving,
  onEditStart,
  onEditSave,
  onEditCancel,
  onLaunchOpen,
  onPrintOpen,
}) {
  if (isEditing) {
    return (
      <>
        <button type="button" className="mini ok" disabled={saving} onClick={onEditSave}>
          ✓
        </button>
        <button type="button" className="mini ghost" disabled={saving} onClick={onEditCancel}>
          ✕
        </button>
      </>
    );
  }

  return (
    <>
      {canOperateProduction ? (
        <>
          <button type="button" className="mini" onClick={onPrintOpen} title="Лист для печати">
            Печать
          </button>
          <button type="button" className="mini ok" onClick={onLaunchOpen}>
            В план
          </button>
        </>
      ) : null}
      <button type="button" className="mini ghost" onClick={onEditStart}>
        Изменить
      </button>
    </>
  );
}

export function StrapStockView({
  callBackend,
  canOperateProduction = false,
  onDataChanged,
  workshopRows = [],
  furnitureTemplates = [],
  furnitureCustomTemplates = [],
  furnitureDetailArticleRows = [],
  normalizeFurnitureKey,
}) {
  const [stockRows, setStockRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editKey, setEditKey] = useState(null); // "strapType|color"
  const [editQty, setEditQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [launchDialog, setLaunchDialog] = useState(null);
  const [launchQty, setLaunchQty] = useState("");
  const [launchMaterial, setLaunchMaterial] = useState("");
  const [launchProduct, setLaunchProduct] = useState("");
  const [launchError, setLaunchError] = useState("");
  const [launchSaving, setLaunchSaving] = useState(false);
  const [productFilter, setProductFilter] = useState("");
  const [demandOrdersDialog, setDemandOrdersDialog] = useState(null);
  const { strapPrintDialog, openStrapPrint } = useStrapPrintPreviewDialog();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await callBackend("webGetStrapStock", {});
      setStockRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(String(e?.message || e || "Ошибка загрузки"));
    } finally {
      setLoading(false);
    }
  }, [callBackend]);

  useEffect(() => {
    load();
  }, [load]);

  const strapDeps = useMemo(
    () => ({
      furnitureTemplates,
      furnitureCustomTemplates,
      furnitureDetailArticleRows,
      normalizeFurnitureKey:
        typeof normalizeFurnitureKey === "function"
          ? normalizeFurnitureKey
          : (v) => String(v || "").toLowerCase().trim(),
    }),
    [furnitureTemplates, furnitureCustomTemplates, furnitureDetailArticleRows, normalizeFurnitureKey],
  );

  const demandByKey = useMemo(
    () => computeWorkshopStrapDemandByInventoryKey(workshopRows, strapDeps),
    [workshopRows, strapDeps],
  );

  const demandOrdersByKey = useMemo(
    () => computeWorkshopStrapDemandOrdersByKey(workshopRows, strapDeps),
    [workshopRows, strapDeps],
  );

  const productsByCode = useMemo(
    () => buildStrapProductGroupsByCode(furnitureDetailArticleRows),
    [furnitureDetailArticleRows],
  );

  const productOptions = useMemo(
    () => collectStrapCatalogProductNames(productsByCode),
    [productsByCode],
  );

  const stockMap = buildStockMap(stockRows);

  const allCodes = useMemo(() => {
    const known = STRAP_OPTIONS.map(strapOptionToCode);
    const db = stockRows.map((r) => String(r.strap_type || ""));
    return Array.from(new Set([...known, ...db])).filter(Boolean);
  }, [stockRows]);

  const sortedCodes = useMemo(
    () => sortStrapCodesByProductFilter(allCodes, productsByCode, productFilter),
    [allCodes, productsByCode, productFilter],
  );

  const isProductMatch = useCallback(
    (code) => strapCodeServesProduct(code, productsByCode, productFilter),
    [productsByCode, productFilter],
  );

  const openDemandOrdersDialog = ({ strapType, color, need, label }) => {
    setDemandOrdersDialog({
      strapType,
      color,
      label,
      totalNeeded: need,
      orders: getStrapDemandOrdersForRow(demandOrdersByKey, strapType, color),
    });
  };

  const closeDemandOrdersDialog = () => {
    setDemandOrdersDialog(null);
  };

  const handleEditStart = (strapType, color, currentQty) => {
    setEditKey(`${strapType}|${color}`);
    setEditQty(String(currentQty || 0));
  };

  const handleEditSave = async (strapType, color) => {
    const qty = parseInt(editQty, 10);
    if (!Number.isFinite(qty) || qty < 0) {
      setError("Введите корректное количество (≥ 0)");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await callBackend("webSetStrapStock", { strapType, color, qty });
      setEditKey(null);
      setEditQty("");
      await load();
    } catch (e) {
      setError(String(e?.message || e || "Ошибка сохранения"));
    } finally {
      setSaving(false);
    }
  };

  const handleEditCancel = () => {
    setEditKey(null);
    setEditQty("");
    setError("");
  };

  const closeLaunchDialog = () => {
    if (launchSaving) return;
    setLaunchDialog(null);
    setLaunchQty("");
    setLaunchMaterial("");
    setLaunchProduct("");
    setLaunchError("");
  };

  const openLaunchDialog = ({ strapType, color, label, qtyOnHand }) => {
    const shortage = strapWarehouseShortage(demandByKey, strapType, color, qtyOnHand);
    const products = productsByCode.get(normalizeStrapInventoryCode(strapType)) || [];
    setLaunchDialog({ strapType, color, label, products });
    setLaunchQty(shortage > 0 ? String(shortage) : "");
    setLaunchMaterial(
      strapRequiresLaunchColorChoice(strapType) ? STRAP_FACADE_LAUNCH_COLORS[0] : String(color || ""),
    );
    setLaunchProduct(products.length === 1 ? products[0] : "");
    setLaunchError("");
  };

  const openPrintFromLaunchForm = () => {
    if (!launchDialog) return;
    const needsColor = strapRequiresLaunchColorChoice(launchDialog.strapType);
    const resolved = resolveStrapLaunchPrintInputs({
      launchDialog,
      qtyInput: launchQty,
      materialInput: launchMaterial,
      productInput: launchProduct,
      needsColorChoice: needsColor,
    });
    if (!resolved.ok) {
      setLaunchError(resolved.error);
      return;
    }
    setLaunchError("");
    openStrapPrint({
      strapType: resolved.strapType,
      color: resolved.material,
      qty: resolved.qty,
      productName: resolved.productName,
    });
  };

  const openPrintFromRow = ({ strapType, color, label, qtyOnHand }) => {
    const shortage = strapWarehouseShortage(demandByKey, strapType, color, qtyOnHand);
    const products = productsByCode.get(normalizeStrapInventoryCode(strapType)) || [];
    if (products.length > 1) {
      openLaunchDialog({ strapType, color, label, qtyOnHand });
      return;
    }
    const qty = shortage > 0 ? shortage : 1;
    openStrapPrint({
      strapType,
      color,
      qty,
      productName: products[0] || "",
    });
  };

  const handleLaunchSubmit = async () => {
    if (!launchDialog) return;
    const qty = Number.parseInt(String(launchQty || "").trim(), 10);
    const needsColor = strapRequiresLaunchColorChoice(launchDialog.strapType);
    const material = needsColor
      ? String(launchMaterial || "").trim()
      : String(launchDialog.color || "").trim();
    if (!Number.isFinite(qty) || qty <= 0) {
      setLaunchError("Укажите количество планок (целое число > 0)");
      return;
    }
    if (needsColor && !material) {
      setLaunchError("Выберите цвет");
      return;
    }
    const products = Array.isArray(launchDialog?.products) ? launchDialog.products : [];
    const productName = String(launchProduct || "").trim();
    if (products.length > 1 && !productName) {
      setLaunchError("Выберите изделие для этой обвязки");
      return;
    }

    setLaunchSaving(true);
    setLaunchError("");
    try {
      await OrderService.createShipmentPlanCell({
        sectionName: "Обвязка",
        item: embedStrapTargetProduct(launchDialog.strapType, productName || products[0] || ""),
        material,
        week: STRAP_LAUNCH_PLAN_WEEK,
        qty,
      });
      closeLaunchDialog();
      await load();
      if (typeof onDataChanged === "function") {
        await onDataChanged();
      }
    } catch (e) {
      setLaunchError(toUserError(e));
    } finally {
      setLaunchSaving(false);
    }
  };

  return (
    <div className="strap-stock-view">
      <div className="strap-stock-header">
        <h2 className="strap-stock-title">Склад обвязки</h2>
        <button type="button" className="mini" onClick={load} disabled={loading}>
          {loading ? "Загрузка..." : "↻ Обновить"}
        </button>
      </div>

      <div className="strap-stock-filters">
        <label className="strap-stock-filter">
          <span className="strap-stock-filter__label">Изделие</span>
          <select
            className="strap-stock-filter__select"
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
          >
            <option value="">Все изделия</option>
            {productOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {productFilter ? (
          <span className="strap-stock-filter__hint">
            Обвязка для «{productFilter}» — вверху списка
          </span>
        ) : null}
      </div>

      {error && (
        <div className="strap-stock-error">{error}</div>
      )}

      {loading && stockRows.length === 0 ? (
        <div className="strap-stock-empty">Загрузка...</div>
      ) : (
        <div className="strap-stock-table-wrap">
          <table className="strap-stock-table">
            <thead>
              <tr>
                <th>Тип обвязки</th>
                <th>Изделия</th>
                <th>Цвет</th>
                <th className="strap-stock-th-numeric">Кол-во (шт)</th>
                <th
                  className="strap-stock-th-numeric"
                  title="Сумма потребности по заказам в активных этапах цеха. Нажмите на число — список заказов"
                >
                  Требуется
                </th>
                <th className="strap-stock-th-numeric" title="max(0, «Требуется» − количество в строке)">
                  Нехватает
                </th>
                <th>Изменено</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedCodes.map((code) => {
                const rows = stockMap[code] || [];
                const label = STRAP_OPTIONS.find((o) => strapOptionToCode(o) === code) || code;
                const rowMatchClass = productFilter && isProductMatch(code) ? " strap-stock-row--product-match" : "";

                if (rows.length === 0) {
                  const strapType = code;
                  const color = DEFAULT_STRAP_STOCK_COLOR;
                  const key = `${strapType}|${color}`;
                  const isEditing = editKey === key;
                  const displayQty = isEditing ? Number.parseInt(editQty, 10) : 0;
                  const qtyForShortage = Number.isFinite(displayQty) && displayQty >= 0 ? displayQty : 0;
                  return (
                    <tr key={code} className={`strap-stock-row strap-stock-row--zero${rowMatchClass}`}>
                      <td className="strap-stock-type">{label}</td>
                      <ProductGroupsCell productsByCode={productsByCode} code={strapType} />
                      <td className="strap-stock-color">{color}</td>
                      <td className="strap-stock-qty">
                        {isEditing ? (
                          <input
                            type="number"
                            className="strap-stock-qty-input"
                            value={editQty}
                            min={0}
                            onChange={(e) => setEditQty(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleEditSave(strapType, color);
                              if (e.key === "Escape") handleEditCancel();
                            }}
                            autoFocus
                          />
                        ) : (
                          <span className="strap-qty-zero">0</span>
                        )}
                      </td>
                      <DemandCell
                        demandByKey={demandByKey}
                        strapType={strapType}
                        color={color}
                        onShowOrders={(payload) =>
                          openDemandOrdersDialog({ ...payload, label })
                        }
                      />
                      <ShortageCell demandByKey={demandByKey} strapType={strapType} color={color} qty={qtyForShortage} />
                      <td className="strap-stock-updated">—</td>
                      <td className="strap-stock-actions">
                        <StrapRowActions
                          canOperateProduction={canOperateProduction}
                          isEditing={isEditing}
                          saving={saving}
                          onEditStart={() => handleEditStart(strapType, color, 0)}
                          onEditSave={() => handleEditSave(strapType, color)}
                          onEditCancel={handleEditCancel}
                          onLaunchOpen={() =>
                            openLaunchDialog({
                              strapType,
                              color,
                              label,
                              qtyOnHand: qtyForShortage,
                            })
                          }
                          onPrintOpen={() =>
                            openPrintFromRow({
                              strapType,
                              color,
                              label,
                              qtyOnHand: qtyForShortage,
                            })
                          }
                        />
                      </td>
                    </tr>
                  );
                }

                return rows.map((row) => {
                  const key = `${row.strap_type}|${row.color}`;
                  const isEditing = editKey === key;
                  const updatedAt = row.updated_at
                    ? new Date(row.updated_at).toLocaleString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—";
                  const rowQty = Number(row.qty || 0);
                  const editParsed = Number.parseInt(editQty, 10);
                  const qtyForShortage =
                    isEditing && Number.isFinite(editParsed) && editParsed >= 0 ? editParsed : rowQty;
                  return (
                    <tr
                      key={key}
                      className={`strap-stock-row ${row.qty === 0 ? "strap-stock-row--zero" : ""}${rowMatchClass}`}
                    >
                      <td className="strap-stock-type">{label}</td>
                      <ProductGroupsCell productsByCode={productsByCode} code={row.strap_type} />
                      <td className="strap-stock-color">{row.color || "—"}</td>
                      <td className="strap-stock-qty">
                        {isEditing ? (
                          <input
                            type="number"
                            className="strap-stock-qty-input"
                            value={editQty}
                            min={0}
                            onChange={(e) => setEditQty(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleEditSave(row.strap_type, row.color);
                              if (e.key === "Escape") handleEditCancel();
                            }}
                            autoFocus
                          />
                        ) : (
                          <span className={row.qty === 0 ? "strap-qty-zero" : "strap-qty-value"}>
                            {row.qty}
                          </span>
                        )}
                      </td>
                      <DemandCell
                        demandByKey={demandByKey}
                        strapType={row.strap_type}
                        color={row.color}
                        onShowOrders={(payload) =>
                          openDemandOrdersDialog({ ...payload, label })
                        }
                      />
                      <ShortageCell
                        demandByKey={demandByKey}
                        strapType={row.strap_type}
                        color={row.color}
                        qty={qtyForShortage}
                      />
                      <td className="strap-stock-updated">{updatedAt}</td>
                      <td className="strap-stock-actions">
                        <StrapRowActions
                          canOperateProduction={canOperateProduction}
                          isEditing={isEditing}
                          saving={saving}
                          onEditStart={() => handleEditStart(row.strap_type, row.color, row.qty)}
                          onEditSave={() => handleEditSave(row.strap_type, row.color)}
                          onEditCancel={handleEditCancel}
                          onLaunchOpen={() =>
                            openLaunchDialog({
                              strapType: row.strap_type,
                              color: row.color,
                              label,
                              qtyOnHand: qtyForShortage,
                            })
                          }
                          onPrintOpen={() =>
                            openPrintFromRow({
                              strapType: row.strap_type,
                              color: row.color,
                              label,
                              qtyOnHand: qtyForShortage,
                            })
                          }
                        />
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      )}

      <StrapDemandOrdersDialog
        open={Boolean(demandOrdersDialog)}
        meta={demandOrdersDialog}
        orders={demandOrdersDialog?.orders || []}
        onClose={closeDemandOrdersDialog}
      />

      <StrapLaunchDialog
        open={Boolean(launchDialog)}
        meta={launchDialog}
        qtyInput={launchQty}
        setQtyInput={setLaunchQty}
        materialInput={launchMaterial}
        setMaterialInput={setLaunchMaterial}
        productInput={launchProduct}
        setProductInput={setLaunchProduct}
        productOptions={Array.isArray(launchDialog?.products) ? launchDialog.products : []}
        materialOptions={
          launchDialog && strapRequiresLaunchColorChoice(launchDialog.strapType)
            ? STRAP_FACADE_LAUNCH_COLORS
            : []
        }
        error={launchError}
        saving={launchSaving}
        onClose={closeLaunchDialog}
        onSubmit={handleLaunchSubmit}
        onPrintPreview={openPrintFromLaunchForm}
      />

      <StrapPrintPreviewDialog
        open={strapPrintDialog.open}
        planPreview={strapPrintDialog.planPreview}
        onClose={strapPrintDialog.close}
        onPrint={strapPrintDialog.print}
        printAreaRef={strapPrintDialog.printAreaRef}
      />
    </div>
  );
}
