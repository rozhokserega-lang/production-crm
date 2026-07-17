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

  // На телефоне — компактный сегментированный переключатель (3 кнопки в ряд),
  // без выезжающего drawer и без плавающей кнопки «Режим».
  if (isMobileLayout) {
    return (
      <div className="domain-switch" role="tablist" aria-label="Режим работы">
        <button
          type="button"
          role="tab"
          aria-selected={isFurnitureDomain}
          className={`domain-switch__btn${isFurnitureDomain ? " active" : ""}`}
          onClick={goFurniture}
        >
          <span aria-hidden="true">🪑</span> Мебель
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "metalProcess"}
          className={`domain-switch__btn${view === "metalProcess" ? " active" : ""}`}
          onClick={goMetalProcess}
        >
          <span aria-hidden="true">⚙️</span> Металл
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isWarehouseDomain}
          className={`domain-switch__btn${isWarehouseDomain ? " active" : ""}`}
          onClick={goWarehouse}
        >
          <span aria-hidden="true">🏭</span> Склад
        </button>
      </div>
    );
  }

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
