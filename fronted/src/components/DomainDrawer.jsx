export function DomainDrawer({ open, setOpen, view, setView }) {
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
      <aside
        className={`domain-drawer ${open ? "open" : ""}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
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
