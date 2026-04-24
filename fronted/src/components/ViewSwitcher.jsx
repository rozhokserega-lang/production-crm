import { VIEWS } from "../app/appConstants";

export function ViewSwitcher({ view, setView, setTab, canAdminSettings }) {
  return (
    <section className="view-switch">
      {VIEWS.map((v) => (
        (v.id !== "admin" || canAdminSettings) && (
        <button
          key={v.id}
          className={view === v.id ? "tab active" : "tab"}
          onClick={() => {
            setView(v.id);
            if (v.id === "workshop") setTab("pilka");
          }}
        >
          {v.label}
        </button>
        )
      ))}
    </section>
  );
}
