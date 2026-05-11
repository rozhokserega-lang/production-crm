import { useEffect, useState } from "react";

const MOBILE_DRAWER_MQ = "(max-width: 600px)";

export function DomainDrawer({ open, setOpen, view, setView }) {
  const [isMobileLayout, setIsMobileLayout] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(MOBILE_DRAWER_MQ);
    const sync = () => setIsMobileLayout(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const isFurnitureDomain = view !== "metalProcess" && view !== "warehouseMissing";
  const isWarehouseDomain = view === "warehouseMissing";
  const goFurniture = () => {
    setView("shipment");
    setOpen(false);
  };
  const goWarehouse = () => {
    setView("warehouseMissing");
    setOpen(false);
  };
  const goMetalProcess = () => {
    setView("metalProcess");
    setOpen(false);
  };

  return (
    <>
      {open && isMobileLayout && (
        <button
          type="button"
          className="domain-drawer-backdrop"
          aria-label="Закрыть панель режима"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`domain-drawer ${open ? "open" : ""}`}
        onMouseEnter={() => {
          if (!isMobileLayout) setOpen(true);
        }}
        onMouseLeave={() => {
          if (!isMobileLayout) setOpen(false);
        }}
      >
        <div className="domain-drawer__head-row">
          <div className="domain-drawer__head">Режим работы</div>
          {isMobileLayout && (
            <button
              type="button"
              className="domain-drawer__close"
              aria-label="Закрыть"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          )}
        </div>
        <button
          type="button"
          className={isFurnitureDomain ? "tab active" : "tab"}
          onClick={goFurniture}
        >
          <span className="domain-drawer__icon" aria-hidden="true">🪑</span>
          Мебель
        </button>
        <button
          type="button"
          className={view === "metalProcess" ? "tab active" : "tab"}
          onClick={goMetalProcess}
        >
          <span className="domain-drawer__icon" aria-hidden="true">⚙️</span>
          Металл
        </button>
        <button
          type="button"
          className={isWarehouseDomain ? "tab active" : "tab"}
          onClick={goWarehouse}
        >
          <span className="domain-drawer__icon" aria-hidden="true">🏭</span>
          Склад
        </button>
      </aside>
    </>
  );
}
