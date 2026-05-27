import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCutting } from "../contexts/CuttingContext";
import { buildCuttingPlan, CUTTING_ALGORITHMS, cuttingPieceSize } from "../app/cuttingPlanAlgorithm";
import { formatCuttingDim } from "../app/cuttingCatalogHelpers";
import { CuttingPlanView } from "../components/CuttingPlanView";
import { readExcelFile } from "../app/cuttingExcelImport";
import { CuttingCatalogDialog } from "../components/CuttingCatalogDialog";

// ---- sub-components ----

function NumField({ label, value, onChange, min = 0, max = 9999 }) {
  return (
    <label className="cv-setting">
      <span className="cv-setting__label">{label}</span>
      <input
        className="cv-setting__input"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function SettingsRow({ settings, onChange }) {
  const s = settings;
  const currentAlgo = CUTTING_ALGORITHMS.find((a) => a.id === s.algorithm) || CUTTING_ALGORITHMS[0];

  return (
    <div className="cv-settings no-print">
      <NumField label="Ширина листа" value={s.sheetW} onChange={(v) => onChange({ sheetW: v })} min={100} max={5000} />
      <NumField label="Высота листа" value={s.sheetH} onChange={(v) => onChange({ sheetH: v })} min={100} max={5000} />
      <div className="cv-settings__sep" />
      <NumField label="Пропил, мм" value={s.kerf} onChange={(v) => onChange({ kerf: v })} min={0} max={20} />
      <NumField label="Отступ X, мм" value={s.marginX} onChange={(v) => onChange({ marginX: v })} min={0} max={200} />
      <NumField label="Отступ Y, мм" value={s.marginY} onChange={(v) => onChange({ marginY: v })} min={0} max={200} />
      <div className="cv-settings__sep" />
      <label className="cv-setting cv-setting--check">
        <input
          type="checkbox"
          checked={!!s.accountEdgeBand}
          onChange={(e) => onChange({ accountEdgeBand: e.target.checked })}
        />
        <span className="cv-setting__label">Учитывать кромку</span>
      </label>
      <div className="cv-settings__sep" />
      <label className="cv-setting cv-setting--algo">
        <span className="cv-setting__label">Алгоритм</span>
        <select
          className="cv-algo-select"
          value={s.algorithm || "greedy"}
          onChange={(e) => onChange({ algorithm: e.target.value })}
          title={currentAlgo.hint}
        >
          {CUTTING_ALGORITHMS.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function JobSidebar({ jobs, activeJobId, onOpen, onDelete, onNewJob, loading, onClose }) {
  return (
    <aside className="cv-sidebar no-print">
      <div className="cv-sidebar__head">
        <span className="cv-sidebar__title">Сессии</span>
        <div className="cv-sidebar__head-actions">
          <button className="cv-sidebar__new-btn" onClick={onNewJob}>+ Новая</button>
          <button className="cv-sidebar__close" onClick={onClose} title="Закрыть">✕</button>
        </div>
      </div>

      <div className="cv-sidebar__list">
        {loading && (
          <div className="cv-sidebar__loading">
            <span className="cv-sidebar__spinner" />
            Загрузка…
          </div>
        )}
        {!loading && jobs.length === 0 && (
          <div className="cv-sidebar__empty">Нет сохранённых сессий</div>
        )}
        {jobs.map((job) => (
          <button
            key={job.id}
            className={`cv-sidebar__item${job.id === activeJobId ? " cv-sidebar__item--active" : ""}`}
            onClick={() => onOpen(job)}
          >
            <div className="cv-sidebar__item-body">
              <span className="cv-sidebar__item-name">{job.name || "Новый раскрой"}</span>
              <span className="cv-sidebar__item-meta">
                {Array.isArray(job.items) ? job.items.length : 0} поз.
                {" · "}
                {new Date(job.updated_at).toLocaleDateString("ru", { day: "numeric", month: "short" })}
              </span>
            </div>
            <span
              className="cv-sidebar__item-del"
              role="button"
              title="Удалить"
              onClick={(e) => { e.stopPropagation(); onDelete(job.id); }}
            >✕</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function ItemRow({ item, idx, accountEdgeBand, onQty, onTurn, onRemove }) {
  const cut = cuttingPieceSize(item.w, item.h, { accountEdgeBand });
  const showCutDims = accountEdgeBand && (cut.w !== item.w || cut.h !== item.h);

  return (
    <div className={`cv-item${item.turned ? " cv-item--turned" : ""}`}>
      <div className="cv-item__main">
        <div className="cv-item__name" title={item.itemName}>{item.itemName}</div>
        <div className="cv-item__dims">
          {formatCuttingDim(item.w)}×{formatCuttingDim(item.h)} мм
          {showCutDims ? (
            <span className="cv-item__chip cv-item__chip--cut" title="Размер в раскрое с учётом кромки">
              → {formatCuttingDim(cut.w)}×{formatCuttingDim(cut.h)}
            </span>
          ) : null}
          {item.turned && <span className="cv-item__chip cv-item__chip--turn">↺ повёрнута</span>}
          {item.material ? <span className="cv-item__chip">{item.material}</span> : null}
          {item.week ? <span className="cv-item__chip">нед. {item.week}</span> : null}
        </div>
      </div>
      <div className="cv-item__actions">
        <button
          className={`cv-item__turn-btn${item.turned ? " cv-item__turn-btn--active" : ""}`}
          onClick={() => onTurn(idx)}
          title={item.turned ? "Деталь повёрнута — нажмите чтобы вернуть" : "Повернуть деталь на 90°"}
        >
          ↺
        </button>
        <div className="cv-item__qty">
          <button className="cv-item__qty-btn" onClick={() => onQty(idx, -1)}>−</button>
          <span className="cv-item__qty-val">{item.qty || 1}</span>
          <button className="cv-item__qty-btn" onClick={() => onQty(idx, +1)}>+</button>
        </div>
        <button className="cv-item__del" onClick={() => onRemove(idx)} title="Удалить позицию">✕</button>
      </div>
    </div>
  );
}

// ── Inline "Add item" form ────────────────────────────────────────────────────

const EMPTY_FORM = { name: "", w: "", h: "", qty: 1, material: "" };

function AddItemForm({ existingMaterials, onAdd, onClose }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const set = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const submit = () => {
    const w = parseFloat(form.w);
    const h = parseFloat(form.h);
    if (!w || !h || w <= 0 || h <= 0) return;
    onAdd({
      itemName: form.name.trim() || `${w}×${h}`,
      w,
      h,
      qty: Math.max(1, parseInt(form.qty, 10) || 1),
      material: form.material.trim(),
    });
    setForm((prev) => ({ ...prev, name: "", w: "", h: "", qty: 1 }));
    nameRef.current?.focus();
  };

  const onKey = (e) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
    if (e.key === "Escape") onClose();
  };

  const datalistId = "cv-add-materials";
  const canAdd = parseFloat(form.w) > 0 && parseFloat(form.h) > 0;

  return (
    <div className="cv-add-form" onKeyDown={onKey}>
      <datalist id={datalistId}>
        {existingMaterials.map((m) => <option key={m} value={m} />)}
      </datalist>

      {/* Row 1: name + material */}
      <div className="cv-add-form__row">
        <input
          ref={nameRef}
          className="cv-add-form__input cv-add-form__input--name"
          placeholder="Название детали"
          value={form.name}
          onChange={set("name")}
        />
      </div>

      {/* Row 2: W × H  qty */}
      <div className="cv-add-form__row">
        <input
          className="cv-add-form__input cv-add-form__input--dim"
          type="number"
          placeholder="Ш"
          min="1"
          value={form.w}
          onChange={set("w")}
        />
        <span className="cv-add-form__x">×</span>
        <input
          className="cv-add-form__input cv-add-form__input--dim"
          type="number"
          placeholder="В"
          min="1"
          value={form.h}
          onChange={set("h")}
        />
        <span className="cv-add-form__x">мм</span>
        <input
          className="cv-add-form__input cv-add-form__input--qty"
          type="number"
          placeholder="Кол"
          min="1"
          value={form.qty}
          onChange={set("qty")}
        />
        <span className="cv-add-form__x">шт</span>
      </div>

      {/* Row 3: material */}
      <div className="cv-add-form__row">
        <input
          className="cv-add-form__input cv-add-form__input--mat"
          list={datalistId}
          placeholder="Материал (напр. ЛДСП 16мм)"
          value={form.material}
          onChange={set("material")}
        />
        <button
          className="cv-add-form__btn"
          disabled={!canAdd}
          onClick={submit}
          title="Добавить деталь (Enter)"
        >
          + Добавить
        </button>
      </div>
    </div>
  );
}

// ── Items panel ───────────────────────────────────────────────────────────────

function ItemsPanel({ items, accountEdgeBand, onQty, onTurn, onRemove, showAddForm, existingMaterials, onAdd, onCloseForm }) {
  return (
    <>
      {showAddForm && (
        <AddItemForm
          existingMaterials={existingMaterials}
          onAdd={onAdd}
          onClose={onCloseForm}
        />
      )}

      {items.length === 0 && !showAddForm ? (
        <div className="cv-items-empty">
          <div className="cv-items-empty__icon">✂</div>
          <div className="cv-items-empty__title">Нет позиций</div>
          <div className="cv-items-empty__hint">
            Добавьте деталь кнопкой «+» выше,<br />
            или импортируйте из Excel (кнопка «📥 Импорт XLS»)
          </div>
        </div>
      ) : (
        <div className="cv-items">
          {items.map((item, idx) => (
            <ItemRow
              key={idx}
              item={item}
              idx={idx}
              accountEdgeBand={accountEdgeBand}
              onQty={onQty}
              onTurn={onTurn}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ---- main view ----

export function CuttingView() {
  const {
    jobs,
    activeJob,
    loading,
    saving,
    error,
    cuttingResult,
    setCuttingResult,
    openJob,
    createNewJob,
    setJobName,
    updateSettings,
    addItems,
    updateItemQty,
    toggleItemTurn,
    removeItem,
    deleteJob,
  } = useCutting();

  const [calculating, setCalculating] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importWarn, setImportWarn] = useState(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const fileInputRef = useRef(null);

  // Unique materials from current items (for datalist suggestions)
  const existingMaterials = useMemo(
    () => [...new Set(activeJob.items.map((it) => it.material).filter(Boolean))],
    [activeJob.items]
  );

  const handleAddItem = useCallback((item) => {
    addItems([item]);
  }, [addItems]);

  const handleAddFromCatalog = useCallback((items, meta) => {
    const merged = [...activeJob.items];
    for (const ni of items) {
      const existing = merged.find(
        (x) => x.itemName === ni.itemName && x.material === ni.material,
      );
      if (existing) {
        existing.qty = (existing.qty || 1) + (ni.qty || 1);
      } else {
        merged.push({ ...ni });
      }
    }

    addItems(items);
    if (meta?.kitName) {
      setImportWarn(`Добавлено из каталога: ${meta.kitName} × ${meta.setsCount} компл. (${items.length} поз.)`);
      setTimeout(() => setImportWarn(null), 6000);
    }

    setCalculating(true);
    setTimeout(() => {
      try {
        const materialGroups = buildCuttingPlan(merged, activeJob.settings);
        setCuttingResult({
          materialGroups,
          generatedAt: new Date().toLocaleString("ru"),
          jobName: activeJob.name || meta?.kitName || "Раскрой",
          settings: activeJob.settings,
        });
      } catch (e) {
        console.error("Cutting plan error:", e);
      } finally {
        setCalculating(false);
      }
    }, 0);
  }, [activeJob, addItems, setCuttingResult]);

  const handleImportFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    if (!file) return;
    setImporting(true);
    setImportWarn(null);
    try {
      const { items, warnings } = await readExcelFile(file);
      if (items.length > 0) {
        addItems(items);
      }
      setImportWarn(
        warnings.length > 0
          ? warnings.join(" · ")
          : `Импортировано ${items.length} позиций из «${file.name}»`
      );
      setTimeout(() => setImportWarn(null), 6000);
    } catch (err) {
      setImportWarn(`Ошибка: ${err.message}`);
    } finally {
      setImporting(false);
    }
  }, [addItems]);

  const calculate = useCallback(() => {
    if (!activeJob.items.length) return;
    setCalculating(true);
    setTimeout(() => {
      try {
        const materialGroups = buildCuttingPlan(activeJob.items, activeJob.settings);
        setCuttingResult({
          materialGroups,
          generatedAt: new Date().toLocaleString("ru"),
          jobName: activeJob.name || "Раскрой",
          settings: activeJob.settings,
        });
      } catch (e) {
        console.error("Cutting plan error:", e);
      } finally {
        setCalculating(false);
      }
    }, 0);
  }, [activeJob, setCuttingResult]);

  const totalItems = activeJob.items.length;
  const totalPcs = activeJob.items.reduce((s, it) => s + (it.qty || 1), 0);
  const hasResult = !!cuttingResult;

  return (
    <div className="cv-root">

      {/* hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xls,.xlsx,.XLS,.XLSX"
        style={{ display: "none" }}
        onChange={handleImportFile}
      />

      {/* ── Top bar ── */}
      <header className="cv-header no-print">
        <div className="cv-header__left">
          <button
            className={`cv-header__menu-btn${showSidebar ? " cv-header__menu-btn--active" : ""}`}
            onClick={() => setShowSidebar((v) => !v)}
            title="История сессий"
          >
            ☰
          </button>
          <div className="cv-header__name-wrap">
            <input
              className="cv-header__name"
              value={activeJob.name}
              onChange={(e) => setJobName(e.target.value)}
              placeholder="Название раскроя"
            />
            <span className={`cv-header__saving${saving ? " is-visible" : ""}`} aria-live="polite">
              сохранение…
            </span>
          </div>
        </div>

        <SettingsRow settings={activeJob.settings} onChange={updateSettings} />

        <div className="cv-header__right">
          <button
            className="cv-header__import-btn"
            title="Добавить комплект из каталога (Siena, тумбы и др.)"
            onClick={() => setShowCatalog(true)}
          >
            📦 Из каталога
          </button>
          <button
            className="cv-header__import-btn"
            title="Импорт деталей из Excel (колонки G, H — размеры; I — количество)"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing
              ? <><span className="cv-header__btn-spinner" /> Читаю…</>
              : "📥 Импорт XLS"}
          </button>
          {totalItems > 0 && (
            <span className="cv-header__count">
              {totalItems} поз. · {totalPcs} дет.
            </span>
          )}
          <button
            className="cv-header__calc-btn"
            onClick={calculate}
            disabled={calculating || totalItems === 0}
          >
            {calculating ? (
              <><span className="cv-header__btn-spinner" /> Считаю…</>
            ) : (
              "Рассчитать"
            )}
          </button>
        </div>
      </header>

      {/* Import notification */}
      {importWarn && (
        <div className={`cv-import-notice no-print${importWarn.startsWith("Ошибка") ? " cv-import-notice--error" : ""}`}>
          {importWarn}
          <button className="cv-import-notice__close" onClick={() => setImportWarn(null)}>✕</button>
        </div>
      )}

      {error && (
        <div className="cv-error no-print">
          <span>⚠ {error}</span>
        </div>
      )}

      {/* ── Body ── */}
      <div className="cv-body">

        {/* Jobs sidebar (overlay) */}
        {showSidebar && (
          <JobSidebar
            jobs={jobs}
            activeJobId={activeJob.id}
            loading={loading}
            onOpen={(j) => { openJob(j); setShowSidebar(false); }}
            onDelete={deleteJob}
            onNewJob={() => { createNewJob(); setShowSidebar(false); }}
            onClose={() => setShowSidebar(false)}
          />
        )}

        {/* Items list */}
        <div className="cv-left no-print">
          <div className="cv-left__head">
            <span className="cv-left__title">Позиции</span>
            {totalItems > 0 && (
              <span className="cv-left__count">{totalItems}</span>
            )}
            <div className="cv-left__head-actions">
              <button
                className="cv-left__catalog-btn"
                onClick={() => setShowCatalog(true)}
                title="Добавить комплект из каталога"
              >
                Каталог
              </button>
              <button
                className={`cv-left__add-btn${showAddForm ? " cv-left__add-btn--active" : ""}`}
                onClick={() => setShowAddForm((v) => !v)}
                title={showAddForm ? "Закрыть форму добавления" : "Добавить деталь вручную"}
              >
                {showAddForm ? "✕" : "+"}
              </button>
            </div>
          </div>
          <div className="cv-left__scroll">
            <ItemsPanel
              items={activeJob.items}
              accountEdgeBand={!!activeJob.settings.accountEdgeBand}
              onQty={updateItemQty}
              onTurn={toggleItemTurn}
              onRemove={removeItem}
              showAddForm={showAddForm}
              existingMaterials={existingMaterials}
              onAdd={handleAddItem}
              onCloseForm={() => setShowAddForm(false)}
            />
          </div>
        </div>

        {/* Result */}
        <div className="cv-result">
          {hasResult ? (
            <CuttingPlanView
              plan={cuttingResult}
              onClose={() => setCuttingResult(null)}
            />
          ) : (
            <div className="cv-result__placeholder">
              <div className="cv-result__placeholder-icon">✂</div>
              <div className="cv-result__placeholder-title">
                {totalItems === 0 ? "Добавьте позиции" : "Готово к расчёту"}
              </div>
              <div className="cv-result__placeholder-sub">
                {totalItems === 0
                  ? "Выберите элементы в «Отгрузке» и нажмите кнопку «✂ Раскрой»"
                  : `${totalPcs} дет. из ${totalItems} позиций — нажмите «Рассчитать»`}
              </div>
              {totalItems > 0 && (
                <button
                  className="cv-result__calc-link"
                  onClick={calculate}
                  disabled={calculating}
                >
                  {calculating ? "Считаю…" : "Рассчитать раскрой"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <CuttingCatalogDialog
        open={showCatalog}
        onClose={() => setShowCatalog(false)}
        onAddItems={handleAddFromCatalog}
        existingMaterials={existingMaterials}
      />
    </div>
  );
}
