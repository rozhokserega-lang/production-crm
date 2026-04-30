export function DomainDrawer({ open, setOpen, view, setView }) {
  const goFurniture = () => {
    setView("shipment");
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
          className={view === "furniture" ? "tab active" : "tab"}
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
      </aside>
    </>
  );
}
