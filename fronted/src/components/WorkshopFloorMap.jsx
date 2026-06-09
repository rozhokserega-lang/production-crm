import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  buildWorkshopFloorMap,
  FLOOR_ZONE_LABELS,
} from "../app/workshopFloorMapHelpers";
import { stripPlanItemMeta } from "../app/orderHelpers";

const STATUS_LABELS = {
  queue: "очередь",
  in_work: "в работе",
  waiting: "ожидание",
  ready: "готово",
  ship: "к отправке",
};

function orderStatusKey(order, zoneKey, isInWork) {
  if (zoneKey === "wait_pilka" || zoneKey === "wait_kromka" || zoneKey === "wait_pras") return "queue";
  const pilka = String(order?.pilkaStatus || order?.pilka || "");
  const kromka = String(order?.kromkaStatus || order?.kromka || "");
  const pras = String(order?.prasStatus || order?.pras || "");
  if (zoneKey === "pilka" && isInWork(pilka)) return "in_work";
  if ((zoneKey === "kromka_top" || zoneKey === "kromka_bottom") && isInWork(kromka)) return "in_work";
  if ((zoneKey === "pras_top" || zoneKey === "pras_bottom") && isInWork(pras)) return "in_work";
  if (zoneKey === "assembly_ready") return "ready";
  if (zoneKey === "ready_to_ship") return "ship";
  return "waiting";
}

/** @deprecated legacy name kept for HMR / cached chunks */
function orderStatusBadge(order, zoneKey, isInWork) {
  return STATUS_LABELS[orderStatusKey(order, zoneKey, isInWork)] || "ожидание";
}

