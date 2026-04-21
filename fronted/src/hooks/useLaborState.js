import { useEffect, useState } from "react";

export function useLaborState(view) {
  const [laborSort, setLaborSort] = useState("total_desc");
  const [laborSubView, setLaborSubView] = useState("total");
  const [laborPlannerQtyByGroup, setLaborPlannerQtyByGroup] = useState({});
  const [laborRows, setLaborRows] = useState([]);
  const [laborImportedRows, setLaborImportedRows] = useState([]);
  const [laborSaveSelected, setLaborSaveSelected] = useState({});
  const [laborSavingByKey, setLaborSavingByKey] = useState({});
  const [laborSavedByKey, setLaborSavedByKey] = useState({});

  useEffect(() => {
    if (view !== "labor") setLaborSubView("total");
  }, [view]);

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
  };
}
