import { memo, useMemo, useState } from "react";
import { LABOR_GROUP_ORDER } from "../app/laborGroupHelpers";
import {
  SHOP_KROMKA_POOL,
  SHOP_PRAS_POOL,
  buildRatesByGroup,
  calcKitLabor,
  formatKitItemLabel,
  formatKitItemShort,
  kitItemsToSectionDrafts,
  resolveKitGroupName,
  sectionDraftToKitItems,
  sectionDraftsToKitItems,
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
  saveKitPlanQty,
  saveAllKitPlanQty,
  removeSavedKit,
  kitSavingId = "",
  kitDeletingId = "",
  kitPlanSavingId = "",
  kitPlanBulkSaving = false,
  kitPlanSaveNotice = "",
  canSaveKitPlanQty = false,
}) {
  const [kitNameDraft, setKitNameDraft] = useState("");
  const [kitBuilderItems, setKitBuilderItems] = useState([]);
  const [sectionDraft, setSectionDraft] = useState(emptySectionDraft);
  const [editingKitId, setEditingKitId] = useState(null);
  const [editSections, setEditSections] = useState([]);
  const [editingPlanQty, setEditingPlanQty] = useState("");

  const ratesByGroup = useMemo(() => buildRatesByGroup(laborPlannerRows), [laborPlannerRows]);

  const editingKit = useMemo(
    () => (editingKitId ? savedKits.find((k) => k.id === editingKitId) || null : null),
    [editingKitId, savedKits],
  );

  const resetBuilderDraft = () => {
    setKitNameDraft("");
    setKitBuilderItems([]);
    setSectionDraft(emptySectionDraft());
    setEditSections([]);
    setEditingPlanQty("");
    setEditingKitId(null);
  };

  const startEditKit = (kit) => {
    const items = Array.isArray(kit?.items) ? kit.items : [];
    setKitNameDraft(String(kit?.name || "").trim());
    setKitBuilderItems([]);
    setEditSections(kitItemsToSectionDrafts(items, ratesByGroup));
    setEditingPlanQty(String(kitQtyByKey[kit.id] ?? "").trim());
    setSectionDraft(emptySectionDraft());
    setEditingKitId(kit.id);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        document.querySelector(".labor-kit-builder__save-row")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  };
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

  const buildItemsFromDraft = () => sectionDraftToKitItems(sectionDraft, ratesByGroup);

  const appendDraftSection = () => {
    const items = buildItemsFromDraft();
    if (!items.length || !items[0].group) return;
    if (editingKitId) {
      setEditSections((prev) => [
        ...prev,
        {
          id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          group: sectionDraft.group,
          qty: sectionDraft.qty,
          useCustomTimes: sectionDraft.useCustomTimes,
          pilkaMin: sectionDraft.pilkaMin,
          kromkaMin: sectionDraft.kromkaMin,
          prasMin: sectionDraft.prasMin,
          assemblyMin: sectionDraft.assemblyMin,
          kromkaMachines: sectionDraft.kromkaMachines,
          prasMachines: sectionDraft.prasMachines,
          straps: (sectionDraft.straps || []).map((strap) => ({ ...strap })),
        },
      ]);
    } else {
      setKitBuilderItems((prev) => [...prev, ...items]);
    }
    setSectionDraft(emptySectionDraft());
  };

  const patchEditSection = (sectionId, patch) => {
    setEditSections((prev) => prev.map((section) => (
      section.id === sectionId ? { ...section, ...patch } : section
    )));
  };

  const patchEditStrap = (sectionId, strapId, patch) => {
    setEditSections((prev) => prev.map((section) => {
      if (section.id !== sectionId) return section;
      return {
        ...section,
        straps: (section.straps || []).map((strap) => (
          strap.id === strapId ? { ...strap, ...patch } : strap
        )),
      };
    }));
  };

  const removeEditSection = (sectionId) => {
    setEditSections((prev) => prev.filter((section) => section.id !== sectionId));
  };

  const addEditStrapRow = (sectionId) => {
    setEditSections((prev) => prev.map((section) => (
      section.id === sectionId
        ? { ...section, straps: [...(section.straps || []), emptyStrapDraft()] }
        : section
    )));
  };

  const removeEditStrapRow = (sectionId, strapId) => {
    setEditSections((prev) => prev.map((section) => (
      section.id === sectionId
        ? { ...section, straps: (section.straps || []).filter((strap) => strap.id !== strapId) }
        : section
    )));
  };

  const removeBuilderItem = (idx) => {
    setKitBuilderItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveKitFromBuilder = async () => {
    const name = String(kitNameDraft || "").trim();
    const items = editingKitId
      ? sectionDraftsToKitItems(editSections, ratesByGroup)
      : kitBuilderItems.map((item) => ({ ...item }));
    if (!name || items.length === 0) return;

    if (editingKitId) {
      let savedKit = null;
      const planQty = editingPlanQty;
      setSavedKits((prev) => prev.map((kit) => {
        if (kit.id !== editingKitId) return kit;
        savedKit = { ...kit, name, items };
        return savedKit;
      }));
      setKitQtyByKey((prev) => ({ ...prev, [editingKitId]: planQty }));
      resetBuilderDraft();
      if (savedKit?.dbSaved && typeof saveKitPlanQty === "function") {
        await saveKitPlanQty(savedKit, planQty);
      }
      if (savedKit?.dbSaved && typeof saveKitToDb === "function") {
        await saveKitToDb(savedKit);
      }
      return;
    }

    const id = `kit-${Date.now()}`;
    setSavedKits((prev) => [{
      id,
      dbId: null,
      dbSaved: false,
      name,
      items,
    }, ...prev]);
    resetBuilderDraft();
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

        <button type="button" className="mini ok" onClick={appendDraftSection} disabled={!sectionDraft.group}>
          {editingKitId ? "Добавить секцию в комплект" : "Добавить в комплект"}
        </button>
      </details>

      {editingKit ? (
        <div className="labor-kit-builder__edit-banner">
          <span>Редактирование: <b>{editingKit.name}</b></span>
          <label className="labor-kit-field labor-kit-field--xs">
            <span>План (компл.)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={editingPlanQty}
              onChange={(e) => setEditingPlanQty(e.target.value)}
              placeholder="0"
            />
          </label>
          <button type="button" className="mini" onClick={resetBuilderDraft}>
            Отмена
          </button>
        </div>
      ) : null}

      {editingKitId && editSections.length > 0 ? (
        <div className="labor-kit-builder__edit-sections">
          {editSections.map((section, sectionIdx) => (
            <details key={section.id} className="labor-kit-builder__panel" open>
              <summary className="labor-kit-builder__summary">
                Секция {sectionIdx + 1}: {section.group || "—"}
              </summary>
              <div className="labor-kit-builder__form-grid">
                <label className="labor-kit-field">
                  <span>Секция</span>
                  <select
                    value={section.group}
                    onChange={(e) => patchEditSection(section.id, {
                      group: e.target.value,
                      ...(section.useCustomTimes ? {} : normTimesForGroup(e.target.value, ratesByGroup)),
                    })}
                  >
                    <option value="">Выберите…</option>
                    {productSections.map((group) => (
                      <option key={`edit-section-${section.id}-${group}`} value={group}>{group}</option>
                    ))}
                  </select>
                </label>
                <label className="labor-kit-field labor-kit-field--xs">
                  <span>Кол-во</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={section.qty}
                    onChange={(e) => patchEditSection(section.id, { qty: e.target.value })}
                  />
                </label>
                <label className="labor-kit-field labor-kit-field--xs">
                  <span>Кромка</span>
                  <select
                    value={section.kromkaMachines}
                    onChange={(e) => patchEditSection(section.id, { kromkaMachines: e.target.value })}
                  >
                    <option value="1">×1</option>
                    <option value="2">×2</option>
                  </select>
                </label>
                <label className="labor-kit-field labor-kit-field--xs">
                  <span>Присадка</span>
                  <select
                    value={section.prasMachines}
                    onChange={(e) => patchEditSection(section.id, { prasMachines: e.target.value })}
                  >
                    <option value="1">×1</option>
                    <option value="2">×2</option>
                  </select>
                </label>
              </div>
              {section.group
                ? renderTimeFields(section, section.group, (patch) => patchEditSection(section.id, patch))
                : null}
              {(section.straps || []).length > 0 ? (
                <div className="labor-kit-builder__straps">
                  <div className="labor-kit-builder__straps-head">
                    <span className="labor-kit-builder__straps-title">Обвязки</span>
                    <button type="button" className="mini" onClick={() => addEditStrapRow(section.id)}>
                      + ещё обвязка
                    </button>
                  </div>
                  {(section.straps || []).map((strap, idx) => (
                    <div key={strap.id} className="labor-kit-builder__strap">
                      {idx > 0 ? <hr className="labor-kit-builder__strap-divider" /> : null}
                      <div className="labor-kit-builder__strap-head">
                        <span className="labor-kit-builder__strap-index">#{idx + 1}</span>
                        {(section.straps || []).length > 1 ? (
                          <button type="button" className="mini warn" onClick={() => removeEditStrapRow(section.id, strap.id)}>
                            Убрать
                          </button>
                        ) : null}
                      </div>
                      <div className="labor-kit-builder__form-grid">
                        <label className="labor-kit-field">
                          <span>Обвязка</span>
                          <select
                            value={strap.group}
                            onChange={(e) => patchEditStrap(section.id, strap.id, {
                              group: e.target.value,
                              ...(strap.useCustomTimes ? {} : normTimesForGroup(e.target.value, ratesByGroup)),
                            })}
                          >
                            <option value="">Выберите…</option>
                            {strapOptions.map((opt) => (
                              <option key={`edit-strap-${section.id}-${strap.id}-${opt.label}`} value={opt.group}>{opt.label}</option>
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
                            onChange={(e) => patchEditStrap(section.id, strap.id, { qty: e.target.value })}
                          />
                        </label>
                        <label className="labor-kit-field labor-kit-field--xs">
                          <span>Кромка</span>
                          <select
                            value={strap.kromkaMachines}
                            onChange={(e) => patchEditStrap(section.id, strap.id, { kromkaMachines: e.target.value })}
                          >
                            <option value="1">×1</option>
                            <option value="2">×2</option>
                          </select>
                        </label>
                        <label className="labor-kit-field labor-kit-field--xs">
                          <span>Присадка</span>
                          <select
                            value={strap.prasMachines}
                            onChange={(e) => patchEditStrap(section.id, strap.id, { prasMachines: e.target.value })}
                          >
                            <option value="1">×1</option>
                            <option value="2">×2</option>
                          </select>
                        </label>
                      </div>
                      {strap.group
                        ? renderTimeFields(strap, strap.group, (patch) => patchEditStrap(section.id, strap.id, patch))
                        : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="labor-kit-builder__edit-section-actions">
                <button type="button" className="mini warn" onClick={() => removeEditSection(section.id)}>
                  Удалить секцию
                </button>
              </div>
            </details>
          ))}
        </div>
      ) : null}

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
          onClick={() => void saveKitFromBuilder()}
          disabled={
            !kitNameDraft.trim()
            || (editingKitId ? editSections.length === 0 : kitBuilderItems.length === 0)
          }
        >
          {editingKitId ? "Сохранить изменения" : "Сохранить"}
        </button>
      </div>

      {!editingKitId && kitBuilderItems.length > 0 ? (
        <div className="labor-kit-builder__draft">
          {kitBuilderItems.map((item, idx) => (
            <button
              key={`builder-item-${item.group}-${idx}`}
              type="button"
              className="mini"
              onClick={() => removeBuilderItem(idx)}
              title={`${formatKitItemLabel(item)} — нажмите, чтобы убрать`}
            >
              {formatKitItemShort(item)}
            </button>
          ))}
        </div>
      ) : null}
      {!editingKitId && kitBuilderItems.length === 0 ? (
        <p className="labor-kit-builder__hint">Состав пуст — добавьте секции.</p>
      ) : null}
      {editingKitId && editSections.length === 0 ? (
        <p className="labor-kit-builder__hint">Состав пуст — добавьте секции или отмените редактирование.</p>
      ) : null}

      {plannerKitRows.length > 0 ? (
        <>
        <div className="labor-kit-builder__plan-toolbar">
          <span className="labor-kit-builder__plan-hint">
            План на карточках виден всем после сохранения в БД.
          </span>
          {canSaveKitPlanQty ? (
            <button
              type="button"
              className="mini ok"
              disabled={kitPlanBulkSaving || !savedKits.some((kit) => kit.dbSaved)}
              onClick={() => {
                if (typeof saveAllKitPlanQty === "function") void saveAllKitPlanQty();
              }}
            >
              {kitPlanBulkSaving ? "Сохраняю…" : "Сохранить количество комплектов"}
            </button>
          ) : (
            <span className="labor-kit-builder__plan-readonly">Только просмотр</span>
          )}
          {kitPlanSaveNotice ? (
            <span className="labor-kit-builder__plan-notice">{kitPlanSaveNotice}</span>
          ) : null}
        </div>
        <div className="labor-kit-list">
          {plannerKitRows.map((r) => (
            <article key={`planner-kit-${r.id}`} className="labor-kit-card">
              <div className="labor-kit-card__head">
                <strong className="labor-kit-card__name">{r.name}</strong>
                <label className="labor-kit-card__plan">
                  <span>План{kitPlanSavingId === r.id ? " …" : ""}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={kitQtyByKey[r.id] ?? ""}
                    onChange={(e) => setKitQtyByKey((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    onBlur={(e) => {
                      if (canSaveKitPlanQty && typeof saveKitPlanQty === "function") {
                        void saveKitPlanQty(r, e.target.value);
                      }
                    }}
                    placeholder="0"
                    readOnly={!canSaveKitPlanQty}
                    title={
                      !canSaveKitPlanQty
                        ? "Только просмотр"
                        : r.dbSaved
                          ? "Сохраняется в БД при выходе из поля или кнопкой ниже"
                          : "Сначала сохраните комплект в БД"
                    }
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
                <button
                  type="button"
                  className="mini"
                  onClick={() => startEditKit(r)}
                  disabled={editingKitId === r.id}
                >
                  {editingKitId === r.id ? "Редактируется" : "Редактировать"}
                </button>
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
        </>
      ) : (
        <div className="empty">Сохранённых комплектов пока нет.</div>
      )}
    </div>
  );
});
