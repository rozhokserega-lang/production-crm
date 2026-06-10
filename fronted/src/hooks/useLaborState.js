import { useCallback, useEffect, useState } from "react";

const LABOR_SUB_VIEWS = new Set(["total", "orders", "planner"]);

export function useLaborState(view) {
  const [laborSort, setLaborSort] = useState("total_desc");
  const [laborSubView, setLaborSubViewRaw] = useState("planner");
  const setLaborSubView = useCallback((next) => {
    setLaborSubViewRaw(LABOR_SUB_VIEWS.has(next) ? next : "planner");
  }, []);
  const [laborPlannerQtyByGroup, setLaborPlannerQtyByGroup] = useState({});
  const [laborRows, setLaborRows] = useState([]);
  const [laborImportedRows, setLaborImportedRows] = useState([]);
  const [laborSaveSelected, setLaborSaveSelected] = useState({});
  const [laborSavingByKey, setLaborSavingByKey] = useState({});
  const [laborSavedByKey, setLaborSavedByKey] = useState({});
  const [laborNormsRows, setLaborNormsRows] = useState([]);

  useEffect(() => {
    if (view !== "labor") setLaborSubView("planner");
  }, [view, setLaborSubView]);

  useEffect(() => {
    if (view === "labor" && !LABOR_SUB_VIEWS.has(laborSubView)) {
      setLaborSubView("planner");
    }
  }, [view, laborSubView, setLaborSubView]);

  return {
    laborSort,
    setLaborSort,
    laborSubView,
    setLaborSubView,
    laborPlannerQtyByGroup,
    setLaborPlannerQtyByGroup,
    laborRows,
    setLaborRows,
    laborImportedRows,
    setLaborImportedRows,
    laborSaveSelected,
    setLaborSaveSelected,
    laborSavingByKey,
    setLaborSavingByKey,
    laborSavedByKey,
    setLaborSavedByKey,
    laborNormsRows,
    setLaborNormsRows,
  };
}
