import { memo, useMemo, useState } from "react";
import { LABOR_GROUP_ORDER } from "../app/laborGroupHelpers";
import {
  SHOP_KROMKA_POOL,
  SHOP_PRAS_POOL,
  buildRatesByGroup,
  calcKitLabor,
  formatKitItemLabel,
  formatKitItemShort,
  normalizeKitItem,
  resolveKitGroupName,
} from "../app/laborKitPlanner";
import { STRAP_OPTIONS } from "../constants/views";

function formatHhMm(totalMin) {
  const safe = Math.max(0, Number(totalMin || 0));
  const hours = Math.floor(safe / 60);
  const minutes = Math.round(safe % 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function parseQty(value) {
  const n = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseMin(value) {
  const n = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function newStrapDraftId() {
  return `strap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyStrapDraft() {
  return {
    id: newStrapDraftId(),
    group: "",
    qty: "1",
    useCustomTimes: false,
    pilkaMin: "",
    kromkaMin: "",
    prasMin: "",
    assemblyMin: "",
    kromkaMachines: "1",
    prasMachines: "1",
  };
}

function emptySectionDraft() {
  return {
    group: "",
    qty: "1",
    useCustomTimes: false,
    pilkaMin: "",
    kromkaMin: "",
    prasMin: "",
    assemblyMin: "",
    kromkaMachines: "1",
    prasMachines: "1",
    straps: [],
  };
}

function strapOptionToGroup(option) {
  return resolveKitGroupName(option);
}

function normTimesForGroup(group, ratesByGroup) {
  const rate = ratesByGroup.get(resolveKitGroupName(group));
  if (!rate) return {};
  return {
    pilkaMin: rate.pilka > 0 ? String(rate.pilka) : "",
    kromkaMin: rate.kromka > 0 ? String(rate.kromka) : "",
    prasMin: rate.pras > 0 ? String(rate.pras) : "",
    assemblyMin: rate.assembly > 0 ? String(rate.assembly) : "",
  };
}

export const LaborKitBuilder = memo(function LaborKitBuilder({
  laborPlannerRows = [],
  savedKits = [],
  setSavedKits,
  kitQtyByKey = {},
  setKitQtyByKey,
  saveKitToDb,
  removeSavedKit,
  kitSavingId = "",
  kitDeletingId = "",
}) {
  const [kitNameDraft, setKitNameDraft] = useState("");
  const [kitBuilderItems, setKitBuilderItems] = useState([]);
  const [sectionDraft, setSectionDraft] = useState(emptySectionDraft);

  const ratesByGroup = useMemo(() => buildRatesByGroup(laborPlannerRows), [laborPlannerRows]);
  const productSections = useMemo(() => [...LABOR_GROUP_ORDER], []);
  const strapOptions = useMemo(
    () => (Array.isArray(STRAP_OPTIONS) ? STRAP_OPTIONS : []).map((opt) => ({
      label: opt,
      group: strapOptionToGroup(opt),
    })),
    [],
  );

  const updateStrap = (strapId, patch) => {
    setSectionDraft((prev) => ({
      ...prev,
      straps: prev.straps.map((strap) => (strap.id === strapId ? { ...strap, ...patch } : strap)),
    }));
  };

  const addStrapRow = () => {
    setSectionDraft((prev) => ({
      ...prev,
      straps: [...prev.straps, emptyStrapDraft()],
    }));
  };

  const removeStrapRow = (strapId) => {
    setSectionDraft((prev) => ({
      ...prev,
      straps: prev.straps.filter((strap) => strap.id !== strapId),
    }));
  };

  const onSectionChange = (group) => {
    setSectionDraft((prev) => ({
      ...prev,
      group,
      ...(prev.useCustomTimes ? {} : normTimesForGroup(group, ratesByGroup)),
    }));
  };

  const buildItemsFromDraft = () => {
    const group = resolveKitGroupName(sectionDraft.group);
    const qty = parseQty(sectionDraft.qty) || 1;
    if (!group) return [];

    const productItem = normalizeKitItem({
      group,
      kind: "product",
      qty,
      useCustomTimes: sectionDraft.useCustomTimes,
      pilkaMin: parseMin(sectionDraft.pilkaMin),
      kromkaMin: parseMin(sectionDraft.kromkaMin),
      prasMin: parseMin(sectionDraft.prasMin),
      assemblyMin: parseMin(sectionDraft.assemblyMin),
      kromkaMachines: sectionDraft.kromkaMachines,
      prasMachines: sectionDraft.prasMachines,
    }, ratesByGroup);

    const items = [productItem];

    (sectionDraft.straps || []).forEach((strap) => {
      if (!strap.group) return;
      const strapGroup = resolveKitGroupName(strap.group);
      const strapQty = parseQty(strap.qty) || 1;
      items.push(normalizeKitItem({
        group: strapGroup,
        kind: "strap",
        qty: strapQty,
        parentGroup: group,
        useCustomTimes: strap.useCustomTimes,
        pilkaMin: parseMin(strap.pilkaMin),
        kromkaMin: parseMin(strap.kromkaMin),
        prasMin: parseMin(strap.prasMin),
        assemblyMin: parseMin(strap.assemblyMin),
        kromkaMachines: strap.kromkaMachines,
        prasMachines: strap.prasMachines,
      }, ratesByGroup));
    });

    return items;
  };

  const addSectionToKit = () => {
    const items = buildItemsFromDraft();
    if (!items.length || !items[0].group) return;
    setKitBuilderItems((prev) => [...prev, ...items]);
    setSectionDraft(emptySectionDraft());
  };

  const removeBuilderItem = (idx) => {
    setKitBuilderItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveKitFromBuilder = () => {
    const name = String(kitNameDraft || "").trim();
    if (!name || kitBuilderItems.length === 0) return;
    const id = `kit-${Date.now()}`;
    setSavedKits((prev) => [{
      id,
      dbId: null,
      dbSaved: false,
      name,
      items: kitBuilderItems.map((item) => ({ ...item })),
    }, ...prev]);
    setKitNameDraft("");
    setKitBuilderItems([]);
    setSectionDraft(emptySectionDraft());
  };

  const plannerKitRows = useMemo(
    () => savedKits.map((kit) => {
      const plannedQtyRaw = kitQtyByKey[kit.id];
      const kits = Math.max(0, parseQty(plannedQtyRaw));
      const labor = calcKitLabor(kit.items, { kitCount: kits, ratesByGroup });
      return {
        ...kit,
        kits,
        laborPerKitMin: labor.seqPerKit,
        laborPerKitMinParallel: labor.parallelPerKit,
        totalMin: labor.batchSeq,
        totalMinParallel: labor.batchParallel,
        hhmm: formatHhMm(labor.batchSeq),
        hhmmParallel: formatHhMm(labor.batchParallel),
        missingItems: labor.missingItems,
        normalizedItems: labor.items,
      };
    }),
    [savedKits, kitQtyByKey, ratesByGroup],
  );

  const previewDraft = useMemo(() => {
    const items = buildItemsFromDraft();
    if (!items.length) return null;
    return calcKitLabor(items, { kitCount: 1, ratesByGroup });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionDraft, ratesByGroup]);

  const renderTimeFields = (values, groupForNorm, onPatch) => {
    const timeBases = [
      ["pilkaMin", "Пила"],
      ["kromkaMin", "Кромка"],
      ["prasMin", "Прис."],
      ["assemblyMin", "Сборка"],
    ];
    const normRate = ratesByGroup.get(resolveKitGroupName(groupForNorm));
    const useCustom = Boolean(values.useCustomTimes);
    return (
      <div className="labor-kit-builder__times">
        <label className="labor-kit-check">
          <input
            type="checkbox"
            checked={useCustom}
            onChange={(e) => {
              const checked = e.target.checked;
              onPatch({
                useCustomTimes: checked,
                ...(checked ? {} : normTimesForGroup(groupForNorm, ratesByGroup)),
              });
            }}
          />
          <span>Своё время</span>
        </label>
        {!useCustom && normRate ? (
          <span className="labor-kit-builder__norm-hint">
            норма {Math.round(normRate.pilka)}/{Math.round(normRate.kromka)}/{Math.round(normRate.pras)} мин
          </span>
        ) : null}
        <div className="labor-kit-builder__times-grid">
          {timeBases.map(([key, label]) => (
            <label key={key} className="labor-kit-field labor-kit-field--xs">
              <span>{label}</span>
              <input
                type="number"
                min="0"
                step="1"
                value={values[key] ?? ""}
                disabled={!useCustom}
                onChange={(e) => onPatch({ [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="labor-kit-builder">
      <p className="labor-kit-builder__hint">
        {SHOP_KROMKA_POOL} кромочника и {SHOP_PRAS_POOL} присадочных — укажите станки на изделие.
      </p>

      <details className="labor-kit-builder__panel" open>
        <summary className="labor-kit-builder__summary">Добавить секцию</summary>
        <div className="labor-kit-builder__form-grid">
          <label className="labor-kit-field">
            <span>Секция</span>
            <select value={sectionDraft.group} onChange={(e) => onSectionChange(e.target.value)}>
              <option value="">Выберите…</option>
              {productSections.map((group) => (
                <option key={`section-${group}`} value={group}>{group}</option>
              ))}
            </select>
          </label>
          <label className="labor-kit-field labor-kit-field--xs">
            <span>Кол-во</span>
            <input type="number" min="0.01" step="0.01" value={sectionDraft.qty} onChange={(e) => setSectionDraft((p) => ({ ...p, qty: e.target.value }))} />
          </label>
          <label className="labor-kit-field labor-kit-field--xs">
            <span>Кромка</span>
            <select value={sectionDraft.kromkaMachines} onChange={(e) => setSectionDraft((p) => ({ ...p, kromkaMachines: e.target.value }))}>
              <option value="1">×1</option>
              <option value="2">×2</option>
            </select>
          </label>
          <label className="labor-kit-field labor-kit-field--xs">
            <span>Присадка</span>
            <select value={sectionDraft.prasMachines} onChange={(e) => setSectionDraft((p) => ({ ...p, prasMachines: e.target.value }))}>
              <option value="1">×1</option>
              <option value="2">×2</option>
            </select>
          </label>
        </div>

        {sectionDraft.group
          ? renderTimeFields(sectionDraft, sectionDraft.group, (patch) => setSectionDraft((p) => ({ ...p, ...patch })))
          : null}

        <label className="labor-kit-check">
          <input
            type="checkbox"
            checked={sectionDraft.straps.length > 0}
            onChange={(e) => {
              setSectionDraft((p) => ({
                ...p,
                straps: e.target.checked ? [emptyStrapDraft()] : [],
              }));
            }}
            disabled={!sectionDraft.group}
          />
          <span>+ обвязка</span>
        </label>

        {sectionDraft.straps.length > 0 ? (
          <div className="labor-kit-builder__straps">
            <div className="labor-kit-builder__straps-head">
              <span className="labor-kit-builder__straps-title">Обвязки для секции</span>
              <button type="button" className="mini" onClick={addStrapRow}>
                + ещё обвязка
              </button>
            </div>
            {sectionDraft.straps.map((strap, idx) => (
              <div key={strap.id} className="labor-kit-builder__strap">
                {idx > 0 ? <hr className="labor-kit-builder__strap-divider" /> : null}
                <div className="labor-kit-builder__strap-head">
                  <span className="labor-kit-builder__strap-index">#{idx + 1}</span>
                  {sectionDraft.straps.length > 1 ? (
                    <button type="button" className="mini warn" onClick={() => removeStrapRow(strap.id)}>
                      Убрать
                    </button>
                  ) : null}
                </div>
                <div className="labor-kit-builder__form-grid">
                  <label className="labor-kit-field">
                    <span>Обвязка</span>
                    <select
                      value={strap.group}
                      onChange={(e) => {
                        const group = e.target.value;
                        updateStrap(strap.id, {
                          group,
                          ...(strap.useCustomTimes ? {} : normTimesForGroup(group, ratesByGroup)),
                        });
                      }}
                    >
                      <option value="">Выберите…</option>
                      {strapOptions.map((opt) => (
                        <option key={`strap-${strap.id}-${opt.label}`} value={opt.group}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="labor-kit-field labor-kit-field--xs">
                    <span>Кол-во</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={strap.qty}
                      onChange={(e) => updateStrap(strap.id, { qty: e.target.value })}
                    />
                  </label>
                  <label className="labor-kit-field labor-kit-field--xs">
                    <span>Кромка</span>
                    <select
                      value={strap.kromkaMachines}
                      onChange={(e) => updateStrap(strap.id, { kromkaMachines: e.target.value })}
                    >
                      <option value="1">×1</option>
                      <option value="2">×2</option>
                    </select>
                  </label>
                  <label className="labor-kit-field labor-kit-field--xs">
                    <span>Присадка</span>
                    <select
                      value={strap.prasMachines}
                      onChange={(e) => updateStrap(strap.id, { prasMachines: e.target.value })}
                    >
                      <option value="1">×1</option>
                      <option value="2">×2</option>
                    </select>
                  </label>
                </div>
                {strap.group
                  ? renderTimeFields(strap, strap.group, (patch) => updateStrap(strap.id, patch))
                  : null}
              </div>
            ))}
          </div>
        ) : null}

        {previewDraft ? (
          <div className="labor-kit-builder__preview">
            секция: {Math.round(previewDraft.seqPerKit)} / {Math.round(previewDraft.parallelPerKit)} мин
          </div>
        ) : null}

        <button type="button" className="mini ok" onClick={addSectionToKit} disabled={!sectionDraft.group}>
          Добавить в комплект
        </button>
      </details>

      <div className="labor-kit-builder__save-row">
        <input
          type="text"
          className="labor-kit-builder__name-input"
          value={kitNameDraft}
          onChange={(e) => setKitNameDraft(e.target.value)}
          placeholder="Имя комплекта"
        />
        <button
          type="button"
          className="mini ok"
          onClick={saveKitFromBuilder}
          disabled={!kitNameDraft.trim() || kitBuilderItems.length === 0}
        >
          Сохранить
        </button>
      </div>

      {kitBuilderItems.length > 0 ? (
        <div className="labor-kit-builder__draft">
          {kitBuilderItems.map((item, idx) => (
            <button
              key={`builder-item-${item.group}-${idx}`}
              type="button"
              className="mini"
              onClick={() => removeBuilderItem(idx)}
              title={formatKitItemLabel(item)}
            >
              {formatKitItemShort(item)}
            </button>
          ))}
        </div>
      ) : (
        <p className="labor-kit-builder__hint">Состав пуст — добавьте секции.</p>
      )}

      {plannerKitRows.length > 0 ? (
        <div className="labor-kit-list">
          {plannerKitRows.map((r) => (
            <article key={`planner-kit-${r.id}`} className="labor-kit-card">
              <div className="labor-kit-card__head">
                <strong className="labor-kit-card__name">{r.name}</strong>
                <label className="labor-kit-card__plan">
                  <span>План</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={kitQtyByKey[r.id] ?? ""}
                    onChange={(e) => setKitQtyByKey((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    placeholder="0"
                  />
                </label>
              </div>
              <ul className="labor-kit-card__compose">
                {r.normalizedItems.map((x, idx) => (
                  <li key={`${r.id}-item-${idx}`} title={formatKitItemLabel(x)}>
                    {formatKitItemShort(x)}
                    <span className="labor-kit-card__machines">К{x.kromkaMachines} П{x.prasMachines}</span>
                  </li>
                ))}
              </ul>
              <div className="labor-kit-card__metrics">
                <div>
                  <span className="labor-kit-card__metric-label">Норма/компл.</span>
                  <span>{Math.round(r.laborPerKitMin)} seq</span>
                  <span>{Math.round(r.laborPerKitMinParallel)} 2+2</span>
                </div>
                <div>
                  <span className="labor-kit-card__metric-label">Итого</span>
                  <span><b>{r.hhmm}</b> seq</span>
                  <span><b>{r.hhmmParallel}</b> 2+2</span>
                </div>
              </div>
              {r.missingItems.length > 0 ? (
                <div className="labor-kit-card__warn">Нет нормы: {r.missingItems.join(", ")}</div>
              ) : null}
              <div className="labor-kit-card__actions">
                <button type="button" className="mini ok" onClick={() => void saveKitToDb(r)} disabled={kitSavingId === r.id}>
                  {kitSavingId === r.id ? "…" : r.dbSaved ? "Обновить" : "В БД"}
                </button>
                <button type="button" className="mini warn" onClick={() => void removeSavedKit(r)} disabled={kitDeletingId === r.id}>
                  {kitDeletingId === r.id ? "…" : "Удалить"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">Сохранённых комплектов пока нет.</div>
      )}
    </div>
  );
});