function FloorOrderPanel({ zone, orders, isInWork, pinned }) {
  if (!zone) {
    return (
      <div className="workshop-floor__panel workshop-floor__panel--empty">
        Наведите или нажмите на станок / очередь — здесь появится список заказов
      </div>
    );
  }

  const { title, subtitle, key: zoneKey, kind } = zone;

  return (
    <div className={`workshop-floor__panel${pinned ? " is-pinned" : ""}`}>
      <div className="workshop-floor__panel-head">
        <div>
          <h3 className="workshop-floor__panel-title">{title}</h3>
          {subtitle ? <p className="workshop-floor__panel-sub">{subtitle}</p> : null}
        </div>
        <span className={`workshop-floor__panel-badge workshop-floor__panel-badge--${kind}`}>
          {orders.length} {orders.length === 1 ? "заказ" : orders.length < 5 ? "заказа" : "заказов"}
        </span>
      </div>
      {orders.length === 0 ? (
        <p className="workshop-floor__panel-empty">Нет заказов в этой зоне</p>
      ) : (
        <ul className="workshop-floor__panel-list">
          {orders.map((row) => {
            const o = row.order || {};
            const id = row.orderId || String(o?.orderId || o?.order_id || "").trim();
            const item = stripPlanItemMeta(String(o?.item || "")).trim() || "—";
            const qty = Number(o?.qty || 0);
            const week = String(o?.week || "").trim();
            const statusKey = orderStatusKey(o, zoneKey, isInWork);
            return (
              <li key={id || row.label} className="workshop-floor__panel-row">
                <div className="workshop-floor__panel-row-main">
                  <span className="workshop-floor__panel-id">#{id || "?"}</span>
                  <span className="workshop-floor__panel-item">{item}</span>
                </div>
                <div className="workshop-floor__panel-row-meta">
                  {qty > 0 ? <span>{qty} шт</span> : null}
                  {week ? <span>план {week}</span> : null}
                  <span className={`workshop-floor__panel-status workshop-floor__panel-status--${statusKey}`}>
                    {STATUS_LABELS[statusKey]}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MachineSaw({ spinning = false }) {
  return (
    <svg className="workshop-floor__machine-svg" viewBox="0 0 120 100" aria-hidden>
      <rect x="8" y="58" width="104" height="28" rx="4" fill="#94a3b8" />
      <rect x="14" y="48" width="92" height="14" rx="2" fill="#cbd5e1" />
      <rect x="18" y="40" width="50" height="10" rx="1" fill="#d97706" opacity="0.9" />
      <g transform="translate(82 56)">
        <g className="wf-anim-saw-blade">
          {spinning ? (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 0 0"
              to="360 0 0"
              dur="0.75s"
              repeatCount="indefinite"
            />
          ) : null}
          <circle r="17" fill="#4b5563" />
          <circle r="17" fill="none" stroke="#fbbf24" strokeWidth="3.5" strokeDasharray="3.2 4.8" strokeLinecap="round" />
          <circle r="12" fill="#6b7280" />
          <circle r="4" fill="#e5e7eb" stroke="#374151" strokeWidth="1" />
        </g>
      </g>
    </svg>
  );
}

function MachineKromka() {
  const clipId = useId().replace(/:/g, "");
  const beltDots = [18, 30, 42, 54, 66, 78, 90, 102];
  return (
    <svg className="workshop-floor__machine-svg" viewBox="0 0 120 100" aria-hidden>
      <rect x="6" y="42" width="108" height="36" rx="6" fill="#0369a1" />
      <rect x="12" y="48" width="96" height="22" rx="3" fill="#0ea5e9" />
      <circle cx="22" cy="59" r="8" fill="#38bdf8" stroke="#0284c7" strokeWidth="2" />
      <circle cx="98" cy="59" r="8" fill="#38bdf8" stroke="#0284c7" strokeWidth="2" />
      <rect x="40" y="30" width="40" height="14" rx="3" fill="#0284c7" />
      <clipPath id={clipId}>
        <rect x="14" y="66" width="92" height="8" rx="2" />
      </clipPath>
      <g className="wf-anim-kromka-belt" clipPath={`url(#${clipId})`}>
        <rect x="14" y="66" width="92" height="8" rx="2" fill="#0c4a6e" opacity="0.35" />
        <g className="wf-anim-kromka-belt-track">
          {beltDots.map((x) => (
            <circle key={x} cx={x} cy="70" r="2.5" fill="#bae6fd" />
          ))}
          {beltDots.map((x) => (
            <circle key={`dup-${x}`} cx={x + 96} cy="70" r="2.5" fill="#bae6fd" />
          ))}
        </g>
      </g>
    </svg>
  );
}

function MachinePras() {
  return (
    <svg className="workshop-floor__machine-svg" viewBox="0 0 120 100" aria-hidden>
      <rect x="14" y="62" width="92" height="24" rx="4" fill="#94a3b8" />
      <rect x="22" y="68" width="76" height="12" rx="2" fill="#cbd5e1" />
      <g className="wf-anim-pras-drill">
        <rect x="34" y="12" width="18" height="52" rx="3" fill="#6d28d9" />
        <path d="M43 30 L43 58" stroke="#c4b5fd" strokeWidth="3" strokeLinecap="round" />
        <rect x="38" y="8" width="10" height="8" rx="2" fill="#a78bfa" stroke="#7c3aed" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

function MachineAssembly() {
  return (
    <svg className="workshop-floor__machine-svg" viewBox="0 0 120 100" aria-hidden>
      <rect x="20" y="52" width="36" height="28" rx="3" fill="#86efac" stroke="#16a34a" strokeWidth="2" />
      <rect x="44" y="40" width="36" height="28" rx="3" fill="#4ade80" stroke="#16a34a" strokeWidth="2" />
      <circle cx="88" cy="28" r="12" fill="#16a34a" />
      <path d="M83 28 L86 31 L93 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MachineGazelle() {
  return (
    <svg className="workshop-floor__machine-svg" viewBox="0 0 120 100" aria-hidden>
      <rect x="8" y="48" width="72" height="28" rx="4" fill="#e2e8f0" stroke="#64748b" strokeWidth="2" />
      <path d="M80 48 L104 48 L112 58 L112 76 L80 76 Z" fill="#94a3b8" stroke="#475569" strokeWidth="2" />
      <rect x="86" y="52" width="18" height="12" rx="2" fill="#bae6fd" stroke="#0284c7" strokeWidth="1.5" />
      <circle cx="28" cy="78" r="10" fill="#334155" />
      <circle cx="28" cy="78" r="4" fill="#94a3b8" />
      <circle cx="96" cy="78" r="10" fill="#334155" />
      <circle cx="96" cy="78" r="4" fill="#94a3b8" />
      <rect x="14" y="54" width="56" height="16" rx="2" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
      <path d="M8 62 H6 M112 62 H114" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MachineBuffer() {
  return (
    <svg className="workshop-floor__machine-svg workshop-floor__machine-svg--buffer" viewBox="0 0 80 100" aria-hidden>
      <rect x="10" y="30" width="24" height="18" rx="2" fill="#c7d2fe" stroke="#818cf8" strokeWidth="1" />
      <rect x="18" y="48" width="24" height="18" rx="2" fill="#a5b4fc" stroke="#6366f1" strokeWidth="1" />
      <rect x="34" y="36" width="24" height="18" rx="2" fill="#e0e7ff" stroke="#818cf8" strokeWidth="1" />
    </svg>
  );
}

function MachineWarehouse() {
  return (
    <svg className="workshop-floor__machine-svg" viewBox="0 0 120 100" aria-hidden>
      <rect x="14" y="62" width="76" height="10" rx="1" fill="#a8a29e" stroke="#78716c" strokeWidth="1" />
      <rect x="18" y="52" width="76" height="10" rx="1" fill="#d6d3d1" stroke="#a8a29e" strokeWidth="1" />
      <rect x="22" y="42" width="76" height="10" rx="1" fill="#e7e5e4" stroke="#a8a29e" strokeWidth="1" />
      <rect x="26" y="32" width="76" height="10" rx="1" fill="#f5f5f4" stroke="#78716c" strokeWidth="1.5" />
      <rect x="30" y="22" width="76" height="10" rx="1" fill="#fafaf9" stroke="#57534e" strokeWidth="1.5" />
      <path d="M30 27 H106 M34 37 H102 M38 47 H98" stroke="#d6d3d1" strokeWidth="0.75" opacity="0.8" />
    </svg>
  );
}

function MachineWarehouseKit() {
  return (
    <svg className="workshop-floor__machine-svg" viewBox="0 0 120 100" aria-hidden>
      <rect x="18" y="48" width="84" height="36" rx="3" fill="#e7e5e4" stroke="#78716c" strokeWidth="2" />
      <rect x="28" y="58" width="18" height="18" rx="2" fill="#bae6fd" stroke="#0284c7" strokeWidth="1.5" />
      <rect x="52" y="58" width="18" height="18" rx="2" fill="#bae6fd" stroke="#0284c7" strokeWidth="1.5" />
      <rect x="76" y="58" width="18" height="18" rx="2" fill="#bae6fd" stroke="#0284c7" strokeWidth="1.5" />
      <rect x="34" y="22" width="14" height="26" rx="2" fill="#94a3b8" stroke="#64748b" strokeWidth="1.5" />
      <rect x="72" y="18" width="14" height="30" rx="2" fill="#94a3b8" stroke="#64748b" strokeWidth="1.5" />
      <rect x="36" y="14" width="10" height="10" rx="1" fill="#f87171" />
      <rect x="74" y="10" width="10" height="10" rx="1" fill="#f87171" />
    </svg>
  );
}

const MACHINE_ICONS = {
  pilka: MachineSaw,
  kromka: MachineKromka,
  pras: MachinePras,
  assembly: MachineAssembly,
  gazelle: MachineGazelle,
  buffer: MachineBuffer,
  warehouse: MachineWarehouse,
};

function FloorMachine({
  zoneKey,
  zoneId,
  label,
  subtitle,
  count,
  orders,
  machineType,
  tone,
  inWork = false,
  selected = false,
  onSelect,
  onHover,
  isInWork,
}) {
  const Icon = MACHINE_ICONS[machineType] || MachineBuffer;

  return (
    <div
      className={`workshop-floor__machine workshop-floor__machine--${tone}${inWork ? ` is-in-work is-in-work--${tone}` : ""}${selected ? " is-selected" : ""}`}
      onMouseEnter={() => onHover(zoneKey)}
      onClick={() => onSelect(zoneKey, true)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(zoneKey, true); } }}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      aria-label={`${label}${subtitle ? `, ${subtitle}` : ""}, заказов: ${count}`}
    >
      <div className="workshop-floor__machine-head">
        <span className="workshop-floor__machine-stage">{zoneId}</span>
        <span className={`workshop-floor__machine-work-badge${inWork ? " is-visible" : ""}`}>
          в работе
        </span>
        <span className="workshop-floor__machine-count">{count}</span>
      </div>
      <div className="workshop-floor__machine-icon">
        <Icon spinning={machineType === "pilka" && inWork} />
      </div>
      <div className="workshop-floor__machine-meta">
        <span className="workshop-floor__machine-label">{label}</span>
        {subtitle ? <span className="workshop-floor__machine-sub">{subtitle}</span> : null}
      </div>
    </div>
  );
}

function FloorQueue({
  zoneKey,
  label,
  count,
  selected = false,
  onSelect,
  onHover,
}) {
  return (
    <div
      className={`workshop-floor__machine workshop-floor__machine--queue${count > 0 ? " has-items" : ""}${selected ? " is-selected" : ""}`}
      onMouseEnter={() => onHover(zoneKey)}
      onClick={() => onSelect(zoneKey, true)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(zoneKey, true); } }}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      aria-label={`${label}, заказов: ${count}`}
    >
      <div className="workshop-floor__machine-head workshop-floor__machine-head--queue">
        <span className="workshop-floor__machine-stage workshop-floor__machine-stage--muted">⏳</span>
        <span className="workshop-floor__machine-count">{count}</span>
      </div>
      <div className="workshop-floor__machine-icon">
        <MachineBuffer />
      </div>
      <div className="workshop-floor__machine-meta">
        <span className="workshop-floor__machine-label">{label}</span>
      </div>
    </div>
  );
}

function FloorWarehouse({ onGo, kind = "ldsp" }) {
  const isKit = kind === "kit";
  const Icon = isKit ? MachineWarehouseKit : MachineWarehouse;

  return (
    <div
      className="workshop-floor__machine workshop-floor__machine--warehouse"
      onClick={() => onGo?.()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onGo?.(); } }}
      tabIndex={0}
      role="link"
      aria-label={isKit ? "Склад заказов — перейти к комплектовке" : "Склад ЛДСП — перейти во вкладку Склад"}
    >
      <div className="workshop-floor__machine-head workshop-floor__machine-head--warehouse">
        <span className="workshop-floor__machine-stage workshop-floor__machine-stage--muted">
          {isKit ? "🏭" : "📦"}
        </span>
      </div>
      <div className="workshop-floor__machine-icon">
        <Icon />
      </div>
      <div className="workshop-floor__machine-meta">
        <span className="workshop-floor__machine-label">Склад</span>
        <span className="workshop-floor__machine-sub">{isKit ? "Заказы" : "ЛДСП"}</span>
      </div>
    </div>
  );
}

export const WorkshopFloorMap = memo(function WorkshopFloorMap({
  orders = [],
  isDone,
  isInWork,
  executorByOrder = {},
  kromkaExecutors = [],
  prasExecutors = [],
  onGoWarehouse,
  onGoWarehouseKit,
}) {
  const rootRef = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [pinned, setPinned] = useState(false);

  const map = useMemo(
    () => buildWorkshopFloorMap(orders, {
      isDone,
      isInWork,
      executorByOrder,
      kromkaExecutors,
      prasExecutors,
    }),
    [orders, isDone, isInWork, executorByOrder, kromkaExecutors, prasExecutors],
  );

  const z = map.zones;
  const ml = map.machineLabels;

  const zoneDefs = useMemo(() => ({
    wait_pilka: { key: "wait_pilka", title: FLOOR_ZONE_LABELS.wait_pilka, kind: "queue" },
    pilka: { key: "pilka", title: FLOOR_ZONE_LABELS.pilka, kind: "machine" },
    wait_kromka: { key: "wait_kromka", title: FLOOR_ZONE_LABELS.wait_kromka, kind: "queue" },
    kromka_top: { key: "kromka_top", title: "Кромочник", subtitle: ml.kromka_top, kind: "machine" },
    kromka_bottom: { key: "kromka_bottom", title: "Кромочник", subtitle: ml.kromka_bottom, kind: "machine" },
    wait_pras: { key: "wait_pras", title: FLOOR_ZONE_LABELS.wait_pras, kind: "queue" },
    pras_top: { key: "pras_top", title: "Присадка", subtitle: ml.pras_top, kind: "machine" },
    pras_bottom: { key: "pras_bottom", title: "Присадка", subtitle: ml.pras_bottom, kind: "machine" },
    assembly_ready: { key: "assembly_ready", title: FLOOR_ZONE_LABELS.assembly_ready, kind: "machine" },
    ready_to_ship: { key: "ready_to_ship", title: FLOOR_ZONE_LABELS.ready_to_ship, kind: "machine" },
  }), [ml]);

  const activeKey = selectedKey;
  const activeZone = activeKey ? (zoneDefs[activeKey] || null) : null;
  const activeOrders = activeKey ? (z[activeKey] || []) : [];

  useEffect(() => {
    if (selectedKey) return;
    const firstWithOrders = [
      "wait_pilka", "wait_kromka", "wait_pras", "pilka",
      "kromka_top", "kromka_bottom", "pras_top", "pras_bottom",
      "assembly_ready", "ready_to_ship",
    ].find((k) => (z[k] || []).length > 0);
    if (firstWithOrders) setSelectedKey(firstWithOrders);
  }, [selectedKey, z]);

  const handleSelect = useCallback((key, pin = false) => {
    setSelectedKey(key);
    if (pin) setPinned(true);
  }, []);

  const handleHover = useCallback((key) => {
    if (!pinned) setSelectedKey(key);
  }, [pinned]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = rootRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      el.classList.toggle("workshop-floor--pseudo-fs");
      setFullscreen((v) => !v);
    }
  }, []);

  const hasInWork = (rows, zoneKey) =>
    rows.some((row) => orderStatusKey(row.order, zoneKey, isInWork) === "in_work");

  return (
    <div
      ref={rootRef}
      className={`workshop-floor workshop-floor--immersive${fullscreen ? " workshop-floor--pseudo-fs" : ""}`}
    >
      <header className="workshop-floor__header">
        <div>
          <h2 className="workshop-floor__title">Карта цеха</h2>
          <p className="workshop-floor__hint">
            Нажмите на зону — список заказов появится снизу
            {pinned ? " · список закреплён" : ""}
          </p>
        </div>
        <div className="workshop-floor__header-actions">
          {pinned ? (
            <button type="button" className="workshop-floor__fs-btn workshop-floor__fs-btn--ghost" onClick={() => setPinned(false)}>
              Открепить
            </button>
          ) : null}
          <button
            type="button"
            className="workshop-floor__fs-btn"
            onClick={toggleFullscreen}
          >
            {fullscreen ? "✕ Выйти" : "⛶ На весь экран"}
          </button>
        </div>
      </header>

      <div className="workshop-floor__body">
        <div className="workshop-floor__canvas">
          <div className="workshop-floor__lane workshop-floor__lane--warehouse">
            <FloorWarehouse onGo={onGoWarehouse} />
          </div>

          <div className="workshop-floor__lane">
            <FloorQueue
              zoneKey="wait_pilka"
              label={FLOOR_ZONE_LABELS.wait_pilka}
              count={z.wait_pilka.length}
              selected={activeKey === "wait_pilka"}
              onSelect={handleSelect}
              onHover={handleHover}
            />
          </div>

          <div className="workshop-floor__lane">
            <FloorMachine
              zoneKey="pilka"
              zoneId="1"
              label={FLOOR_ZONE_LABELS.pilka}
              count={z.pilka.length}
              orders={z.pilka}
              machineType="pilka"
              tone="pilka"
              inWork={hasInWork(z.pilka, "pilka")}
              selected={activeKey === "pilka"}
              onSelect={handleSelect}
              onHover={handleHover}
              isInWork={isInWork}
            />
          </div>

          <div className="workshop-floor__lane">
            <FloorQueue
              zoneKey="wait_kromka"
              label={FLOOR_ZONE_LABELS.wait_kromka}
              count={z.wait_kromka.length}
              selected={activeKey === "wait_kromka"}
              onSelect={handleSelect}
              onHover={handleHover}
            />
          </div>

          <div className="workshop-floor__lane workshop-floor__lane--stack">
            <FloorMachine
              zoneKey="kromka_top"
              zoneId="2"
              label="Кромочник"
              subtitle={ml.kromka_top}
              count={z.kromka_top.length}
              orders={z.kromka_top}
              machineType="kromka"
              tone="kromka"
              inWork={hasInWork(z.kromka_top, "kromka_top")}
              selected={activeKey === "kromka_top"}
              onSelect={handleSelect}
              onHover={handleHover}
              isInWork={isInWork}
            />
            <FloorMachine
              zoneKey="kromka_bottom"
              zoneId="2"
              label="Кромочник"
              subtitle={ml.kromka_bottom}
              count={z.kromka_bottom.length}
              orders={z.kromka_bottom}
              machineType="kromka"
              tone="kromka"
              inWork={hasInWork(z.kromka_bottom, "kromka_bottom")}
              selected={activeKey === "kromka_bottom"}
              onSelect={handleSelect}
              onHover={handleHover}
              isInWork={isInWork}
            />
          </div>

          <div className="workshop-floor__lane">
            <FloorQueue
              zoneKey="wait_pras"
              label={FLOOR_ZONE_LABELS.wait_pras}
              count={z.wait_pras.length}
              selected={activeKey === "wait_pras"}
              onSelect={handleSelect}
              onHover={handleHover}
            />
          </div>

          <div className="workshop-floor__lane workshop-floor__lane--stack">
            <FloorMachine
              zoneKey="pras_top"
              zoneId="3"
              label="Присадка"
              subtitle={ml.pras_top}
              count={z.pras_top.length}
              orders={z.pras_top}
              machineType="pras"
              tone="pras"
              inWork={hasInWork(z.pras_top, "pras_top")}
              selected={activeKey === "pras_top"}
              onSelect={handleSelect}
              onHover={handleHover}
              isInWork={isInWork}
            />
            <FloorMachine
              zoneKey="pras_bottom"
              zoneId="3"
              label="Присадка"
              subtitle={ml.pras_bottom}
              count={z.pras_bottom.length}
              orders={z.pras_bottom}
              machineType="pras"
              tone="pras"
              inWork={hasInWork(z.pras_bottom, "pras_bottom")}
              selected={activeKey === "pras_bottom"}
              onSelect={handleSelect}
              onHover={handleHover}
              isInWork={isInWork}
            />
          </div>

          <div className="workshop-floor__lane">
            <FloorMachine
              zoneKey="assembly_ready"
              zoneId="4"
              label={FLOOR_ZONE_LABELS.assembly_ready}
              count={z.assembly_ready.length}
              orders={z.assembly_ready}
              machineType="assembly"
              tone="assembly"
              selected={activeKey === "assembly_ready"}
              onSelect={handleSelect}
              onHover={handleHover}
              isInWork={isInWork}
            />
          </div>

          <div className="workshop-floor__lane">
            <FloorMachine
              zoneKey="ready_to_ship"
              zoneId="5"
              label={FLOOR_ZONE_LABELS.ready_to_ship}
              subtitle="Газель"
              count={z.ready_to_ship.length}
              orders={z.ready_to_ship}
              machineType="gazelle"
              tone="ship"
              selected={activeKey === "ready_to_ship"}
              onSelect={handleSelect}
              onHover={handleHover}
              isInWork={isInWork}
            />
          </div>

          <div className="workshop-floor__lane workshop-floor__lane--warehouse">
            <FloorWarehouse kind="kit" onGo={onGoWarehouseKit} />
          </div>
        </div>

        <FloorOrderPanel
          zone={activeZone}
          orders={activeOrders}
          isInWork={isInWork}
          pinned={pinned}
        />
      </div>

      <footer className="workshop-floor__legend">
        <span><b>📦</b> склад</span>
        <span><b>⏳</b> очередь ожидания</span>
        <span><b>1</b> пила</span>
        <span><b>2</b> {ml.kromka_top} / {ml.kromka_bottom}</span>
        <span><b>3</b> {ml.pras_top} / {ml.pras_bottom}</span>
        <span><b>4</b> к сборке</span>
        <span><b>5</b> газель — к отправке</span>
        <span><b>🏭</b> склад заказов</span>
      </footer>
    </div>
  );
});
