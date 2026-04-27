import { VIEWS } from "../app/appConstants";

interface ViewSwitcherProps {
  view: string;
  setView: (view: string) => void;
  setTab: (tab: string) => void;
  canAdminSettings: boolean;
}

export function ViewSwitcher({ view, setView, setTab, canAdminSettings }: ViewSwitcherProps) {
  return (
    <div className="view-switcher">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          className={view === v.id ? "active" : ""}
          onClick={() => {
            setView(v.id);
            setTab("");
          }}
        >
          {v.label}
        </button>
      ))}
      {canAdminSettings && (
        <button
          className={view === "admin" ? "active" : ""}
          onClick={() => {
            setView("admin");
            setTab("");
          }}
        >
          Admin
        </button>
      )}
    </div>
  );
}
